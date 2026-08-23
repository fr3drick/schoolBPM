import mongoose from 'mongoose';

/**
 * A single-use password reset token.
 *
 * Only the SHA-256 hash of the token is stored. The raw value exists just
 * long enough to be emailed, so a leaked database backup cannot be used to
 * seize accounts — the same reasoning as storing password hashes.
 */
const passwordResetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    requestedIp: { type: String, default: '' },
  },
  { timestamps: true }
);

// Mongo sweeps expired documents automatically; code still checks expiry,
// since the TTL monitor only runs about once a minute.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('PasswordReset', passwordResetSchema);
