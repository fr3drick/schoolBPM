import { Router } from 'express';
import Announcement, { AUDIENCES } from '../models/Announcement.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import User from '../models/User.js';
import { requireAuth, requireSchool, requireModule, permit } from '../middleware/auth.js';
import { enqueue } from '../services/mail/outbox.js';
import { renderAnnouncementEmail } from '../services/mail/templates.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

const router = Router();
router.use(requireAuth, requireSchool, requireModule('communications'));

/**
 * Resolves an audience to a de-duplicated recipient list.
 *
 * Guardians are de-duplicated by address on purpose: a parent with three
 * children at the school should get one copy of a general announcement, not
 * three.
 */
async function recipientsFor(schoolId, audience, classId) {
  if (audience === 'staff') {
    const users = await User.find({ school: schoolId, active: true }).select('name email');
    return users.filter((u) => u.email).map((u) => ({ name: u.name, email: u.email }));
  }

  const filter = { school: schoolId, status: 'active' };
  if (audience === 'class_guardians') filter.class = classId;

  const students = await Student.find(filter).select('guardians');
  const byEmail = new Map();
  for (const student of students) {
    for (const g of student.resultRecipients()) {
      const key = g.email.toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, { name: g.name, email: g.email });
    }
  }
  return [...byEmail.values()];
}

router.get('/', permit('comms.view', 'comms.send'), async (req, res) => {
  const announcements = await Announcement.find({ school: req.user.school._id })
    .populate('class', 'name')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ announcements });
});

/** How many people an audience would reach, so the sender can see it first. */
router.get('/audience', permit('comms.send'), async (req, res) => {
  const audience = String(req.query.audience || '');
  if (!AUDIENCES.includes(audience)) throw httpError(400, 'Unknown audience');

  let classId = null;
  if (audience === 'class_guardians') {
    const klass = await Class.findOne({ _id: req.query.class, school: req.user.school._id });
    if (!klass) throw httpError(400, 'Class not found in this school');
    classId = klass._id;
  }
  const recipients = await recipientsFor(req.user.school._id, audience, classId);
  res.json({ count: recipients.length });
});

router.post('/', permit('comms.send'), async (req, res) => {
  const subject = String(req.body?.subject || '').trim();
  const body = String(req.body?.body || '').trim();
  const audience = String(req.body?.audience || '');

  if (!subject) throw httpError(400, 'A subject is required');
  if (subject.length > 200) throw httpError(400, 'Subject must be 200 characters or fewer');
  if (!body) throw httpError(400, 'A message is required');
  if (body.length > 20000) throw httpError(400, 'Message is too long');
  if (!AUDIENCES.includes(audience)) throw httpError(400, 'Unknown audience');

  let klass = null;
  if (audience === 'class_guardians') {
    klass = await Class.findOne({ _id: req.body?.class, school: req.user.school._id });
    if (!klass) throw httpError(400, 'Class not found in this school');
  }

  const recipients = await recipientsFor(req.user.school._id, audience, klass?._id);
  if (!recipients.length) throw httpError(400, 'That audience has nobody with an email address.');

  const announcement = await Announcement.create({
    school: req.user.school._id,
    subject,
    body,
    audience,
    class: klass?._id || null,
    sentBy: req.user._id,
    sentByName: req.user.name,
    recipients: recipients.length,
  });

  const rows = recipients.map((r) => {
    const mail = renderAnnouncementEmail({
      recipientName: r.name,
      schoolName: req.user.school.name,
      subject,
      body,
      replyTo: req.user.school.contactEmail,
    });
    return {
      school: req.user.school._id,
      to: r.email,
      toName: r.name,
      fromName: req.user.school.name || undefined,
      replyTo: req.user.school.contactEmail || '',
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      // Keyed to the announcement, so a retried request cannot mail the whole
      // school twice.
      dedupeKey: `announcement:${announcement._id}:${r.email.toLowerCase()}`,
    };
  });

  const queued = await enqueue(rows);
  announcement.skipped = recipients.length - queued;
  await announcement.save();

  logAudit(req.user, 'comms.send', 'announcement', announcement._id, { audience, subject, queued });
  res.status(201).json({ announcement, queued });
});

export default router;
