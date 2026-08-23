import School from '../models/School.js';
import { enqueue } from './mail/outbox.js';
import { renderWelcomeEmail } from './mail/templates.js';

/**
 * Queues the welcome email for an account an administrator just created.
 *
 * Called from both provisioning paths — a school admin adding a user, and
 * the platform onboarding a school's first Super Admin — so a new account
 * always reaches its owner the same way.
 *
 * Never throws: a mail problem must not roll back an account that was
 * created successfully. The outbox row is the operational signal.
 */
export async function sendWelcomeEmail(user, tempPassword, school) {
  try {
    let name = school?.name;
    let replyTo = school?.contactEmail;
    if (name === undefined && user.school) {
      const doc = await School.findById(user.school).select('name contactEmail');
      name = doc?.name || '';
      replyTo = doc?.contactEmail || '';
    }

    const { subject, html, text } = renderWelcomeEmail({
      recipientName: user.name,
      schoolName: name || '',
      email: user.email,
      tempPassword,
      mustChangePassword: user.mustChangePassword,
    });

    await enqueue([
      {
        school: user.school ?? null,
        to: user.email,
        toName: user.name,
        fromName: name || undefined,
        replyTo: replyTo || '',
        subject,
        html,
        text,
        // One per account: re-running provisioning cannot re-send credentials.
        dedupeKey: `welcome:${user._id}`,
      },
    ]);
  } catch (err) {
    console.error('Failed to queue welcome email:', err.message);
  }
}
