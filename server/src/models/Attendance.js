import mongoose from 'mongoose';

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'];

/**
 * One day's register for one class.
 *
 * A document per class-day, with the pupils inside it, rather than a row per
 * pupil per day: the register is always taken, read and corrected as a whole,
 * and a class of forty over a 190-day year is 7,600 rows a term against 190
 * documents. The unique index is what makes "take the register" idempotent —
 * a teacher who submits twice updates the same document.
 */
const attendanceSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    // Midnight in the school's own day, so a register taken at 08:00 and one
    // corrected at 16:00 are the same date rather than two.
    date: { type: Date, required: true },
    records: [
      {
        _id: false,
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
        status: { type: String, enum: ATTENDANCE_STATUSES, default: 'present' },
        note: { type: String, default: '', trim: true },
      },
    ],
    takenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

attendanceSchema.index({ school: 1, class: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);
