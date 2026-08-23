import User from '../models/User.js';
import { enqueue } from './mail/outbox.js';
import {
  renderOnboardingApprovedEmail,
  renderOnboardingRejectedEmail,
  renderOnboardingReviewEmail,
  renderOnboardingSubmittedEmail,
} from './mail/templates.js';

/**
 * Email around the self-onboarding review loop.
 *
 * Like welcome.js, none of these throw: a mail problem must never roll back a
 * registration that was recorded, or an approval a platform admin has made.
 * The outbox row — or its absence — is the operational signal.
 *
 * Note the `school: null` on every message. The outbox skips mail for a
 * school that is not active, and a school under review is not yet a going
 * concern; tying these rows to it would silence exactly the messages that
 * have to get through. Nothing here carries school data anyway.
 */

const location = (school) =>
  [school.city, school.state, school.country].map((p) => String(p || '').trim()).filter(Boolean).join(', ');

/** Acknowledges the registration to the applicant. */
export async function notifyApplicationReceived(admin, school) {
  try {
    const { subject, html, text } = renderOnboardingSubmittedEmail({
      recipientName: admin.name,
      schoolName: school.name,
    });
    await enqueue([
      {
        school: null,
        to: admin.email,
        toName: admin.name,
        replyTo: school.contactEmail || '',
        subject,
        html,
        text,
        dedupeKey: `onboarding-submitted:${school._id}`,
      },
    ]);
  } catch (err) {
    console.error('Failed to queue onboarding acknowledgement:', err.message);
  }
}

/** Tells the platform team an application is waiting. */
export async function notifyPlatformReviewers(admin, school) {
  try {
    const reviewers = await User.find({ isPlatformAdmin: true, active: true }).select('name email');
    if (!reviewers.length) return;
    const { subject, html, text } = renderOnboardingReviewEmail({
      schoolName: school.name,
      adminName: admin.name,
      adminEmail: admin.email,
      contactEmail: school.contactEmail,
      location: location(school),
    });
    await enqueue(
      reviewers.map((reviewer) => ({
        school: null,
        to: reviewer.email,
        toName: reviewer.name,
        subject,
        html,
        text,
        dedupeKey: `onboarding-review:${school._id}:${reviewer._id}`,
      }))
    );
  } catch (err) {
    console.error('Failed to queue platform review alert:', err.message);
  }
}

/** The go-live email, sent to every Super Admin the school has. */
export async function notifySchoolApproved(school) {
  try {
    const admins = await schoolAdmins(school);
    if (!admins.length) return;
    await enqueue(
      admins.map((admin) => {
        const { subject, html, text } = renderOnboardingApprovedEmail({
          recipientName: admin.name,
          schoolName: school.name,
        });
        return {
          school: null,
          to: admin.email,
          toName: admin.name,
          fromName: school.name,
          replyTo: school.contactEmail || '',
          subject,
          html,
          text,
          // Keyed on the review, so re-approving after a rejection mails again.
          dedupeKey: `onboarding-approved:${school._id}:${admin._id}:${school.reviewedAt?.getTime() ?? 0}`,
        };
      })
    );
  } catch (err) {
    console.error('Failed to queue approval email:', err.message);
  }
}

/** Explains a turned-down registration, with the reviewer's reason. */
export async function notifySchoolRejected(school) {
  try {
    const admins = await schoolAdmins(school);
    if (!admins.length) return;
    await enqueue(
      admins.map((admin) => {
        const { subject, html, text } = renderOnboardingRejectedEmail({
          recipientName: admin.name,
          schoolName: school.name,
          reason: school.rejectionReason,
        });
        return {
          school: null,
          to: admin.email,
          toName: admin.name,
          subject,
          html,
          text,
          dedupeKey: `onboarding-rejected:${school._id}:${admin._id}:${school.reviewedAt?.getTime() ?? 0}`,
        };
      })
    );
  } catch (err) {
    console.error('Failed to queue rejection email:', err.message);
  }
}

/**
 * The school's user-managing accounts. Found by permission rather than by
 * role name — role names are a school's to change, permissions are not.
 */
async function schoolAdmins(school) {
  return User.find({ school: school._id, active: true })
    .populate('role')
    .then((users) => users.filter((u) => (u.role?.permissions || []).includes('users.manage')));
}
