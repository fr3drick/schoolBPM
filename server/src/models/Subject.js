import mongoose from 'mongoose';
import { CI } from './collation.js';

const subjectSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    // Short code used on result sheets where space is tight, e.g. "MTH".
    code: { type: String, default: '', trim: true, uppercase: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Case-insensitive: a school must not end up with both "Mathematics"
// and "mathematics" as separate subjects.
subjectSchema.index({ school: 1, name: 1 }, { unique: true, collation: CI });
// Sparse: a code is optional, and many blank codes must not collide.
subjectSchema.index({ school: 1, code: 1 }, { unique: true, sparse: true, collation: CI });

export default mongoose.model('Subject', subjectSchema);
