import crypto from 'node:crypto';
import PasswordReset from '../models/PasswordReset.js';
import School from '../models/School.js';
import { enqueue } from './mail/outbox.js';
import { renderPasswordResetEmail } from './mail/templates.js';

const TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 45);

/** Tokens are compared by hash, never by the raw value we emailed. */
export function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

/**
 * Issues a reset token for a user and queues the email.
 * Any outstanding tokens for that user are burned first, so a second
 * request invalidates the link from the first.
 */
export async function issueReset(user, { ip = '' } = {}) {
  await PasswordReset.updateMany(
    { user: user._id, usedAt: null },
    { $set: { usedAt: new Date() } }
  );

  const raw = crypto.randomBytes(32).toString('hex');
  const reset = await PasswordReset.create({
    user: user._id,
    school: user.school?._id ?? user.school ?? null,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
    requestedIp: ip,
  });

  let schoolName = '';
  let replyTo = '';
  if (reset.school) {
    const school = await School.findById(reset.school).select('name contactEmail');
    schoolName = school?.name || '';
    replyTo = school?.contactEmail || '';
  }

  const base = (process.env.APP_BASE_URL || 'http://localhost:4200').replace(/\/+$/, '');
  const { subject, html, text } = renderPasswordResetEmail({
    recipientName: user.name,
    schoolName,
    url: `${base}/reset-password/${raw}`,
    ttlMinutes: TTL_MINUTES,
  });

  await enqueue([
    {
      school: reset.school,
      to: user.email,
      toName: user.name,
      fromName: schoolName || undefined,
      replyTo,
      subject,
      html,
      text,
      // One row per reset request, so a retry cannot fan out extra links.
      dedupeKey: `password-reset:${reset._id}`,
    },
  ]);

  return reset;
}

/**
 * Resolves a raw token to its unused, unexpired record.
 * Returns null for anything invalid — callers must not distinguish between
 * "unknown", "already used" and "expired" in what they tell the caller.
 */
export async function consumeToken(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const reset = await PasswordReset.findOne({ tokenHash: hashToken(raw) }).populate({
    path: 'user',
    populate: { path: 'school' },
  });
  if (!reset || reset.usedAt) return null;
  if (reset.expiresAt.getTime() < Date.now()) return null;
  return reset;
}

export { TTL_MINUTES };
