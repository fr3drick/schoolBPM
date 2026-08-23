import { Router } from 'express';
import School from '../models/School.js';
import SchoolSignup from '../models/SchoolSignup.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import {
  signupEmailLimiter,
  signupIpLimiter,
  signupVerifyLimiter,
} from '../middleware/rateLimit.js';
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  consumeSignupToken,
  resendOtp,
  startSignup,
  verifyOtp,
} from '../services/signup.js';
import { createSchoolAdmin, provisionSchool, uniqueSlug } from '../services/provisioning.js';
import { notifyApplicationReceived, notifyPlatformReviewers } from '../services/onboarding.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

/**
 * Public self-onboarding: a school owner or administrator registers their own
 * school instead of asking the platform team to create it.
 *
 *   POST /            name, email, password        -> emails a six-digit code
 *   POST /resend      email                        -> a fresh code
 *   POST /verify      email, code                  -> a token for the next step
 *   POST /school      signupToken, school details  -> School (pending) + Super Admin
 *
 * On enumeration: unlike /auth/forgot-password, this router tells the caller
 * plainly when an address is already registered. A signup form that answers
 * "check your email" for an address that will never receive a code is a trap
 * for the honest majority — someone who forgot they already have an account —
 * and the flow after it (enter the code) makes the pretence impossible to
 * maintain anyway. The rate limiters above are what keep it from becoming a
 * bulk address oracle.
 */
const router = Router();

const clean = (value) => String(value ?? '').trim();
const cleanEmail = (value) => clean(value).toLowerCase();

/** Case-insensitive exact match, so "Sunrise High" cannot be registered twice. */
function nameMatcher(name) {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

function requirePassword(password) {
  const str = String(password ?? '');
  if (str.length < 8 || str.length > 72) {
    throw httpError(400, 'Password must be between 8 and 72 characters');
  }
  return str;
}

/** Step 1 — create (or restart) an application and email the code. */
router.post('/', signupIpLimiter, signupEmailLimiter, async (req, res) => {
  const name = clean(req.body?.name);
  const email = cleanEmail(req.body?.email);
  const password = requirePassword(req.body?.password);

  if (!name) throw httpError(400, 'Your full name is required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'A valid email address is required');

  if (await User.findOne({ email })) {
    throw httpError(409, 'An account with this email already exists. Sign in instead, or reset your password.');
  }
  const existing = await SchoolSignup.findOne({ email });
  if (existing?.status === 'submitted') {
    throw httpError(409, 'This email has already registered a school. Sign in to check its status.');
  }

  await startSignup({ name, email, password, ip: req.ip || '' });
  res.status(201).json({
    ok: true,
    email,
    ttlMinutes: OTP_TTL_MINUTES,
    message: `We sent a six-digit code to ${email}. It expires in ${OTP_TTL_MINUTES} minutes.`,
  });
});

/** Step 1b — a fresh code, for one that expired or never arrived. */
router.post('/resend', signupIpLimiter, signupEmailLimiter, async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const signup = await SchoolSignup.findOne({ email });
  if (!signup || signup.status === 'submitted') {
    throw httpError(404, 'We have no registration in progress for this email. Start again.');
  }
  await resendOtp(signup);
  res.json({
    ok: true,
    ttlMinutes: OTP_TTL_MINUTES,
    message: `A new code is on its way to ${email}.`,
  });
});

/** Step 2 — prove the address, and receive the token for step 3. */
router.post('/verify', signupVerifyLimiter, async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const signup = await SchoolSignup.findOne({ email });
  if (!signup || signup.status === 'submitted') {
    throw httpError(404, 'We have no registration in progress for this email. Start again.');
  }

  const result = await verifyOtp(signup, req.body?.code);
  if (!result.ok) {
    if (result.reason === 'expired') {
      throw httpError(400, 'That code has expired. Ask for a new one.');
    }
    if (result.reason === 'locked') {
      throw httpError(429, `Too many incorrect codes. Ask for a new one — you get ${OTP_MAX_ATTEMPTS} tries per code.`);
    }
    throw httpError(400, `That code is not right. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`);
  }

  res.json({
    ok: true,
    signupToken: result.signupToken,
    expiresInMinutes: result.expiresInMinutes,
    name: signup.name,
    email: signup.email,
  });
});

/**
 * Step 3 — the school itself.
 *
 * Creates the tenant in `pending`, its default roles, and the applicant's
 * Super Admin account. Starter process templates are deliberately withheld
 * until approval: a school that is never approved should leave nothing behind
 * but the record of having asked.
 */
router.post('/school', async (req, res) => {
  const signup = await consumeSignupToken(req.body?.signupToken);
  if (!signup) {
    throw httpError(401, 'Your verification has expired. Start the registration again.');
  }

  const name = clean(req.body?.name);
  const contactEmail = cleanEmail(req.body?.contactEmail);
  const contactPhone = clean(req.body?.contactPhone);
  const address = clean(req.body?.address);
  const city = clean(req.body?.city);
  const state = clean(req.body?.state);
  const country = clean(req.body?.country);
  const website = clean(req.body?.website);
  const rawStaff = req.body?.staffCount;

  if (name.length < 2 || name.length > 120) throw httpError(400, 'School name must be between 2 and 120 characters');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) throw httpError(400, 'A valid school contact email is required');
  if (!contactPhone) throw httpError(400, 'A school contact phone number is required');
  if (!address) throw httpError(400, 'The school address is required');
  if (!city) throw httpError(400, 'The town or city is required');
  if (!country) throw httpError(400, 'The country is required');

  const staffCount = rawStaff === '' || rawStaff === null || rawStaff === undefined ? null : Number(rawStaff);
  if (staffCount !== null && (!Number.isFinite(staffCount) || staffCount < 0 || staffCount > 100000)) {
    throw httpError(400, 'Number of staff must be a number between 0 and 100000');
  }

  if (await School.findOne({ name: nameMatcher(name) })) {
    throw httpError(409, 'A school with this name is already registered. If this is your school, ask its administrator to add you as a user.');
  }
  // Re-checked here and not only at step 1: the address was free an hour ago.
  if (await User.findOne({ email: signup.email })) {
    throw httpError(409, 'An account with this email already exists. Sign in instead.');
  }

  const school = await School.create({
    name,
    slug: await uniqueSlug(name),
    contactEmail,
    contactPhone,
    address,
    city,
    state,
    country,
    website,
    staffCount,
    status: 'pending',
    selfSignup: true,
    submittedAt: new Date(),
  });

  let admin;
  try {
    const roleMap = await provisionSchool(school, { seedTemplates: false });
    admin = await createSchoolAdmin(school, roleMap, {
      name: signup.name,
      email: signup.email,
      // Chosen by the applicant at step 1 and never seen in the clear here.
      passwordHash: signup.passwordHash,
      mustChangePassword: false,
    });
  } catch (err) {
    // No transactions on a standalone MongoDB, so unwind by hand rather than
    // stranding a school nobody can sign in to and whose name is now taken.
    await Role.deleteMany({ school: school._id }).catch(() => {});
    await School.deleteOne({ _id: school._id }).catch(() => {});
    throw err;
  }

  signup.status = 'submitted';
  signup.school = school._id;
  signup.tokenHash = null;
  signup.tokenExpiresAt = null;
  // Keep the record of how this school arrived; null exempts it from the TTL.
  signup.expiresAt = null;
  await signup.save();

  logAudit(admin, 'schools.self_register', 'school', school._id, { name: school.name, admin: admin.email }, school._id);
  await notifyApplicationReceived(admin, school);
  await notifyPlatformReviewers(admin, school);

  res.status(201).json({
    ok: true,
    school: { id: school._id, name: school.name, status: school.status },
    admin: { name: admin.name, email: admin.email },
    message: 'Your school has been submitted for approval. We will email you when it is approved.',
  });
});

export default router;
