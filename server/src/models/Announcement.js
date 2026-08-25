import mongoose from 'mongoose';

export const AUDIENCES = ['staff', 'guardians', 'class_guardians'];

/**
 * A bulk message sent to staff or guardians.
 *
 * Kept as a record of what was said, to whom and by whom, separate from the
 * outbox rows that carry it: the outbox is a delivery queue that ages out per
 * message, while "what did the school tell parents in March" is something a
 * head of school needs to be able to answer later.
 */
const announcementSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    audience: { type: String, enum: AUDIENCES, required: true },
    // Only for class_guardians.
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    sentByName: { type: String, default: '' },
    // What the send actually reached, so the list can show it without
    // recounting a roll that may have changed since.
    recipients: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
  },
  { timestamps: true }
);

announcementSchema.index({ school: 1, createdAt: -1 });

export default mongoose.model('Announcement', announcementSchema);
