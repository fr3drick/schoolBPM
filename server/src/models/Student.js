import mongoose from 'mongoose';
import { CI } from './collation.js';

export const STUDENT_STATUSES = ['active', 'graduated', 'withdrawn'];
export const GENDERS = ['male', 'female', 'other', ''];

/**
 * A parent or guardian. An array rather than flat parent fields on the
 * student: schools routinely have two contactable adults with different
 * numbers, and widening this later would be a migration over live data.
 *
 * Email is what results are sent to, but it is optional — plenty of guardians
 * are reachable only by phone, and refusing to record them would push schools
 * into entering fake addresses.
 */
const guardianSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    relationship: { type: String, default: '', trim: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    phone: { type: String, default: '', trim: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

const studentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    admissionNumber: { type: String, required: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    otherNames: { type: String, default: '', trim: true },
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: GENDERS, default: '' },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    guardians: { type: [guardianSchema], default: [] },
    status: { type: String, enum: STUDENT_STATUSES, default: 'active', index: true },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

// The admission number is the school's own identifier, unique within it.
studentSchema.index({ school: 1, admissionNumber: 1 }, { unique: true, collation: CI });
studentSchema.index({ school: 1, lastName: 1, firstName: 1 });

studentSchema.virtual('fullName').get(function () {
  return [this.firstName, this.otherNames, this.lastName].filter(Boolean).join(' ');
});

/** The address results should go to: the primary guardian, else the first with an email. */
studentSchema.methods.resultRecipients = function () {
  return this.guardians.filter((g) => g.email);
};

export default mongoose.model('Student', studentSchema);
