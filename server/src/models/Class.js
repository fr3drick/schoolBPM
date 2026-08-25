import mongoose from 'mongoose';
import { CI } from './collation.js';

const classSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    // Broader grouping, e.g. "JSS1" for "JSS1 A" — useful for reporting later.
    level: { type: String, default: '', trim: true },
    formTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    academicYear: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Case-insensitive, and the CSV import relies on it: it resolves class
// names by lowercasing, which would be ambiguous if two classes differed
// only in case.
classSchema.index({ school: 1, name: 1 }, { unique: true, collation: CI });

export default mongoose.model('Class', classSchema);
