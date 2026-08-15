import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    permissions: { type: [String], default: [] },
    // Each school's seeded Super Admin role: cannot be edited or deleted, so
    // every school keeps an account type that manages users/roles only.
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

roleSchema.index({ school: 1, name: 1 }, { unique: true });

export default mongoose.model('Role', roleSchema);
