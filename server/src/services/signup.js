import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import SchoolSignup from '../models/SchoolSignup.js';
import { enqueue } from './mail/outbox.js';
import { renderSignupOtpEmail } from './mail/templates.js';

/** How long a verification code stays usable. */
const OTP_TTL_MINUTES = Number(process.env.SIGNUP_OTP_TTL_MINUTES || 60);
/** Wrong guesses before a code is burned and a new one must be requested. */
const OTP_MAX_ATTEMPTS = Number(process.env.SIGNUP_OTP_MAX_ATTEMPTS || 6);
/** How long the verified applicant has to finish the school details step. */
const SIGNUP_TOKEN_TTL_MINUTES = Number(process.env.SIGNUP_TOKEN_TTL_MINUTES || 120);
/** Abandoned applications are swept after this long. */
const ABANDONED_TTL_DAYS = 7;

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/**
 * Six digits from a CSPRNG. `randomInt` is uniform over the range, unlike
 * `Math.random() * 900000`, and this is the only secret standing between a
 * stranger and a claim on someone else's address.
 */
function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Stamps a fresh code onto a signup and queues the email.
 *
 * Mutates and saves the document; the caller supplies a new or existing one.
 * Enqueue failures are the outbox's problem, not the applicant's — but a
 * code that was never mailed is useless, so this one does propagate.
 */
async function issueOtp(signup) {
  const code = generateOtp();
  signup.otpHash = sha256(code);
  signup.otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  signup.otpAttempts = 0;
  signup.otpCount += 1;
  signup.status = 'pending_verification';
  signup.emailVerifiedAt = null;
  signup.tokenHash = null;
  signup.tokenExpiresAt = null;
  signup.expiresAt = new Date(Date.now() + ABANDONED_TTL_DAYS * 24 * 60 * 60 * 1000);
  await signup.save();

  const { subject, html, text } = renderSignupOtpEmail({
    recipientName: signup.name,
    code,
    ttlMinutes: OTP_TTL_MINUTES,
  });

  await enqueue([
    {
      school: null,
      to: signup.email,
      toName: signup.name,
      subject,
      html,
      text,
      // One row per issued code, so a resend cannot collide with the last one.
      dedupeKey: `signup-otp:${signup._id}:${signup.otpCount}`,
    },
  ]);

  return signup;
}

/**
 * Starts (or restarts) an application for an address.
 *
 * Re-signing up with an address that has an unfinished application replaces
 * it: the applicant may have mistyped their password, or lost the code. Once
 * the application has become a school there is nothing left to restart —
 * callers check for that before getting here.
 */
export async function startSignup({ name, email, password, ip = '' }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await SchoolSignup.findOne({ email });

  const signup =
    existing ??
    new SchoolSignup({ name, email, passwordHash, requestedIp: ip });

  if (existing) {
    existing.name = name;
    existing.passwordHash = passwordHash;
    existing.requestedIp = ip;
  }

  return issueOtp(signup);
}

/** Re-sends a code for an application that has not been verified yet. */
export async function resendOtp(signup) {
  return issueOtp(signup);
}

/**
 * Checks a code and, on success, returns the raw token authorising the
 * school-details step.
 *
 * Returns `{ ok: false, reason }` rather than throwing, so the route can
 * decide what to tell the caller. Reasons are deliberately coarse: an
 * attacker learns only that the code was wrong, not how close they were.
 */
export async function verifyOtp(signup, code) {
  if (!signup.otpHash || !signup.otpExpiresAt) return { ok: false, reason: 'expired' };
  if (signup.otpExpiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (signup.otpAttempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'locked' };

  const supplied = String(code || '').trim();
  // Fixed-length hashes, so timingSafeEqual has equal-length inputs by
  // construction — a plain === would leak the shared prefix length.
  const match =
    supplied.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(sha256(supplied)), Buffer.from(signup.otpHash));

  if (!match) {
    signup.otpAttempts += 1;
    await signup.save();
    const left = Math.max(OTP_MAX_ATTEMPTS - signup.otpAttempts, 0);
    return { ok: false, reason: left === 0 ? 'locked' : 'mismatch', attemptsLeft: left };
  }

  const raw = crypto.randomBytes(32).toString('hex');
  signup.emailVerifiedAt = new Date();
  signup.status = 'verified';
  // The code is spent: verifying twice must not hand out a second token.
  signup.otpHash = null;
  signup.otpExpiresAt = null;
  signup.otpAttempts = 0;
  signup.tokenHash = sha256(raw);
  signup.tokenExpiresAt = new Date(Date.now() + SIGNUP_TOKEN_TTL_MINUTES * 60 * 1000);
  await signup.save();

  return { ok: true, signupToken: raw, expiresInMinutes: SIGNUP_TOKEN_TTL_MINUTES };
}

/** Resolves the token issued at verification to its still-open application. */
export async function consumeSignupToken(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const signup = await SchoolSignup.findOne({ tokenHash: sha256(raw), status: 'verified' });
  if (!signup || !signup.tokenExpiresAt || signup.tokenExpiresAt.getTime() < Date.now()) return null;
  return signup;
}

export { OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS, SIGNUP_TOKEN_TTL_MINUTES };
