import mongoose from 'mongoose';
import { CI } from './collation.js';

const subjectSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    // Short code used on result sheets where space is tight, e.g. "MTH".
    // Left unset rather than defaulted to '': the uniqueness index below
    // only covers codes that exist, and an empty string is a value.
    code: { type: String, trim: true, uppercase: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Case-insensitive: a school must not end up with both "Mathematics"
// and "mathematics" as separate subjects.
subjectSchema.index({ school: 1, name: 1 }, { unique: true, collation: CI });
// Partial, not sparse: `sparse` on a compound index only skips a document
// when every indexed field is missing, and `school` is always there — so a
// sparse index here would still index blank codes and let the second subject
// without one collide with the first. The filter indexes real codes only.
subjectSchema.index(
  { school: 1, code: 1 },
  { unique: true, collation: CI, partialFilterExpression: { code: { $type: 'string' } } }
);

export default mongoose.model('Subject', subjectSchema);
