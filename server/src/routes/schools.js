import { Router } from 'express';
import bcrypt from 'bcryptjs';
import School from '../models/School.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { createSchoolAdmin, provisionSchool } from '../services/provisioning.js';
import { logAudit } from '../services/audit.js';
import { sendWelcomeEmail } from '../services/welcome.js';
import { notifySchoolApproved, notifySchoolRejected } from '../services/onboarding.js';
import { httpError } from '../services/errors.js';
import { MODULES, validateModuleSelection } from '../modules.js';

const router = Router();
router.use(requireAuth, requirePlatformAdmin);

/**
 * Every tenant, review queue included. Each row carries the account that
 * registered it, since approving a school is really a decision about whether
 * the person asking speaks for it — a name and a slug are not enough to judge.
 */
router.get('/', async (req, res) => {
  const schools = await School.find().sort({ createdAt: 1 });
  const counts = await User.aggregate([
    { $match: { school: { $ne: null } } },
    { $group: { _id: '$school', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  // One query for the Super Admins of every school, rather than one per row.
  const adminRoles = await Role.find({ isSystem: true, name: 'Super Admin' }).select('_id school');
  const admins = await User.find({ role: { $in: adminRoles.map((r) => r._id) } })
    .select('name email school createdAt')
    .sort({ createdAt: 1 });
  const adminMap = new Map();
  for (const a of admins) {
    if (!adminMap.has(String(a.school))) adminMap.set(String(a.school), { name: a.name, email: a.email });
  }

  res.json({
    schools: schools.map((s) => ({
      _id: s._id,
      name: s.name,
      slug: s.slug,
      contactEmail: s.contactEmail,
      contactPhone: s.contactPhone,
      address: s.address,
      city: s.city,
      state: s.state,
      country: s.country,
      website: s.website,
      staffCount: s.staffCount,
      status: s.status,
      rejectionReason: s.rejectionReason,
      selfSignup: s.selfSignup,
      submittedAt: s.submittedAt,
      reviewedAt: s.reviewedAt,
      active: s.active,
      modules: s.modules,
      createdAt: s.createdAt,
      userCount: countMap.get(String(s._id)) || 0,
      admin: adminMap.get(String(s._id)) || null,
    })),
    pendingCount: schools.filter((s) => s.status === 'pending').length,
  });
});

// Onboard a school: creates the tenant, its default roles, optionally the
// starter process templates, and its first Super Admin account.
router.post('/', async (req, res) => {
  const {
    name,
    slug,
    contactEmail = '',
    adminName,
    adminEmail,
    adminPassword,
    seedTemplates = true,
  } = req.body || {};

  if (!name?.trim() || !slug?.trim()) throw httpError(400, 'School name and slug are required');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    throw httpError(400, 'Slug must be lowercase letters, digits and hyphens (e.g. sunrise-high)');
  }
  if (!adminName?.trim() || !adminEmail?.trim() || !adminPassword) {
    throw httpError(400, 'An initial Super Admin (name, email, password) is required');
  }
  const adminPassStr = String(adminPassword);
  if (adminPassStr.length < 8 || adminPassStr.length > 72) {
    throw httpError(400, 'Admin password must be between 8 and 72 characters');
  }
  if (await School.findOne({ $or: [{ name: name.trim() }, { slug: slug.trim() }] })) {
    throw httpError(409, 'A school with this name or slug already exists');
  }
  if (await User.findOne({ email: String(adminEmail).toLowerCase().trim() })) {
    throw httpError(409, 'A user with this email already exists');
  }

  const school = await School.create({ name: name.trim(), slug: slug.trim(), contactEmail: String(contactEmail).trim() });
  const roleMap = await provisionSchool(school, { seedTemplates: Boolean(seedTemplates) });
  const admin = await createSchoolAdmin(school, roleMap, {
    name: adminName.trim(),
    email: String(adminEmail).toLowerCase().trim(),
    password: adminPassStr,
  });
  await sendWelcomeEmail(admin, adminPassStr, school);
  logAudit(req.user, 'schools.create', 'school', school._id, { name: school.name, admin: admin.email }, school._id);
  res.status(201).json({
    school,
    admin: { id: admin._id, name: admin.name, email: admin.email, mustChangePassword: admin.mustChangePassword },
  });
});

/** The module catalogue, so the console can render toggles without hardcoding. */
router.get('/modules', (req, res) => {
  res.json({
    modules: MODULES.map((m) => ({
      key: m.key, name: m.name, description: m.description,
      requires: m.requires || [], defaultOn: m.defaultOn,
    })),
  });
});

/**
 * Sets which feature modules a school has. Dependencies are enforced here
 * rather than in the UI, so the rule holds however the endpoint is called.
 */
router.put('/:id/modules', async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) throw httpError(404, 'School not found');

  const { modules, error } = validateModuleSelection(req.body?.modules);
  if (error) throw httpError(400, error);

  const before = [...school.modules];
  school.modules = modules;
  await school.save();

  logAudit(req.user, 'schools.set_modules', 'school', school._id,
    { name: school.name, before, after: modules }, school._id);
  res.json({ school });
});

router.put('/:id', async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) throw httpError(404, 'School not found');
  const { name, contactEmail, active } = req.body || {};
  if (name !== undefined) {
    const clash = await School.findOne({ name: name.trim(), _id: { $ne: school._id } });
    if (clash) throw httpError(409, 'A school with this name already exists');
    school.name = name.trim();
  }
  if (contactEmail !== undefined) school.contactEmail = String(contactEmail).trim();
  if (active !== undefined) school.active = Boolean(active);
  await school.save();
  logAudit(req.user, 'schools.update', 'school', school._id, { name: school.name, active: school.active }, school._id);
  res.json({ school });
});

/**
 * Approve a self-registered school.
 *
 * This is the moment the tenant becomes real: the starter process templates
 * are laid down now rather than at registration, so a school that is never
 * approved leaves nothing behind but the record of having asked. Roles were
 * created at registration and `provisionSchool` is idempotent over them.
 */
router.post('/:id/approve', async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) throw httpError(404, 'School not found');
  if (school.status === 'approved') throw httpError(409, 'This school is already approved');

  school.status = 'approved';
  school.rejectionReason = '';
  school.reviewedAt = new Date();
  school.reviewedBy = req.user._id;
  // An approval is also a reinstatement: a school turned down and then
  // approved must not stay locked out by a suspension nobody remembers.
  school.active = true;
  await school.save();

  await provisionSchool(school, { seedTemplates: Boolean(req.body?.seedTemplates ?? true) });
  await notifySchoolApproved(school);

  logAudit(req.user, 'schools.approve', 'school', school._id, { name: school.name }, school._id);
  res.json({ school });
});

/**
 * Turn a registration down. The account and the school row survive — the
 * reason has to be readable when its Super Admin next signs in, and a
 * decision reversed later should not mean registering from scratch.
 */
router.post('/:id/reject', async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw httpError(400, 'A reason is required so the school knows what to fix');
  if (reason.length > 500) throw httpError(400, 'Reason must be 500 characters or fewer');

  const school = await School.findById(req.params.id);
  if (!school) throw httpError(404, 'School not found');
  if (school.status === 'approved') {
    throw httpError(409, 'This school is already approved. Suspend it instead of rejecting it.');
  }

  school.status = 'rejected';
  school.rejectionReason = reason;
  school.reviewedAt = new Date();
  school.reviewedBy = req.user._id;
  await school.save();

  await notifySchoolRejected(school);

  logAudit(req.user, 'schools.reject', 'school', school._id, { name: school.name, reason }, school._id);
  res.json({ school });
});

// Rescue hatch: reset a school user's password (e.g. a locked-out Super
// Admin) without granting the platform any access to school data.
router.post('/:id/reset-user-password', async (req, res) => {
  const { email, password } = req.body || {};
  const passStr = String(password || '');
  if (!email || passStr.length < 8 || passStr.length > 72) {
    throw httpError(400, 'Email and a password between 8 and 72 characters are required');
  }
  const school = await School.findById(req.params.id);
  if (!school) throw httpError(404, 'School not found');
  const user = await User.findOne({ email: String(email).toLowerCase().trim(), school: school._id });
  if (!user) throw httpError(404, 'No user with this email in this school');
  user.passwordHash = await bcrypt.hash(passStr, 10);
  user.mustChangePassword = true;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  logAudit(req.user, 'schools.reset_user_password', 'user', user._id, { email: user.email }, school._id);
  res.json({ ok: true });
});

export default router;
