import Notification from '../models/Notification.js';
import School from '../models/School.js';
import User from '../models/User.js';
import { enqueue } from './mail/outbox.js';
import { renderWorkflowEmail } from './mail/templates.js';

/**
 * Single fan-out point for workflow notifications: the in-app bell and the
 * email outbox are written from the same call so the two channels cannot
 * drift. Pass `mail` to also send email; omit it for in-app only.
 *
 * mail: { event: 'submitted'|'awaiting'|'resubmitted'|'step_approved'
 *                |'approved'|'rejected'|'returned', key?: string }
 */

async function schoolContext(instance) {
  if (!instance?.school) return { name: '', replyTo: '' };
  const school = await School.findById(instance.school).select('name contactEmail');
  return { name: school?.name || '', replyTo: school?.contactEmail || '' };
}

async function queueEmails(users, message, instance, mail) {
  const recipients = users.filter((u) => u.email);
  if (!recipients.length) return;

  const { name: schoolName, replyTo } = await schoolContext(instance);
  // Occurrence counter: without it, an approve → return → approve cycle on
  // the same request would collide on the dedupe key and drop the second mail.
  const occurrence = instance?.history?.length ?? 0;

  const rows = recipients.map((user) => {
    const { subject, html, text } = renderWorkflowEmail({
      recipientName: user.name,
      schoolName,
      message,
      instance,
      event: mail.event,
    });
    return {
      school: instance?.school ?? null,
      to: user.email,
      toName: user.name,
      // The mailbox stays ours; only the display name is the school's.
      fromName: schoolName || undefined,
      replyTo,
      subject,
      html,
      text,
      instance: instance?._id,
      dedupeKey: mail.key
        ? `${mail.key}:${user._id}`
        : `${instance?._id}:${mail.event}:${user._id}:${occurrence}`,
    };
  });

  await enqueue(rows);
}

async function dispatch(users, message, instance, mail) {
  if (!users.length) return;

  await Notification.insertMany(
    users.map((user) => ({
      user: user._id,
      school: instance?.school ?? null,
      message,
      instance: instance?._id,
      reference: instance?.reference,
    }))
  );

  // Email must never break the workflow action that triggered it.
  if (mail?.event || mail?.key) {
    try {
      await queueEmails(users, message, instance, mail);
    } catch (err) {
      console.error('Failed to queue notification email:', err.message);
    }
  }
}

export async function notifyUsers(userIds, message, instance, mail) {
  const ids = [...new Set((userIds || []).map(String))];
  if (!ids.length) return;
  const users = await User.find({ _id: { $in: ids }, active: true }).select('name email');
  await dispatch(users, message, instance, mail);
}

export async function notifyRoles(roleIds, message, instance, excludeUserId, mail) {
  if (!roleIds?.length) return;
  const users = await User.find({
    role: { $in: roleIds },
    ...(instance?.school ? { school: instance.school } : {}),
    active: true,
    ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
  }).select('name email');
  await dispatch(users, message, instance, mail);
}
