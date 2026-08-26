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
    // Marks a role as teaching staff, which is what the teacher directory
    // lists. A flag rather than matching the name "Teacher": roles are the
    // school's own data, so it may rename the seeded one or run several
    // teaching roles — Senior Teacher, Head of Department — and a directory
    // that matched on a name would quietly go empty or miss half the staff.
    isTeaching: { type: Boolean, default: false },
  },
  { timestamps: true }
);

roleSchema.index({ school: 1, name: 1 }, { unique: true });

export default mongoose.model('Role', roleSchema);
