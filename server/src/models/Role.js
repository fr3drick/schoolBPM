import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    permissions: { type: [String], default: [] },
    // The seeded Super Admin role: cannot be edited or deleted, so the
    // platform always keeps an account type that manages users/roles only.
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Role', roleSchema);
