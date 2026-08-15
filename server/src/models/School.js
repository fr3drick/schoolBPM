import mongoose from 'mongoose';

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    // Stable machine identifier, e.g. "sunrise-high" (future subdomain use).
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9]+(-[a-z0-9]+)*$/,
    },
    contactEmail: { type: String, default: '' },
    // Deactivating a school locks out all of its users without deleting data.
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('School', schoolSchema);
