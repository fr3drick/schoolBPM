import { Router } from 'express';
import bcrypt from 'bcryptjs';
import School from '../models/School.js';
import User from '../models/User.js';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { createSchoolAdmin, provisionSchool } from '../services/provisioning.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

const router = Router();
router.use(requireAuth, requirePlatformAdmin);

router.get('/', async (req, res) => {
  const schools = await School.find().sort({ createdAt: 1 });
  const counts = await User.aggregate([
    { $match: { school: { $ne: null } } },
    { $group: { _id: '$school', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({
    schools: schools.map((s) => ({
      _id: s._id,
      name: s.name,
      slug: s.slug,
      contactEmail: s.contactEmail,
      active: s.active,
      createdAt: s.createdAt,
      userCount: countMap.get(String(s._id)) || 0,
    })),
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
  logAudit(req.user, 'schools.create', 'school', school._id, { name: school.name, admin: admin.email }, school._id);
  res.status(201).json({
    school,
    admin: { id: admin._id, name: admin.name, email: admin.email, mustChangePassword: admin.mustChangePassword },
  });
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
  await user.save();
  logAudit(req.user, 'schools.reset_user_password', 'user', user._id, { email: user.email }, school._id);
  res.json({ ok: true });
});

export default router;
