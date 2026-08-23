import { Router } from 'express';
import EmailOutbox from '../models/EmailOutbox.js';
import { requireAuth, requireSchool, permit } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

const router = Router();
router.use(requireAuth, requireSchool, permit('email.view'));

const ALLOWED_STATUSES = ['failed', 'skipped', 'pending', 'sent'];

/**
 * Delivery log for this school. Defaults to the messages that need
 * attention (failed and skipped) since that is the reason to open it.
 *
 * The stored HTML body is deliberately not returned: it is large, and the
 * point of this screen is delivery health, not message contents.
 */
router.get('/', async (req, res) => {
  const filter = { school: req.user.school._id };
  if (req.query.status) {
    const status = String(req.query.status);
    if (!ALLOWED_STATUSES.includes(status)) throw httpError(400, 'Invalid status filter');
    filter.status = status;
  } else {
    filter.status = { $in: ['failed', 'skipped'] };
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const skip = Math.max(Number(req.query.skip) || 0, 0);

  const [emails, counts] = await Promise.all([
    EmailOutbox.find(filter)
      .select('to toName subject status attempts lastError instance createdAt sentAt nextAttemptAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    EmailOutbox.aggregate([
      { $match: { school: req.user.school._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const tally = { pending: 0, sent: 0, failed: 0, skipped: 0 };
  for (const c of counts) if (c._id in tally) tally[c._id] = c.count;

  res.json({ emails, counts: tally });
});

/**
 * Requeue a message that gave up (or was skipped while the school was
 * suspended). Resets the attempt counter so the normal backoff applies.
 */
router.post('/:id/retry', async (req, res) => {
  const email = await EmailOutbox.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!email) throw httpError(404, 'Email not found');
  if (!['failed', 'skipped'].includes(email.status)) {
    throw httpError(400, 'Only failed or skipped emails can be retried');
  }
  email.status = 'pending';
  email.attempts = 0;
  email.lastError = '';
  email.nextAttemptAt = new Date();
  email.lockedAt = null;
  await email.save();
  logAudit(req.user, 'emails.retry', 'email', email._id, { to: email.to, subject: email.subject });
  res.json({ email });
});

export default router;
