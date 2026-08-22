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
  const firstName = String(recipientName || '').split(' ')[0] || 'there';

  const html = `<!doctype html>
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
                  ${esc(schoolName || 'School BPM')}
                </div>
                <h1 style="margin:12px 0 4px;font-size:20px;font-weight:600;">
                  ${esc(reference)} ${esc(meta.verb)}
                </h1>
                <div style="font-size:14px;color:#637381;">${esc(processName)}</div>
                <p style="font-size:15px;line-height:1.5;margin:20px 0 0;">Hi ${esc(firstName)},</p>
                <p style="font-size:15px;line-height:1.5;margin:8px 0 0;">${esc(message)}</p>
                ${button(url, label)}
                <p style="font-size:12px;color:#637381;line-height:1.5;margin:0;">
                  If the button does not work, paste this into your browser:<br />
                  <span style="color:#1565c0;">${esc(url)}</span>
                </p>
                <hr style="border:none;border-top:1px solid #e3e7ea;margin:24px 0 12px;" />
                <p style="font-size:12px;color:#919eab;line-height:1.5;margin:0;">
                  You are receiving this because of your role in ${esc(schoolName || 'your school')}
                  on School BPM. Reply to this email to reach your school office.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

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
