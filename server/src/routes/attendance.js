import { Router } from 'express';
import mongoose from 'mongoose';
import Attendance, { ATTENDANCE_STATUSES } from '../models/Attendance.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { requireAuth, requireSchool, requireModule, permit } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

const router = Router();
router.use(requireAuth, requireSchool, requireModule('attendance'));

/**
 * Normalises a date to midnight UTC.
 *
 * The register is a calendar day, not an instant. Storing whatever time the
 * teacher happened to press save would make the unique index useless — two
 * saves on the same morning would be two different documents.
 */
function dayOf(value) {
  const raw = String(value || '').trim();
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) throw httpError(400, `"${raw}" is not a valid date`);
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (day > new Date()) throw httpError(400, 'The register cannot be taken for a future date');
  return day;
}

/** The register for one class on one day, with today's roll filled in. */
router.get('/register', permit('attendance.take', 'attendance.view'), async (req, res) => {
  const klass = await Class.findOne({ _id: req.query.class, school: req.user.school._id });
  if (!klass) throw httpError(400, 'Class not found in this school');
  const date = dayOf(req.query.date);

  const [students, existing] = await Promise.all([
    Student.find({ school: req.user.school._id, class: klass._id, status: 'active' })
      .sort({ lastName: 1, firstName: 1 })
      .select('admissionNumber firstName lastName'),
    Attendance.findOne({ school: req.user.school._id, class: klass._id, date }),
  ]);

  const saved = new Map((existing?.records || []).map((r) => [String(r.student), r]));

  res.json({
    class: { _id: klass._id, name: klass.name },
    date,
    taken: !!existing,
    takenAt: existing?.updatedAt || null,
    records: students.map((s) => ({
      student: s._id,
      admissionNumber: s.admissionNumber,
      name: `${s.lastName}, ${s.firstName}`,
      // Defaulting to present matches how a register is actually taken:
      // the teacher marks the exceptions, not the whole class.
      status: saved.get(String(s._id))?.status || 'present',
      note: saved.get(String(s._id))?.note || '',
    })),
  });
});

router.put('/register', permit('attendance.take'), async (req, res) => {
  const klass = await Class.findOne({ _id: req.body?.class, school: req.user.school._id });
  if (!klass) throw httpError(400, 'Class not found in this school');
  const date = dayOf(req.body?.date);

  const incoming = Array.isArray(req.body?.records) ? req.body.records : [];
  if (!incoming.length) throw httpError(400, 'Nothing to save');

  const roster = await Student.find({ school: req.user.school._id, class: klass._id }).select('_id');
  const inClass = new Set(roster.map((s) => String(s._id)));

  const records = incoming.map((r) => {
    const student = String(r?.student || '');
    if (!inClass.has(student)) throw httpError(400, 'A student in that list is not in this class');
    const status = String(r?.status || 'present').toLowerCase();
    if (!ATTENDANCE_STATUSES.includes(status)) {
      throw httpError(400, `Status must be one of: ${ATTENDANCE_STATUSES.join(', ')}`);
    }
    return { student, status, note: String(r?.note || '').trim().slice(0, 200) };
  });

  const register = await Attendance.findOneAndUpdate(
    { school: req.user.school._id, class: klass._id, date },
    { $set: { records, takenBy: req.user._id } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const absent = records.filter((r) => r.status !== 'present').length;
  logAudit(req.user, 'attendance.take', 'class', klass._id,
    { date: date.toISOString().slice(0, 10), marked: records.length, notPresent: absent });
  res.json({ register });
});

/**
 * Attendance rates over a window.
 *
 * Computed on read rather than kept as a running total on the student: a
 * corrected register has to change the rate, and a denormalised counter that
 * silently disagrees with the registers behind it is worse than no counter.
 */
router.get('/summary', permit('attendance.view'), async (req, res) => {
  const match = { school: req.user.school._id };
  if (req.query.class) match.class = new mongoose.Types.ObjectId(String(req.query.class));
  if (req.query.from || req.query.to) {
    match.date = {};
    if (req.query.from) match.date.$gte = dayOf(req.query.from);
    if (req.query.to) match.date.$lte = dayOf(req.query.to);
  }

  const rows = await Attendance.aggregate([
    { $match: match },
    { $unwind: '$records' },
    {
      $group: {
        _id: '$records.student',
        sessions: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$records.status', 'present'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$records.status', 'late'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$records.status', 'absent'] }, 1, 0] } },
        excused: { $sum: { $cond: [{ $eq: ['$records.status', 'excused'] }, 1, 0] } },
      },
    },
  ]);

  const students = await Student.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('admissionNumber firstName lastName');
  const byId = new Map(students.map((s) => [String(s._id), s]));

  res.json({
    summary: rows
      .map((r) => {
        const s = byId.get(String(r._id));
        return {
          student: r._id,
          admissionNumber: s?.admissionNumber || '',
          name: s ? `${s.lastName}, ${s.firstName}` : '',
          sessions: r.sessions,
          present: r.present,
          late: r.late,
          absent: r.absent,
          excused: r.excused,
          // Late still counts as attending; excused absence does not count
          // against the pupil but is not attendance either.
          rate: r.sessions ? Math.round(((r.present + r.late) / r.sessions) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => a.rate - b.rate),
  });
});

export default router;
