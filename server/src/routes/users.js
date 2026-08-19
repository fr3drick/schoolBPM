import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { requireAuth, permit } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

const router = Router();
router.use(requireAuth, requireSchool, permit('users.manage'));

router.get('/', async (req, res) => {
  const users = await User.find({ school: req.user.school._id })
    .populate('role')
    .sort({ createdAt: -1 });
  res.json({ users: users.map((u) => u.toProfile()) });
});

router.post('/', async (req, res) => {
  const { name, email, password, roleId, mustChangePassword = true } = req.body || {};
  if (!name || !email || !password || !roleId) {
    throw httpError(400, 'Name, email, password and role are required');
  }
  const passStr = String(password);
  if (passStr.length < 8 || passStr.length > 72) {
    throw httpError(400, 'Password must be between 8 and 72 characters');
  }
  const role = await Role.findOne({ _id: roleId, school: req.user.school._id });
  if (!role) throw httpError(400, 'Role not found');
  if (await User.findOne({ email: String(email).toLowerCase() })) {
    throw httpError(409, 'A user with this email already exists');
  }
  const user = await User.create({
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    school: req.user.school._id,
    role: role._id,
    passwordHash: await bcrypt.hash(passStr, 10),
    mustChangePassword: Boolean(mustChangePassword),
  });
  logAudit(req.user, 'users.create', 'user', user._id, { email: user.email, role: role.name });
  await user.populate('role');
  res.status(201).json({ user: user.toProfile() });
});

router.put('/:id', async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!user) throw httpError(404, 'User not found');
  const { name, email, roleId, active } = req.body || {};
  if (active === false && String(user._id) === String(req.user._id)) {
    throw httpError(400, 'You cannot deactivate your own account');
  }
  if (roleId !== undefined && String(user._id) === String(req.user._id)) {
    throw httpError(400, 'You cannot modify your own role');
  }
  if (name !== undefined) user.name = String(name).trim();
  if (email !== undefined) {
    const cleanEmail = String(email).toLowerCase().trim();
    const clash = await User.findOne({ email: cleanEmail, _id: { $ne: user._id } });
    if (clash) throw httpError(409, 'A user with this email already exists');
    user.email = cleanEmail;
  }
  if (roleId !== undefined) {
    const role = await Role.findOne({ _id: roleId, school: req.user.school._id });
    if (!role) throw httpError(400, 'Role not found');
    user.role = role._id;
  }
  if (active !== undefined) user.active = Boolean(active);
  await user.save();
  logAudit(req.user, 'users.update', 'user', user._id, { name: user.name, email: user.email, roleId, active: user.active });
  await user.populate('role');
  res.json({ user: user.toProfile() });
});

router.post('/:id/reset-password', async (req, res) => {
  const { password } = req.body || {};
  const passStr = String(password || '');
  if (passStr.length < 8 || passStr.length > 72) {
    throw httpError(400, 'Password must be between 8 and 72 characters');
  }
  const user = await User.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!user) throw httpError(404, 'User not found');
  user.passwordHash = await bcrypt.hash(passStr, 10);
  user.mustChangePassword = true;
  await user.save();
  logAudit(req.user, 'users.reset_password', 'user', user._id);
  res.json({ ok: true });
});

export default router;
