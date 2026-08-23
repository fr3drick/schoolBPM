import EmailOutbox from '../../models/EmailOutbox.js';
import School from '../../models/School.js';
import { sendMail, transportName } from './transport.js';

const MAX_ATTEMPTS = Number(process.env.MAIL_MAX_ATTEMPTS || 5);
const BATCH_SIZE = Number(process.env.MAIL_BATCH_SIZE || 20);
const POLL_MS = Number(process.env.MAIL_POLL_MS || 15000);
// A worker that dies mid-send leaves a row locked; after this it is fair game.
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
// Attempt n waits this long before the next try.
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];

/**
 * Queue messages. Duplicate dedupeKeys are dropped rather than raising, so
 * callers can safely re-run the same notification path.
 */
export async function enqueue(messages) {
  if (!messages?.length) return 0;
  try {
    const docs = await EmailOutbox.insertMany(messages, { ordered: false });
    return docs.length;
  } catch (err) {
    // E11000 on the unique dedupeKey index is the intended no-op.
    if (err?.code === 11000 || err?.writeErrors) {
      const failed = err.writeErrors?.length ?? 0;
      const nonDuplicate = (err.writeErrors || []).filter((e) => e?.err?.code !== 11000);
      if (nonDuplicate.length) console.error('Email enqueue partial failure:', nonDuplicate[0]?.errmsg);
      return messages.length - failed;
    }
    console.error('Email enqueue failed:', err.message);
    return 0;
  }
}

function backoffDate(attempts) {
  const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1] ?? 180;
  return new Date(Date.now() + minutes * 60 * 1000);
}

/** Atomically take one due row so concurrent workers cannot both send it. */
async function claimOne() {
  const now = new Date();
  return EmailOutbox.findOneAndUpdate(
    {
      status: 'pending',
      nextAttemptAt: { $lte: now },
      $or: [{ lockedAt: null }, { lockedAt: { $lt: new Date(now - LOCK_TIMEOUT_MS) } }],
    },
    { $set: { lockedAt: now } },
    { returnDocument: 'after', sort: { nextAttemptAt: 1 } }
  );
}

async function deliver(row) {
  // Checked at send time, not enqueue time, so a school suspended in between
  // goes quiet without leaving stale mail queued.
  if (row.school) {
    const school = await School.findById(row.school).select('active');
    if (!school || !school.active) {
      row.status = 'skipped';
      row.lastError = 'School is not active';
      row.lockedAt = null;
      await row.save();
      return 'skipped';
    }
  }

  try {
    const result = await sendMail({
      to: row.to,
      toName: row.toName,
      fromName: row.fromName,
      replyTo: row.replyTo,
      subject: row.subject,
      html: row.html,
      text: row.text,
      idempotencyKey: row.dedupeKey,
    });
    row.status = 'sent';
    row.sentAt = new Date();
    row.providerId = result?.id || '';
    row.attempts += 1;
    row.lastError = '';
    row.lockedAt = null;
    await row.save();
    return 'sent';
  } catch (err) {
    row.attempts += 1;
    row.lastError = String(err?.message || err).slice(0, 500);
    row.lockedAt = null;
    // A rejected address or malformed payload will never succeed; only
    // transient failures are worth another attempt.
    if (err?.permanent || row.attempts >= MAX_ATTEMPTS) {
      row.status = 'failed';
    } else {
      row.nextAttemptAt = backoffDate(row.attempts);
    }
    await row.save();
    return row.status === 'failed' ? 'failed' : 'retry';
  }
}

/** Drains up to BATCH_SIZE due messages. Returns a per-outcome tally. */
export async function processOutbox() {
  const tally = { sent: 0, failed: 0, retry: 0, skipped: 0 };
  for (let i = 0; i < BATCH_SIZE; i += 1) {
    const row = await claimOne();
    if (!row) break;
    tally[await deliver(row)] += 1;
  }
  return tally;
}

let timer = null;

export function startMailWorker() {
  if (timer) return;
  if (String(process.env.MAIL_WORKER_ENABLED ?? 'true') !== 'true') {
    console.log('Mail worker disabled (MAIL_WORKER_ENABLED=false)');
    return;
  }
  const tick = async () => {
    try {
      const tally = await processOutbox();
      if (tally.sent || tally.failed || tally.skipped) {
        console.log(
          `[mail] sent=${tally.sent} failed=${tally.failed} retry=${tally.retry} skipped=${tally.skipped}`
        );
      }
    } catch (err) {
      console.error('Mail worker tick failed:', err.message);
    }
  };
  timer = setInterval(tick, POLL_MS);
  // Do not hold the event loop open on shutdown.
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`Mail worker started (transport: ${transportName()}, every ${POLL_MS}ms)`);
  tick();
}

export function stopMailWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
