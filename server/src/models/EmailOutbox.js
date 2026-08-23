import mongoose from 'mongoose';

/**
 * Durable queue of outbound email. Workflow code writes a row here in the
 * same call that creates the in-app notification; a worker sends it later.
 *
 * This avoids the dual-writes problem: an SMTP/API call inside the request
 * path can time out ambiguously, leaving an approval recorded with no mail
 * sent (or mail sent for an action that failed). One local write, then an
 * at-least-once send with retries and a dedupe key to keep it idempotent.
 */
const outboxSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    to: { type: String, required: true },
    toName: { type: String, default: '' },
    fromName: { type: String, default: '' },
    replyTo: { type: String, default: '' },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    text: { type: String, default: '' },
    instance: { type: mongoose.Schema.Types.ObjectId, ref: 'ProcessInstance' },
    // Stable per (event, recipient, occurrence): a retried enqueue collides
    // on the unique index instead of queueing a duplicate message.
    dedupeKey: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped'],
      default: 'pending',
    },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    nextAttemptAt: { type: Date, default: Date.now },
    // Set while a worker holds the row; stale locks are reclaimed on timeout
    // so a crashed worker cannot strand a message.
    lockedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    providerId: { type: String, default: '' },
  },
  { timestamps: true }
);

outboxSchema.index({ status: 1, nextAttemptAt: 1, lockedAt: 1 });
outboxSchema.index({ school: 1, createdAt: -1 });

export default mongoose.model('EmailOutbox', outboxSchema);
