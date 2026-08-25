import { Router } from 'express';
import Exam, { TERMS } from '../models/Exam.js';
import Result from '../models/Result.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import { requireAuth, requireSchool, requireModule, permit } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';
import { gradeFor, summarise, positions } from '../services/grading.js';
import { publishResults } from '../services/results-publish.js';
import { buildResultSheet } from '../services/result-pdf.js';

const router = Router();
router.use(requireAuth, requireSchool, requireModule('exams'));

/** Scopes every lookup to the caller's school, so an id from elsewhere 404s. */
async function findExam(req, id) {
  const exam = await Exam.findOne({ _id: id, school: req.user.school._id })
    .populate('class', 'name level')
    .populate('subjects.subject', 'name code');
  if (!exam) throw httpError(404, 'Exam not found');
  return exam;
}

async function cleanExam(body, schoolId) {
  const session = String(body?.session || '').trim();
  const term = String(body?.term || '').trim().toLowerCase();
  if (!/^\d{4}\/\d{4}$/.test(session)) throw httpError(400, 'Session must look like 2026/2027');
  if (!TERMS.includes(term)) throw httpError(400, `Term must be one of: ${TERMS.join(', ')}`);

  const klass = await Class.findOne({ _id: body?.class, school: schoolId });
  if (!klass) throw httpError(400, 'Class not found in this school');

  const rawSubjects = Array.isArray(body?.subjects) ? body.subjects : [];
  if (!rawSubjects.length) throw httpError(400, 'An exam needs at least one subject');

  // Resolved in one query: a per-subject lookup would let a caller probe
  // another school's ids by timing, and is slower for no reason.
  const ids = rawSubjects.map((s) => s?.subject).filter(Boolean);
  const found = await Subject.find({ _id: { $in: ids }, school: schoolId }).select('_id');
  const known = new Set(found.map((s) => String(s._id)));

  const seen = new Set();
  const subjects = rawSubjects.map((s) => {
    const id = String(s?.subject || '');
    if (!known.has(id)) throw httpError(400, 'One of those subjects is not in this school');
    if (seen.has(id)) throw httpError(400, 'The same subject is listed twice');
    seen.add(id);
    const maxScore = Number(s?.maxScore ?? 100);
    if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 1000) {
      throw httpError(400, 'Maximum score must be between 1 and 1000');
    }
    return { subject: id, maxScore };
  });

  return { class: klass._id, session, term, name: String(body?.name || '').trim(), subjects };
}

router.get('/', permit('exams.manage', 'results.enter', 'results.view'), async (req, res) => {
  const filter = { school: req.user.school._id };
  if (req.query.class) filter.class = req.query.class;
  if (req.query.session) filter.session = String(req.query.session);
  if (req.query.term) filter.term = String(req.query.term);
  if (req.query.status) filter.status = String(req.query.status);

  const exams = await Exam.find(filter)
    .populate('class', 'name level')
    .populate('subjects.subject', 'name code')
    .sort({ session: -1, term: 1, createdAt: -1 });

  // Entered-vs-expected, so the list shows at a glance what is still
  // outstanding rather than making someone open each exam to find out.
  const counts = await Result.aggregate([
    { $match: { exam: { $in: exams.map((e) => e._id) } } },
    { $group: { _id: '$exam', entered: { $sum: 1 } } },
  ]);
  const enteredBy = new Map(counts.map((c) => [String(c._id), c.entered]));

  const rosters = await Student.aggregate([
    { $match: { school: req.user.school._id, status: 'active' } },
    { $group: { _id: '$class', students: { $sum: 1 } } },
  ]);
  const rosterBy = new Map(rosters.map((r) => [String(r._id), r.students]));

  res.json({
    exams: exams.map((e) => {
      const roll = rosterBy.get(String(e.class?._id)) || 0;
      return {
        ...e.toJSON(),
        entered: enteredBy.get(String(e._id)) || 0,
        expected: roll * e.subjects.length,
        roll,
      };
    }),
  });
});

router.get('/:id', permit('exams.manage', 'results.enter', 'results.view'), async (req, res) => {
  res.json({ exam: await findExam(req, req.params.id) });
});

router.post('/', permit('exams.manage'), async (req, res) => {
  const data = await cleanExam(req.body, req.user.school._id);
  const exam = await Exam.create({ ...data, school: req.user.school._id });
  logAudit(req.user, 'exams.create', 'exam', exam._id, { session: exam.session, term: exam.term });
  res.status(201).json({ exam: await findExam(req, exam._id) });
});

router.put('/:id', permit('exams.manage'), async (req, res) => {
  const exam = await findExam(req, req.params.id);
  if (exam.status === 'published') {
    throw httpError(400, 'A published exam cannot be edited. Reopen it first.');
  }
  const data = await cleanExam(req.body, req.user.school._id);

  // Dropping a subject that already has marks would orphan them silently.
  const removed = exam.subjects
    .map((s) => String(s.subject?._id || s.subject))
    .filter((id) => !data.subjects.some((s) => String(s.subject) === id));
  if (removed.length) {
    const orphaned = await Result.countDocuments({ exam: exam._id, subject: { $in: removed } });
    if (orphaned) {
      throw httpError(400, `Cannot remove a subject that already has ${orphaned} result(s) entered.`);
    }
  }

  Object.assign(exam, data);
  await exam.save();
  logAudit(req.user, 'exams.update', 'exam', exam._id, { session: exam.session, term: exam.term });
  res.json({ exam: await findExam(req, exam._id) });
});

/**
 * draft → open → published, and published → open to correct a mistake.
 *
 * Results may only be entered while an exam is open: a draft is still being
 * set up, and a published one has already gone to guardians, so changing it
 * underneath them has to be a deliberate reopen that lands in the audit log.
 */
router.post('/:id/status', permit('exams.manage'), async (req, res) => {
  const exam = await findExam(req, req.params.id);
  const to = String(req.body?.status || '').toLowerCase();

  const allowed = { draft: ['open'], open: ['draft', 'published'], published: ['open'] };
  if (!allowed[exam.status]?.includes(to)) {
    throw httpError(400, `An exam that is ${exam.status} cannot become ${to}.`);
  }
  if (to === 'draft' && (await Result.countDocuments({ exam: exam._id }))) {
    throw httpError(400, 'Results have already been entered. Reopening to draft would strand them.');
  }

  const from = exam.status;
  exam.status = to;
  await exam.save();
  logAudit(req.user, 'exams.status', 'exam', exam._id, { from, to });
  res.json({ exam: await findExam(req, exam._id) });
});

router.delete('/:id', permit('exams.manage'), async (req, res) => {
  const exam = await findExam(req, req.params.id);
  const entered = await Result.countDocuments({ exam: exam._id });
  if (entered) throw httpError(400, `Cannot delete: ${entered} result(s) have been entered.`);
  if (exam.status === 'published') throw httpError(400, 'A published exam cannot be deleted.');
  await exam.deleteOne();
  logAudit(req.user, 'exams.delete', 'exam', exam._id, { session: exam.session, term: exam.term });
  res.json({ ok: true });
});

/** The grid a teacher fills in: every active student in the class × subject. */
router.get('/:id/results', permit('results.enter', 'results.view', 'exams.manage'), async (req, res) => {
  const exam = await findExam(req, req.params.id);
  const students = await Student.find({
    school: req.user.school._id,
    class: exam.class._id,
    status: 'active',
  }).sort({ lastName: 1, firstName: 1 }).select('admissionNumber firstName lastName otherNames guardians');

  const results = await Result.find({ exam: exam._id });
  const byCell = new Map(results.map((r) => [`${r.student}:${r.subject}`, r]));

  const maxBySubject = new Map(exam.subjects.map((s) => [String(s.subject._id), s.maxScore]));

  const rows = students.map((student) => {
    const scores = exam.subjects.map((s) => {
      const cell = byCell.get(`${student._id}:${s.subject._id}`);
      return {
        subject: s.subject._id,
        score: cell ? cell.score : null,
        grade: cell?.grade || '',
      };
    });
    const summary = summarise(
      scores.map((sc) => ({ score: sc.score, maxScore: maxBySubject.get(String(sc.subject)) }))
    );
    return {
      student: student._id,
      admissionNumber: student.admissionNumber,
      name: `${student.lastName}, ${student.firstName}`,
      guardianCount: (student.guardians || []).filter((g) => g.email).length,
      scores,
      ...summary,
    };
  });

  // Only students with marks are ranked, matching the result sheet and the
  // guardian email. Ranking a pupil who has nothing entered yet would put
  // three of them joint-last at 0% and then move everyone once marks land.
  const rank = positions(
    rows.filter((r) => r.count > 0).map((r) => ({ student: r.student, average: r.average }))
  );
  res.json({
    exam,
    rows: rows.map((r) => ({ ...r, position: rank.get(String(r.student)) || null })),
  });
});

/**
 * Bulk score entry.
 *
 * Cells arrive as a flat list rather than a whole grid so a teacher who
 * filled in one column does not overwrite a colleague's column with the
 * blanks they happen to be looking at.
 */
router.put('/:id/results', permit('results.enter'), async (req, res) => {
  const exam = await findExam(req, req.params.id);
  if (exam.status !== 'open') {
    throw httpError(400, `Results can only be entered while an exam is open. This one is ${exam.status}.`);
  }

  const cells = Array.isArray(req.body?.cells) ? req.body.cells : [];
  if (!cells.length) throw httpError(400, 'Nothing to save');
  if (cells.length > 5000) throw httpError(400, 'Too many cells in one save');

  const maxBySubject = new Map(exam.subjects.map((s) => [String(s.subject._id), s.maxScore]));
  const roster = await Student.find({
    school: req.user.school._id,
    class: exam.class._id,
  }).select('_id');
  const inClass = new Set(roster.map((s) => String(s._id)));

  const ops = [];
  const clears = [];
  for (const cell of cells) {
    const studentId = String(cell?.student || '');
    const subjectId = String(cell?.subject || '');
    if (!inClass.has(studentId)) throw httpError(400, 'A student in that list is not in this class');
    const maxScore = maxBySubject.get(subjectId);
    if (maxScore === undefined) throw httpError(400, 'A subject in that list is not part of this exam');

    // null clears a cell — a mark entered against the wrong pupil has to be
    // removable, not just overwritable.
    if (cell.score === null || cell.score === '') {
      clears.push({ deleteOne: { filter: { exam: exam._id, student: studentId, subject: subjectId } } });
      continue;
    }

    const score = Number(cell.score);
    if (!Number.isFinite(score) || score < 0) throw httpError(400, 'Scores must be zero or more');
    if (score > maxScore) throw httpError(400, `A score of ${score} is above the maximum of ${maxScore}`);

    const { grade, remark } = gradeFor(score, maxScore);
    ops.push({
      updateOne: {
        filter: { exam: exam._id, student: studentId, subject: subjectId },
        update: {
          $set: { score, grade, remark, enteredBy: req.user._id, school: req.user.school._id },
        },
        upsert: true,
      },
    });
  }

  if (ops.length || clears.length) await Result.bulkWrite([...ops, ...clears], { ordered: false });
  logAudit(req.user, 'results.enter', 'exam', exam._id, { cells: cells.length, cleared: clears.length });
  res.json({ saved: ops.length, cleared: clears.length });
});

/**
 * Publishes an exam and mails each guardian their own child's results.
 *
 * The mail goes through the outbox like every other message on the platform,
 * so a slow provider cannot make publishing time out halfway through a class
 * and leave nobody able to tell which parents were told.
 */
router.post('/:id/publish', permit('exams.manage'), async (req, res) => {
  const exam = await findExam(req, req.params.id);
  if (exam.status !== 'open') {
    throw httpError(400, `Only an open exam can be published. This one is ${exam.status}.`);
  }
  const entered = await Result.countDocuments({ exam: exam._id });
  if (!entered) throw httpError(400, 'No results have been entered for this exam yet.');

  const outcome = await publishResults(exam, req.user);

  logAudit(req.user, 'exams.publish', 'exam', exam._id, {
    session: exam.session, term: exam.term, ...outcome,
  });
  res.json({ exam: await findExam(req, exam._id), ...outcome });
});

/** One student's result sheet as a PDF. */
router.get('/:id/students/:studentId/sheet', permit('results.view', 'exams.manage'), async (req, res) => {
  const exam = await findExam(req, req.params.id);
  const student = await Student.findOne({
    _id: req.params.studentId,
    school: req.user.school._id,
    class: exam.class._id,
  });
  if (!student) throw httpError(404, 'Student not found in this exam');

  const pdf = await buildResultSheet({ exam, student, school: req.user.school });
  logAudit(req.user, 'results.export', 'exam', exam._id, { student: student.admissionNumber });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${student.admissionNumber}-${exam.session.replace('/', '-')}-${exam.term}.pdf"`
  );
  res.send(pdf);
});

export default router;
