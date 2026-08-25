import { Router } from 'express';
import Exam from '../models/Exam.js';
import Result from '../models/Result.js';
import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import { requireAuth, requireSchool, requireModule, permit } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';
import { summarise, positions } from '../services/grading.js';
import { buildReportCard } from '../services/report-card-pdf.js';

const router = Router();
router.use(requireAuth, requireSchool, requireModule('reports'));

/**
 * A report card is an exam's results plus the term's attendance for the same
 * class — which is exactly why the module requires both `exams` and
 * `attendance`, and why switching either off has to cascade to here.
 */
async function loadExam(req, id) {
  const exam = await Exam.findOne({ _id: id, school: req.user.school._id })
    .populate('class', 'name level')
    .populate('subjects.subject', 'name code');
  if (!exam) throw httpError(404, 'Exam not found');
  return exam;
}

/** Attendance for a class over the window the exam covers. */
async function attendanceFor(schoolId, classId, from, to) {
  const match = { school: schoolId, class: classId };
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = from;
    if (to) match.date.$lte = to;
  }
  const rows = await Attendance.aggregate([
    { $match: match },
    { $unwind: '$records' },
    {
      $group: {
        _id: '$records.student',
        sessions: { $sum: 1 },
        attended: {
          $sum: { $cond: [{ $in: ['$records.status', ['present', 'late']] }, 1, 0] },
        },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

/** Who has a report card available, and what is missing for those who do not. */
router.get('/exam/:id', permit('reports.view', 'reports.issue'), async (req, res) => {
  const exam = await loadExam(req, req.params.id);
  const students = await Student.find({
    school: req.user.school._id, class: exam.class._id, status: 'active',
  }).sort({ lastName: 1, firstName: 1 }).select('admissionNumber firstName lastName guardians');

  const maxBySubject = new Map(exam.subjects.map((s) => [String(s.subject._id), s.maxScore]));
  const results = await Result.find({ exam: exam._id }).select('student score subject');
  const byStudent = new Map();
  for (const r of results) {
    const key = String(r.student);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push({ score: r.score, maxScore: maxBySubject.get(String(r.subject)) || 100 });
  }

  const attendance = await attendanceFor(req.user.school._id, exam.class._id);
  const summaries = students.map((s) => ({
    student: s._id, ...summarise(byStudent.get(String(s._id)) || []),
  }));
  const rank = positions(summaries.filter((s) => s.count > 0));

  res.json({
    exam,
    students: students.map((s) => {
      const summary = summaries.find((x) => String(x.student) === String(s._id));
      const att = attendance.get(String(s._id));
      return {
        student: s._id,
        admissionNumber: s.admissionNumber,
        name: `${s.lastName}, ${s.firstName}`,
        subjects: summary.count,
        average: summary.average,
        position: rank.get(String(s._id)) || null,
        attendanceRate: att?.sessions ? Math.round((att.attended / att.sessions) * 1000) / 10 : null,
        guardianCount: (s.guardians || []).filter((g) => g.email).length,
        ready: summary.count > 0,
      };
    }),
  });
});

/** One student's report card as a PDF. */
router.get('/exam/:id/student/:studentId', permit('reports.view', 'reports.issue'), async (req, res) => {
  const exam = await loadExam(req, req.params.id);
  const student = await Student.findOne({
    _id: req.params.studentId, school: req.user.school._id, class: exam.class._id,
  });
  if (!student) throw httpError(404, 'Student not found in this class');

  const attendance = await attendanceFor(req.user.school._id, exam.class._id);
  const pdf = await buildReportCard({
    exam,
    student,
    school: req.user.school,
    attendance: attendance.get(String(student._id)) || null,
  });

  logAudit(req.user, 'reports.issue', 'exam', exam._id, { student: student.admissionNumber });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="report-${student.admissionNumber}-${exam.session.replace('/', '-')}-${exam.term}.pdf"`
  );
  res.send(pdf);
});

export default router;
