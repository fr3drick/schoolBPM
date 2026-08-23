import mongoose from 'mongoose';

/**
 * A self-onboarding application, from the first form to the moment it becomes
 * a School.
 *
 * The account cannot exist as a User yet: a User needs a school and a role,
 * and neither exists until the applicant has verified their address and told
 * us which school they are. So the chosen password lives here as a hash
 * (never plaintext) and is handed straight to the User at conversion, which
 * is why a self-signed-up Super Admin is not forced to change it — unlike an
 * account provisioned for them with a temporary password.
 *
 * Statuses:
 *   pending_verification  code emailed, awaiting the OTP
 *   verified              address proven; holds a token authorising the school step
 *   submitted             converted into a School + Super Admin, awaiting review
 */
const schoolSignupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },

    /**
     * SHA-256 of the six-digit code. A six-digit space is small enough that
     * hashing is no real barrier to an attacker holding the database — the
     * protections that matter are the attempt counter and the expiry. It is
     * hashed anyway so the live code never sits in plaintext in a backup or a
     * query log, the same reasoning as PasswordReset.
     */
    otpHash: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },
    // Increments per issued code, giving each OTP email a distinct dedupeKey.
    otpCount: { type: Number, default: 0 },
    emailVerifiedAt: { type: Date, default: null },

    // Issued on successful verification; authorises the school-details step.
    // Stored as a hash for the same reason as a password reset token.
    tokenHash: { type: String, default: null },
    tokenExpiresAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ['pending_verification', 'verified', 'submitted'],
      default: 'pending_verification',
      index: true,
    },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    requestedIp: { type: String, default: '' },

    /**
     * Sweeps abandoned applications. Set to null on submission — a TTL index
     * ignores documents whose field is not a date, so a converted signup is
     * kept as the record of how that school arrived.
     */
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

schoolSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('SchoolSignup', schoolSignupSchema);
