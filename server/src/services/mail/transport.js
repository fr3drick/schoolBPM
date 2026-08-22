/**
 * Mail transport abstraction. One interface, three backends chosen by
 * MAIL_PROVIDER so the same application code runs against a local catcher
 * in development and Resend in production.
 *
 *   console  no delivery, logs a summary (default — the app runs unconfigured)
 *   smtp     Nodemailer, for Mailpit locally or any SMTP provider
 *   resend   Resend HTTP API, which accepts an idempotency key
 */

let nodemailerTransport = null;

function provider() {
  return (process.env.MAIL_PROVIDER || 'console').toLowerCase();
}

/** "IdeaVerge School BPM <notifications@example.com>" -> the address only. */
function fromAddress() {
  const raw = process.env.MAIL_FROM || 'School BPM <no-reply@localhost>';
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1].trim() : raw.trim();
}

function fromDefaultName() {
  const raw = process.env.MAIL_FROM || 'School BPM <no-reply@localhost>';
  const match = raw.match(/^\s*"?([^"<]*?)"?\s*</);
  return match ? match[1].trim() : 'School BPM';
}

/**
 * Per-tenant identity without per-tenant domain verification: the mailbox is
 * always ours, only the display name changes to the school's.
 */
function buildFrom(fromName) {
  const name = (fromName || fromDefaultName()).replace(/["\\\r\n]/g, '').trim();
  return name ? `"${name}" <${fromAddress()}>` : fromAddress();
}

async function sendViaSmtp(message) {
  if (!nodemailerTransport) {
    const { default: nodemailer } = await import('nodemailer');
    nodemailerTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT || 1025),
      // Mailpit and most :1025 catchers speak plain SMTP; real providers on
      // 587 upgrade via STARTTLS, which Nodemailer does automatically.
      secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  const info = await nodemailerTransport.sendMail({
    from: buildFrom(message.fromName),
    to: message.toName ? `"${message.toName.replace(/["\\\r\n]/g, '')}" <${message.to}>` : message.to,
    replyTo: message.replyTo || undefined,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
  return { id: info.messageId || '' };
}

async function sendViaResend(message) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  // Second line of defence against duplicates: even if our own dedupe key
  // lets a retry through, Resend collapses identical keys server-side.
  if (message.idempotencyKey) headers['Idempotency-Key'] = message.idempotencyKey;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: buildFrom(message.fromName),
      to: [message.to],
      reply_to: message.replyTo || undefined,
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.message || body?.error?.message || `HTTP ${res.status}`;
    const err = new Error(`Resend rejected the message: ${detail}`);
    // 4xx (except 429) means the message will never be accepted as-is, so
    // the worker should stop retrying it.
    err.permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw err;
  }
  return { id: body?.id || '' };
}

async function sendViaConsole(message) {
  console.log(
    `[mail:console] to=${message.to} subject="${message.subject}" ` +
      `from="${buildFrom(message.fromName)}"${message.replyTo ? ` replyTo=${message.replyTo}` : ''}`
  );
  return { id: `console-${Date.now()}` };
}

export async function sendMail(message) {
  switch (provider()) {
    case 'smtp':
      return sendViaSmtp(message);
    case 'resend':
      return sendViaResend(message);
    default:
      return sendViaConsole(message);
  }
}

export function transportName() {
  return provider();
}
