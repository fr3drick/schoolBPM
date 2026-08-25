import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Globally unique: the account's school is derived from the user record,
    // so sign-in needs no tenant picker.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // null only for platform staff (isPlatformAdmin).
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    // Platform admins onboard and suspend schools; they hold no school role
    // and therefore no school permissions — they never see school data.
    isPlatformAdmin: { type: Boolean, default: false },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: function () {
        return !this.isPlatformAdmin;
      },
    },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    // Stamped into every JWT. Bumping it invalidates tokens already issued,
    // so a password change or reset ends sessions elsewhere instead of
    // leaving a compromised one alive until it expires.
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.methods.toProfile = function () {
  const role = this.role;
  const school = this.school;
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    active: this.active,
    mustChangePassword: this.mustChangePassword,
    isPlatformAdmin: this.isPlatformAdmin,
    createdAt: this.createdAt,
    school:
      school && school.name
        ? {
            id: school._id,
            name: school.name,
            slug: school.slug,
            active: school.active,
            // The client needs these to explain a school still awaiting
            // review, or one that was turned down.
            status: school.status,
            rejectionReason: school.rejectionReason || '',
            submittedAt: school.submittedAt,
            // Drives which nav items and routes the client offers: a feature
            // whose module is off must not be reachable in the UI either.
            modules: school.modules || [],
          }
        : school,
    role:
      role && role.name
        ? { id: role._id, name: role.name, permissions: role.permissions, isSystem: role.isSystem }
        : role,
  };
};

export default mongoose.model('User', userSchema);
