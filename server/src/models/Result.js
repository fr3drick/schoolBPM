import mongoose from 'mongoose';

/**
 * One score, for one student, in one subject, in one exam.
 *
 * A row per cell rather than an array on the exam: teachers enter results a
 * class at a time over days, several of them at once, and a per-cell document
 * means two teachers saving different subjects cannot overwrite each other's
 * work the way a whole-document update would.
 */
const resultSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    score: { type: Number, required: true, min: 0 },
    // Stored, not derived on read: a school that changes its grading scale
    // must not silently restate the grades on results already issued.
    grade: { type: String, default: '' },
    remark: { type: String, default: '', trim: true },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

resultSchema.index({ exam: 1, student: 1, subject: 1 }, { unique: true });

export default mongoose.model('Result', resultSchema);
