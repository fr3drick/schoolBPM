import Result from '../models/Result.js';
import Student from '../models/Student.js';
import School from '../models/School.js';
import { enqueue } from './mail/outbox.js';
import { renderResultsEmail } from './mail/templates.js';
import { summarise, positions } from './grading.js';

/**
 * Publishes an exam and queues one email per guardian.
 *
 * Two things this deliberately does not do. It does not send mail inline: the
 * outbox already owns delivery, retries and the suspended-school check, and a
 * class of forty with two guardians each is eighty provider calls that must
 * not sit inside a request. And it does not fail the publish when a student
 * has no contactable guardian — that is a data gap for the school to fix, not
 * a reason to stop the other thirty-nine families being told.
 *
 * Returns a tally the caller can show and write to the audit log.
 */
export async function publishResults(exam, actor) {
  const [students, results, school] = await Promise.all([
    Student.find({ school: exam.school, class: exam.class._id, status: 'active' })
      .sort({ lastName: 1, firstName: 1 }),
    Result.find({ exam: exam._id }).populate('subject', 'name code'),
    School.findById(exam.school).select('name contactEmail'),
  ]);

  const maxBySubject = new Map(
    exam.subjects.map((s) => [String(s.subject._id || s.subject), s.maxScore])
  );

  const byStudent = new Map();
  for (const r of results) {
    const key = String(r.student);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push({
      subject: r.subject?.name || '',
      score: r.score,
      grade: r.grade,
      remark: r.remark,
      maxScore: maxBySubject.get(String(r.subject?._id || r.subject)) || 100,
    });
  }

  // Position is computed across the whole class, so it has to be worked out
  // before any one student's message is rendered.
  const summaries = students.map((s) => ({
    student: s._id,
    ...summarise(byStudent.get(String(s._id)) || []),
  }));
  const rank = positions(summaries.filter((s) => s.count > 0));

  // Bumped first: the counter goes into every dedupe key below, so a
  // republish after a correction must not reuse the previous run's keys.
  exam.publishCount += 1;
  exam.status = 'published';
  exam.publishedAt = new Date();
  exam.publishedBy = actor?._id || null;
  await exam.save();

  const rows = [];
  let withoutResults = 0;
  let withoutGuardian = 0;

  for (const student of students) {
    const subjects = byStudent.get(String(student._id)) || [];
    if (!subjects.length) {
      withoutResults += 1;
      continue;
    }
    const recipients = student.resultRecipients();
    if (!recipients.length) {
      withoutGuardian += 1;
      continue;
    }

    const summary = summaries.find((s) => String(s.student) === String(student._id));
    for (const guardian of recipients) {
      const { subject, html, text } = renderResultsEmail({
        guardianName: guardian.name,
        studentName: [student.firstName, student.lastName].filter(Boolean).join(' '),
        schoolName: school?.name || '',
        className: exam.class?.name || '',
        term: exam.term,
        session: exam.session,
        subjects,
        summary,
        position: rank.get(String(student._id)) || null,
        classSize: summaries.filter((s) => s.count > 0).length,
      });

      rows.push({
        school: exam.school,
        to: guardian.email,
        toName: guardian.name,
        // The mailbox stays ours; only the display name is the school's.
        fromName: school?.name || undefined,
        replyTo: school?.contactEmail || '',
        subject,
        html,
        text,
        // Per publish run, so a correction reaches the guardian instead of
        // colliding with the first message and being dropped as a duplicate.
        dedupeKey: `exam:${exam._id}:v${exam.publishCount}:${student._id}:${guardian.email}`,
      });
    }
  }

  const queued = await enqueue(rows);
  return {
    queued,
    guardians: rows.length,
    students: students.length - withoutResults - withoutGuardian,
    withoutResults,
    withoutGuardian,
  };
}
