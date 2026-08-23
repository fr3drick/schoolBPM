import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Rate limits for the unauthenticated auth endpoints.
 *
 * Sizing note: a school's staff share one public IP behind NAT, so a tight
 * per-IP cap would lock out a whole staff room signing in at 8am. Login
 * therefore counts only FAILED attempts (successful sign-ins are skipped),
 * which is what brute force actually generates, and forgot-password is
 * capped per email address as well as per IP.
 *
 * Counters are in-process, so limits are per API instance. Behind a proxy,
 * set TRUST_PROXY so req.ip is the real client rather than the load
 * balancer — otherwise every user shares one bucket.
 */

const message = { error: 'Too many attempts. Please wait a few minutes and try again.' };
const common = { standardHeaders: 'draft-7', legacyHeaders: false, message };

const emailKey = (req) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  return email || ipKeyGenerator(req.ip);
};

/** Failed sign-ins per account. Credential stuffing targets one login at a time. */
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: emailKey,
});

/** Blunt ceiling on failed sign-ins from one address, for spray attacks. */
export const loginIpLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 100,
  skipSuccessfulRequests: true,
});

/** One person should never need many reset links in an hour. */
export const forgotPasswordEmailLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: emailKey,
});

/** Generous enough for a whole school behind one IP, tight enough to stop a flood. */
export const forgotPasswordIpLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
});

/** Guessing a 256-bit token is hopeless, so this only stops hammering. */
export const resetPasswordLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
});

/**
 * Self-onboarding. Every school arrives through these endpoints, so they are
 * the platform's front door for strangers: each one either sends mail to an
 * address someone typed, or guesses at a six-digit code.
 */

/** Starting an application mails a stranger's address — cap it hard per address. */
export const signupEmailLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: emailKey,
});

/** One network should not be able to register schools in bulk. */
export const signupIpLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 20,
});

/**
 * Code guessing. The per-application attempt counter is the real defence —
 * six wrong guesses burn the code — but this stops one host working through
 * many applications at once.
 */
export const signupVerifyLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
});
