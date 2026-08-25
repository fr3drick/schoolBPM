import mongoose from 'mongoose';

export const TERMS = ['first', 'second', 'third'];
export const EXAM_STATUSES = ['draft', 'open', 'published'];

/**
 * One exam per class per term.
 *
 * The subject list is held on the exam rather than derived from the school's
 * subjects, because a class does not sit every subject the school teaches and
 * the sheet must not grow a column for the ones it did not.
 */
const examSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    session: { type: String, required: true, trim: true },
    term: { type: String, enum: TERMS, required: true },
    name: { type: String, default: '', trim: true },
    subjects: [
      {
        _id: false,
        subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
        maxScore: { type: Number, default: 100, min: 1, max: 1000 },
      },
    ],
    status: { type: String, enum: EXAM_STATUSES, default: 'draft' },
    // Bumped on every publish. It goes into the email dedupe key, so
    // republishing after a correction sends a fresh message instead of
    // colliding with the first one and going silently undelivered.
    publishCount: { type: Number, default: 0 },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// One exam per class per term per session — the decision the whole feature
// rests on. A second "first term 2026/2027" exam for a class would leave
// report cards with no way to say which one counts.
examSchema.index({ school: 1, class: 1, session: 1, term: 1 }, { unique: true });

examSchema.virtual('label').get(function () {
  const term = this.term ? `${this.term[0].toUpperCase()}${this.term.slice(1)} term` : '';
  return this.name || [term, this.session].filter(Boolean).join(' ');
});

examSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Exam', examSchema);
