import { Router } from 'express';
import Subject from '../models/Subject.js';
import { requireAuth, requireSchool, requireModule, permit } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

const router = Router();
router.use(requireAuth, requireSchool, requireModule('students'));

// Readable by anyone in the school: results entry and class screens need the list.
router.get('/', async (req, res) => {
  const subjects = await Subject.find({ school: req.user.school._id }).sort({ name: 1 });
  res.json({ subjects });
});

function clean(body) {
  const name = String(body?.name || '').trim();
  const code = String(body?.code || '').trim().toUpperCase();
  if (name.length < 2 || name.length > 80) throw httpError(400, 'Subject name must be 2–80 characters');
  if (code && !/^[A-Z0-9]{2,10}$/.test(code)) throw httpError(400, 'Code must be 2–10 letters or digits');
  // undefined, not '': the unique index covers codes that exist, so a blank
  // one has to be absent from the document rather than present and empty.
  return {
    name,
    code: code || undefined,
    active: body?.active === undefined ? true : Boolean(body.active),
  };
}

router.post('/', permit('subjects.manage'), async (req, res) => {
  const data = clean(req.body);
  const subject = await Subject.create({ ...data, school: req.user.school._id });
  logAudit(req.user, 'subjects.create', 'subject', subject._id, { name: subject.name });
  res.status(201).json({ subject });
});

router.put('/:id', permit('subjects.manage'), async (req, res) => {
  const subject = await Subject.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!subject) throw httpError(404, 'Subject not found');
  const data = clean(req.body);
  Object.assign(subject, data);
  // Assigning undefined is a no-op in Mongoose, so clearing a code has to be
  // an explicit unset or the old one would survive the edit.
  if (data.code === undefined) subject.set('code', undefined, { strict: false });
  await subject.save();
  logAudit(req.user, 'subjects.update', 'subject', subject._id, { name: subject.name });
  res.json({ subject });
});

router.delete('/:id', permit('subjects.manage'), async (req, res) => {
  const subject = await Subject.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!subject) throw httpError(404, 'Subject not found');
  await subject.deleteOne();
  logAudit(req.user, 'subjects.delete', 'subject', subject._id, { name: subject.name });
  res.json({ ok: true });
});

export default router;
