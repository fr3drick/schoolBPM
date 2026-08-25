import { Router } from 'express';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import { requireAuth, requireSchool, requireModule, permit } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

const router = Router();
router.use(requireAuth, requireSchool, requireModule('students'));

router.get('/', async (req, res) => {
  const classes = await Class.find({ school: req.user.school._id })
    .populate('formTeacher', 'name email')
    .sort({ name: 1 });
  // Student counts in one aggregate rather than a query per row.
  const counts = await Student.aggregate([
    { $match: { school: req.user.school._id, status: 'active' } },
    { $group: { _id: '$class', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({
    classes: classes.map((c) => ({
      ...c.toObject(),
      studentCount: countMap.get(String(c._id)) || 0,
    })),
  });
});

async function clean(body, schoolId) {
  const name = String(body?.name || '').trim();
  if (name.length < 1 || name.length > 60) throw httpError(400, 'Class name must be 1–60 characters');

  let formTeacher = null;
  if (body?.formTeacher) {
    // Scoped to the school so a class cannot be handed to another tenant's user.
    const teacher = await User.findOne({ _id: body.formTeacher, school: schoolId });
    if (!teacher) throw httpError(400, 'Form teacher not found in this school');
    formTeacher = teacher._id;
  }
  return {
    name,
    level: String(body?.level || '').trim(),
    academicYear: String(body?.academicYear || '').trim(),
    formTeacher,
    active: body?.active === undefined ? true : Boolean(body.active),
  };
}

router.post('/', permit('classes.manage'), async (req, res) => {
  const data = await clean(req.body, req.user.school._id);
  const klass = await Class.create({ ...data, school: req.user.school._id });
  logAudit(req.user, 'classes.create', 'class', klass._id, { name: klass.name });
  res.status(201).json({ class: klass });
});

router.put('/:id', permit('classes.manage'), async (req, res) => {
  const klass = await Class.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!klass) throw httpError(404, 'Class not found');
  Object.assign(klass, await clean(req.body, req.user.school._id));
  await klass.save();
  logAudit(req.user, 'classes.update', 'class', klass._id, { name: klass.name });
  res.json({ class: klass });
});

router.delete('/:id', permit('classes.manage'), async (req, res) => {
  const klass = await Class.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!klass) throw httpError(404, 'Class not found');
  const students = await Student.countDocuments({ class: klass._id });
  if (students) {
    throw httpError(400, `Cannot delete: ${students} student(s) are still in this class.`);
  }
  await klass.deleteOne();
  logAudit(req.user, 'classes.delete', 'class', klass._id, { name: klass.name });
  res.json({ ok: true });
});

/** Moves students into this class in one action, for assigning a whole intake. */
router.post('/:id/students', permit('classes.manage'), async (req, res) => {
  const klass = await Class.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!klass) throw httpError(404, 'Class not found');
  const ids = Array.isArray(req.body?.studentIds) ? req.body.studentIds : [];
  if (!ids.length) throw httpError(400, 'No students selected');

  const result = await Student.updateMany(
    { _id: { $in: ids }, school: req.user.school._id },
    { $set: { class: klass._id } }
  );
  logAudit(req.user, 'classes.assign_students', 'class', klass._id,
    { name: klass.name, assigned: result.modifiedCount });
  res.json({ assigned: result.modifiedCount });
});

export default router;
