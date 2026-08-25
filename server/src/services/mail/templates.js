/**
 * Email rendering. Every interpolated value is HTML-escaped: names, comments
 * and form data are user-supplied and must never become markup in an inbox.
 */

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// event -> subject line and whether the recipient has to do something.
const EVENTS = {
  submitted: { verb: 'needs your approval', action: true },
  awaiting: { verb: 'needs your approval', action: true },
  resubmitted: { verb: 'was resubmitted and needs your approval', action: true },
  step_approved: { verb: 'moved forward', action: false },
  approved: { verb: 'was fully approved', action: false },
  rejected: { verb: 'was rejected', action: false },
  returned: { verb: 'was returned for changes', action: false },
};

export function subjectFor(event, instance) {
  const name = instance?.definitionSnapshot?.name || 'Request';
  const ref = instance?.reference || '';
  switch (event) {
    case 'submitted':
    case 'awaiting':
      return `Action needed: ${ref} · ${name}`;
    case 'resubmitted':
      return `Action needed: ${ref} · ${name} (resubmitted)`;
    case 'approved':
      return `${ref} approved · ${name}`;
    case 'rejected':
      return `${ref} rejected · ${name}`;
    case 'returned':
      return `${ref} returned for changes · ${name}`;
    default:
      return `${ref} · ${name}`;
  }
}

function button(url, label) {
  // Table-based: Outlook's Word rendering engine ignores padding on anchors.
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
      <tr>
        <td align="center" bgcolor="#1565c0" style="border-radius:6px;">
          <a href="${esc(url)}"
             style="display:inline-block;padding:12px 24px;font-family:Helvetica,Arial,sans-serif;
                    font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            ${esc(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/** The link under a button, for clients that strip or mangle it. */
function fallbackLink(url) {
  return `
                <p style="font-size:12px;color:#637381;line-height:1.5;margin:0;">
                  If the button does not work, paste this into your browser:<br />
                  <span style="color:#1565c0;">${esc(url)}</span>
                </p>`;
}

/** A shaded panel of label/value pairs, e.g. credentials or a verification code. */
function panel(rows) {
  const cells = rows
    .map(
      ({ label, value, mono = false }) => `
                    <div style="font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#919eab;">${esc(label)}</div>
                    <div style="${
                      mono
                        ? 'font-size:17px;font-family:Consolas,Menlo,monospace;letter-spacing:.5px;margin-top:2px;'
                        : 'font-size:15px;margin:2px 0 12px;'
                    }">${esc(value)}</div>`
    )
    .join('');
  return `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                       style="width:100%;background:#f6f7f9;border-radius:8px;margin:20px 0;">
                  <tr><td style="padding:16px 18px;">${cells}
                  </td></tr>
                </table>`;
}

/**
 * The card every message shares: grey canvas, white 560px card, school name
 * as an eyebrow, then the caller's body and a small print footer.
 *
 * `org`, `title` and `subtitle` are escaped here; `body` and `footer` are
 * HTML the caller has already assembled with esc() around its own values.
 */
function page({ org, title, subtitle = '', body, footer }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f6f7f9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                 style="max-width:560px;background:#ffffff;border-radius:10px;padding:32px;
                        font-family:Helvetica,Arial,sans-serif;color:#212b36;">
            <tr>
              <td>
                <div style="font-size:13px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:#1565c0;">
                  ${esc(org)}
                </div>
                <h1 style="margin:12px 0 4px;font-size:20px;font-weight:600;">${esc(title)}</h1>${
                  subtitle ? `\n                <div style="font-size:14px;color:#637381;">${esc(subtitle)}</div>` : ''
                }${body}
                <hr style="border:none;border-top:1px solid #e3e7ea;margin:24px 0 12px;" />
                <p style="font-size:12px;color:#919eab;line-height:1.5;margin:0;">
                  ${footer}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const greeting = (recipientName) => String(recipientName || '').split(' ')[0] || 'there';

/**
 * @param {object} opts
 * @param {string} opts.recipientName
 * @param {string} opts.schoolName
 * @param {string} opts.message   the same sentence shown in the in-app bell
 * @param {object} opts.instance
 * @param {string} opts.event
 */
export function renderWorkflowEmail({ recipientName, schoolName, message, instance, event }) {
  const meta = EVENTS[event] || { verb: 'was updated', action: false };
  const base = (process.env.APP_BASE_URL || 'http://localhost:4200').replace(/\/+$/, '');
  const url = `${base}/requests/${instance?._id ?? ''}`;
  const processName = instance?.definitionSnapshot?.name || 'Request';
  const reference = instance?.reference || '';
  const label = meta.action ? 'Review the request' : 'View the request';
  const firstName = greeting(recipientName);
  const org = schoolName || 'School BPM';

  const html = page({
    org,
    title: `${reference} ${meta.verb}`,
    subtitle: processName,
    body: `
                <p style="font-size:15px;line-height:1.5;margin:20px 0 0;">Hi ${esc(firstName)},</p>
                <p style="font-size:15px;line-height:1.5;margin:8px 0 0;">${esc(message)}</p>
                ${button(url, label)}${fallbackLink(url)}`,
    footer: `You are receiving this because of your role in ${esc(schoolName || 'your school')}
                  on School BPM. Reply to this email to reach your school office.`,
  });

  const text = [
    `${schoolName || 'School BPM'}`,
    '',
    `${reference} ${meta.verb} — ${processName}`,
    '',
    `Hi ${firstName},`,
    '',
    message,
    '',
    `${label}: ${url}`,
    '',
    `You are receiving this because of your role in ${schoolName || 'your school'} on School BPM.`,
  ].join('\n');

  return { subject: subjectFor(event, instance), html, text };
}

/**
 * Password reset email. Deliberately says nothing about the account beyond
 * the recipient's first name — these land in inboxes that may not belong to
 * the person who requested the reset.
 */
export function renderPasswordResetEmail({ recipientName, schoolName, url, ttlMinutes }) {
  const firstName = greeting(recipientName);
  const org = schoolName || 'School BPM';

  const html = page({
    org,
    title: 'Reset your password',
    body: `
                <p style="font-size:15px;line-height:1.5;margin:20px 0 0;">Hi ${esc(firstName)},</p>
                <p style="font-size:15px;line-height:1.5;margin:8px 0 0;">
                  We received a request to reset your School BPM password. Choose a new one using
                  the button below. This link works once and expires in ${esc(ttlMinutes)} minutes.
                </p>
                ${button(url, 'Choose a new password')}${fallbackLink(url)}`,
    footer: `If you did not ask for this, you can ignore this email — your password will not
                  change, and the link above will expire on its own.`,
  });

  const text = [
    org,
    '',
    'Reset your password',
    '',
    `Hi ${firstName},`,
    '',
    'We received a request to reset your School BPM password. Open the link below to',
    `choose a new one. It works once and expires in ${ttlMinutes} minutes.`,
    '',
    url,
    '',
    'If you did not ask for this, you can ignore this email — your password will not change.',
  ].join('\n');

  return { subject: `Reset your ${org} password`, html, text };
}

/**
 * Sent when an administrator provisions an account. Carries the temporary
 * password so the recipient can get in without a separate channel; the
 * account is normally flagged `mustChangePassword`, so the credential is
 * replaced the first time it is used.
 */
export function renderWelcomeEmail({
  recipientName, schoolName, email, tempPassword, mustChangePassword = true,
}) {
  const firstName = greeting(recipientName);
  const org = schoolName || 'School BPM';
  const base = (process.env.APP_BASE_URL || 'http://localhost:4200').replace(/\/+$/, '');
  const url = `${base}/login`;

  const changeNote = mustChangePassword
    ? 'You will be asked to choose your own password the first time you sign in.'
    : 'Please change this password once you have signed in.';

  const html = page({
    org,
    title: 'Your account is ready',
    body: `
                <p style="font-size:15px;line-height:1.5;margin:20px 0 0;">Hi ${esc(firstName)},</p>
                <p style="font-size:15px;line-height:1.5;margin:8px 0 0;">
                  An account has been created for you on School BPM for ${esc(org)}, where you can
                  raise and track requests such as leave, purchases and maintenance.
                </p>${panel([
                  { label: 'Email', value: email },
                  { label: 'Temporary password', value: tempPassword, mono: true },
                ])}
                <p style="font-size:14px;line-height:1.5;margin:0;color:#637381;">${esc(changeNote)}</p>
                ${button(url, 'Sign in')}${fallbackLink(url)}`,
    footer: 'If you were not expecting this, reply to this email to reach your school office.',
  });

  const text = [
    org,
    '',
    'Your account is ready',
    '',
    `Hi ${firstName},`,
    '',
    `An account has been created for you on School BPM for ${org}.`,
    '',
    `Email:              ${email}`,
    `Temporary password: ${tempPassword}`,
    '',
    changeNote,
    '',
    `Sign in: ${url}`,
    '',
    'If you were not expecting this, reply to this email to reach your school office.',
  ].join('\n');

  return { subject: `Your ${org} School BPM account`, html, text };
}

/**
 * The six-digit code that proves a self-onboarding applicant owns the address
 * they signed up with. No school exists yet, so this one is unbranded.
 */
export function renderSignupOtpEmail({ recipientName, code, ttlMinutes }) {
  const firstName = greeting(recipientName);

  const html = page({
    org: 'School BPM',
    title: 'Verify your email address',
    body: `
                <p style="font-size:15px;line-height:1.5;margin:20px 0 0;">Hi ${esc(firstName)},</p>
                <p style="font-size:15px;line-height:1.5;margin:8px 0 0;">
                  Use this code to confirm your email address and continue registering your
                  school on School BPM.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                       style="width:100%;background:#f6f7f9;border-radius:8px;margin:20px 0;">
                  <tr><td align="center" style="padding:20px 18px;">
                    <div style="font-size:32px;font-weight:700;font-family:Consolas,Menlo,monospace;letter-spacing:8px;color:#1565c0;">${esc(code)}</div>
                    <div style="font-size:12px;color:#919eab;margin-top:8px;">Expires in ${esc(ttlMinutes)} minutes</div>
                  </td></tr>
                </table>
                <p style="font-size:14px;line-height:1.5;margin:0;color:#637381;">
                  Enter it on the page you left open. If it has expired, you can ask for a new code.
                </p>`,
    footer: `If you did not try to register a school on School BPM, you can ignore this email —
                  no account is created until this code is used.`,
  });

  const text = [
    'School BPM',
    '',
    'Verify your email address',
    '',
    `Hi ${firstName},`,
    '',
    'Use this code to confirm your email address and continue registering your school:',
    '',
    `    ${code}`,
    '',
    `The code expires in ${ttlMinutes} minutes. If it has expired, ask for a new one.`,
    '',
    'If you did not try to register a school on School BPM, you can ignore this email.',
  ].join('\n');

  return { subject: `${code} is your School BPM verification code`, html, text };
}

/** Acknowledgement to the applicant once the school details are in. */
export function renderOnboardingSubmittedEmail({ recipientName, schoolName }) {
  const firstName = greeting(recipientName);

  const html = page({
    org: schoolName || 'School BPM',
    title: 'We have your registration',
    body: `
                <p style="font-size:15px;line-height:1.5;margin:20px 0 0;">Hi ${esc(firstName)},</p>
                <p style="font-size:15px;line-height:1.5;margin:8px 0 0;">
                  Thank you for registering ${esc(schoolName)} on School BPM. Our team reviews every
                  new school before it goes live, which usually takes one business day.
                </p>
                <p style="font-size:15px;line-height:1.5;margin:16px 0 0;">
                  We will email you as soon as it is approved. You can sign in with the account you
                  created at any time to check the status — the rest of the platform unlocks once
                  the review is complete.
                </p>`,
    footer: 'Reply to this email if you need to correct anything on your registration.',
  });

  const text = [
    schoolName || 'School BPM',
    '',
    'We have your registration',
    '',
    `Hi ${firstName},`,
    '',
    `Thank you for registering ${schoolName} on School BPM. Our team reviews every new`,
    'school before it goes live, which usually takes one business day.',
    '',
    'We will email you as soon as it is approved. You can sign in with the account you',
    'created at any time to check the status.',
    '',
    'Reply to this email if you need to correct anything on your registration.',
  ].join('\n');

  return { subject: `We have your ${schoolName} registration`, html, text };
}

/** The go-live email: the school is approved and can start adding staff. */
export function renderOnboardingApprovedEmail({ recipientName, schoolName }) {
  const firstName = greeting(recipientName);
  const base = (process.env.APP_BASE_URL || 'http://localhost:4200').replace(/\/+$/, '');
  const url = `${base}/login`;

  const html = page({
    org: schoolName || 'School BPM',
    title: `${schoolName} has been approved`,
    body: `
                <p style="font-size:15px;line-height:1.5;margin:20px 0 0;">Hi ${esc(firstName)},</p>
                <p style="font-size:15px;line-height:1.5;margin:8px 0 0;">
                  Your school is now live on School BPM. Sign in with the account you created
                  during registration — the password has not changed.
                </p>
                <p style="font-size:15px;line-height:1.5;margin:16px 0 0;">
                  As Super Admin your first job is to invite your staff: go to
                  <b>Administration &rarr; Users</b>, add each person with the role that matches
                  what they do, and they will receive their own sign-in details by email. Roles and
                  their permissions are yours to edit under <b>Roles &amp; permissions</b>.
                </p>
                <p style="font-size:15px;line-height:1.5;margin:16px 0 0;">
                  Your school starts with five ready-made processes — leave requests, purchase
                  requisitions, field trips, maintenance and exam moderation — which your Owner,
                  Principal or Admin can adapt in the process designer.
                </p>
                ${button(url, 'Sign in and invite your staff')}${fallbackLink(url)}`,
    footer: `You are receiving this because you registered ${esc(schoolName || 'your school')} on
                  School BPM.`,
  });

  const text = [
    schoolName || 'School BPM',
    '',
    `${schoolName} has been approved`,
    '',
    `Hi ${firstName},`,
    '',
    'Your school is now live on School BPM. Sign in with the account you created during',
    'registration — the password has not changed.',
    '',
    'As Super Admin your first job is to invite your staff: go to Administration > Users,',
    'add each person with the role that matches what they do, and they will receive their',
    'own sign-in details by email.',
    '',
    'Your school starts with five ready-made processes — leave requests, purchase',
    'requisitions, field trips, maintenance and exam moderation.',
    '',
    `Sign in: ${url}`,
    '',
    `You are receiving this because you registered ${schoolName || 'your school'} on School BPM.`,
  ].join('\n');

  return { subject: `${schoolName} is approved on School BPM`, html, text };
}

/** Sent when the platform turns an application down; carries the reason. */
export function renderOnboardingRejectedEmail({ recipientName, schoolName, reason }) {
  const firstName = greeting(recipientName);

  const html = page({
    org: schoolName || 'School BPM',
    title: 'About your School BPM registration',
    body: `
                <p style="font-size:15px;line-height:1.5;margin:20px 0 0;">Hi ${esc(firstName)},</p>
                <p style="font-size:15px;line-height:1.5;margin:8px 0 0;">
                  We were not able to approve the registration for ${esc(schoolName)} at this time.
                </p>${
                  reason
                    ? `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                       style="width:100%;background:#f6f7f9;border-radius:8px;margin:20px 0;">
                  <tr><td style="padding:16px 18px;">
                    <div style="font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#919eab;">Reason</div>
                    <div style="font-size:15px;line-height:1.5;margin-top:4px;">${esc(reason)}</div>
                  </td></tr>
                </table>`
                    : ''
                }
                <p style="font-size:15px;line-height:1.5;margin:16px 0 0;">
                  If you think this is a mistake, or you can supply what is missing, reply to this
                  email and we will take another look.
                </p>`,
    footer: 'Your account remains, so nothing needs to be created again if the decision changes.',
  });

  const text = [
    schoolName || 'School BPM',
    '',
    'About your School BPM registration',
    '',
    `Hi ${firstName},`,
    '',
    `We were not able to approve the registration for ${schoolName} at this time.`,
    ...(reason ? ['', `Reason: ${reason}`] : []),
    '',
    'If you think this is a mistake, or you can supply what is missing, reply to this',
    'email and we will take another look.',
  ].join('\n');

  return { subject: `About your ${schoolName} registration`, html, text };
}

/**
 * Alerts the platform team that an application is waiting. A review queue
 * nobody is told about is a queue nobody empties.
 */
export function renderOnboardingReviewEmail({ schoolName, adminName, adminEmail, location, contactEmail }) {
  const base = (process.env.APP_BASE_URL || 'http://localhost:4200').replace(/\/+$/, '');
  const url = `${base}/platform/schools`;

  const html = page({
    org: 'School BPM · Platform',
    title: 'A school is waiting for review',
    subtitle: schoolName,
    body: `${panel([
                  { label: 'School', value: schoolName },
                  { label: 'Registered by', value: `${adminName} (${adminEmail})` },
                  { label: 'Contact email', value: contactEmail || '—' },
                  { label: 'Location', value: location || '—' },
                ])}
                ${button(url, 'Review the application')}${fallbackLink(url)}`,
    footer: 'You are receiving this as a platform administrator on School BPM.',
  });

  const text = [
    'School BPM · Platform',
    '',
    'A school is waiting for review',
    '',
    `School:        ${schoolName}`,
    `Registered by: ${adminName} (${adminEmail})`,
    `Contact email: ${contactEmail || '—'}`,
    `Location:      ${location || '—'}`,
    '',
    `Review it: ${url}`,
  ].join('\n');

  return { subject: `New school registration: ${schoolName}`, html, text };
}

/**
 * A guardian's copy of one child's exam results.
 *
 * Deliberately self-contained: no link back into the app, because guardians
 * have no account to sign in to. Everything they need is in the message, and
 * the school's own address is the reply-to, so a query about a mark goes to
 * the school rather than into a no-reply void.
 */
export function renderResultsEmail({
  guardianName, studentName, schoolName, className, term, session,
  subjects, summary, position, classSize,
}) {
  const termName = term ? `${term[0].toUpperCase()}${term.slice(1)} term` : '';
  const heading = [termName, session].filter(Boolean).join(' ');

  const rows = subjects
    .map(
      (s) => `
                  <tr>
                    <td style="padding:9px 12px;border-bottom:1px solid #eceff1;font-size:14px;">${esc(s.subject)}</td>
                    <td style="padding:9px 12px;border-bottom:1px solid #eceff1;font-size:14px;text-align:right;">
                      ${esc(s.score)}<span style="color:#919eab;">/${esc(s.maxScore)}</span>
                    </td>
                    <td style="padding:9px 12px;border-bottom:1px solid #eceff1;font-size:14px;text-align:center;font-weight:600;">${esc(s.grade)}</td>
                  </tr>`
    )
    .join('');

  const table = `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:20px 0;border-collapse:collapse;">
                  <tr>
                    <th align="left" style="padding:8px 12px;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#919eab;border-bottom:2px solid #e3e7ea;">Subject</th>
                    <th align="right" style="padding:8px 12px;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#919eab;border-bottom:2px solid #e3e7ea;">Score</th>
                    <th align="center" style="padding:8px 12px;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#919eab;border-bottom:2px solid #e3e7ea;">Grade</th>
                  </tr>${rows}
                </table>`;

  const html = page({
    org: schoolName || 'School BPM',
    title: `${studentName} — ${heading}`,
    subtitle: className ? `Class ${className}` : '',
    body: `
                <p style="font-size:15px;line-height:1.6;margin:16px 0 0;">
                  Dear ${esc(greeting(guardianName))}, the results for ${esc(heading.toLowerCase())} are now available.
                </p>${table}${panel([
                  { label: 'Average', value: `${summary.average}%` },
                  { label: 'Subjects passed', value: `${summary.passed} of ${summary.count}` },
                  ...(position ? [{ label: 'Position in class', value: `${position} of ${classSize}` }] : []),
                ])}
                <p style="font-size:14px;line-height:1.6;color:#637381;margin:20px 0 0;">
                  Reply to this email if you would like to discuss these results with the school.
                </p>`,
    footer: `Sent by ${esc(schoolName || 'the school')} to the guardian address held on file for ${esc(studentName)}.`,
  });

  const text = [
    schoolName || 'School BPM',
    '',
    `${studentName} — ${heading}`,
    className ? `Class ${className}` : null,
    '',
    ...subjects.map((s) => `  ${s.subject}: ${s.score}/${s.maxScore}  (${s.grade})`),
    '',
    `Average:         ${summary.average}%`,
    `Subjects passed: ${summary.passed} of ${summary.count}`,
    ...(position ? [`Position:        ${position} of ${classSize}`] : []),
    '',
    'Reply to this email to discuss these results with the school.',
    // Only the conditional lines are dropped; the '' entries are the blank
    // lines that keep the plain-text part readable.
  ].filter((line) => line !== null).join('\n');

  return { subject: `${studentName} — ${heading} results`, html, text };
}

/**
 * A bulk announcement from a school.
 *
 * The body is written by a member of school staff in a plain textarea and is
 * escaped like everything else here — a message about "<3 our pupils" must
 * arrive as text, not as a broken tag. Line breaks are the only formatting
 * carried through, which keeps the escaping total.
 */
export function renderAnnouncementEmail({ recipientName, schoolName, subject, body, replyTo }) {
  const paragraphs = String(body || '')
    .split(/\n{2,}/)
    .map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px;">${esc(p).replace(/\n/g, '<br />')}</p>`)
    .join('');

  const html = page({
    org: schoolName || 'School BPM',
    title: subject,
    body: `
                <p style="font-size:15px;line-height:1.6;margin:16px 0 14px;">
                  Dear ${esc(greeting(recipientName))},
                </p>${paragraphs}`,
    footer: replyTo
      ? `Sent by ${esc(schoolName || 'the school')}. Reply to this email to reach the school office.`
      : `Sent by ${esc(schoolName || 'the school')}.`,
  });

  const text = [
    schoolName || 'School BPM',
    '',
    subject,
    '',
    `Dear ${greeting(recipientName)},`,
    '',
    String(body || ''),
  ].join('\n');

  return { subject, html, text };
}
