import mongoose from 'mongoose';
import { DEFAULT_MODULES, MODULE_KEYS } from '../modules.js';

export const SCHOOL_STATUSES = ['pending', 'approved', 'rejected'];

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
    // Details a self-onboarding school supplies so the platform has enough to
    // review the application. All optional — a platform-created school has none.
    contactPhone: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: '' },
    website: { type: String, default: '' },
    staffCount: { type: Number, default: null },

    /**
     * Review state, distinct from `active`.
     *
     * A school created by the platform is `approved` from birth (the default,
     * which also leaves every existing row correct). A school that signed
     * itself up starts `pending`: its Super Admin can sign in — they need to
     * be told why nothing works yet — but `requireAuth` blocks every
     * school-scoped endpoint until a platform admin approves it.
     */
    status: { type: String, enum: SCHOOL_STATUSES, default: 'approved', index: true },
    rejectionReason: { type: String, default: '' },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // True when the school arrived through public signup rather than the console.
    // Feature modules the platform has enabled for this school. Validated
    // against the catalogue so a stale key cannot silently grant access.
    modules: {
      type: [{ type: String, enum: MODULE_KEYS }],
      default: () => [...DEFAULT_MODULES],
    },
    selfSignup: { type: Boolean, default: false },

    // Deactivating a school locks out all of its users without deleting data.
    // Orthogonal to `status`: suspension is what a platform admin does to a
    // school it already approved.
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('School', schoolSchema);
