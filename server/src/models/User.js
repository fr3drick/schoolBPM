import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.methods.toProfile = function () {
  const role = this.role;
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    active: this.active,
    mustChangePassword: this.mustChangePassword,
    createdAt: this.createdAt,
    role:
      role && role.name
        ? { id: role._id, name: role.name, permissions: role.permissions, isSystem: role.isSystem }
        : role,
  };
};

export default mongoose.model('User', userSchema);
