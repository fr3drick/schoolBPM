import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { requireAuth, permit } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

const router = Router();
router.use(requireAuth, permit('users.manage'));

router.get('/', async (req, res) => {
  const users = await User.find().populate('role').sort({ createdAt: -1 });
  res.json({ users: users.map((u) => u.toProfile()) });
});

router.post('/', async (req, res) => {
  const { name, email, password, roleId, mustChangePassword = true } = req.body || {};
  if (!name || !email || !password || !roleId) {
    throw httpError(400, 'Name, email, password and role are required');
  }
  if (String(password).length < 8) throw httpError(400, 'Password must be at least 8 characters');
  const role = await Role.findById(roleId);
  if (!role) throw httpError(400, 'Role not found');
  if (await User.findOne({ email: String(email).toLowerCase() })) {
    throw httpError(409, 'A user with this email already exists');
  }
  const user = await User.create({
    name,
    email,
    role: role._id,
    passwordHash: await bcrypt.hash(password, 10),
    mustChangePassword: Boolean(mustChangePassword),
  });
  logAudit(req.user, 'users.create', 'user', user._id, { email: user.email, role: role.name });
  await user.populate('role');
  res.status(201).json({ user: user.toProfile() });
});

router.put('/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw httpError(404, 'User not found');
  const { name, email, roleId, active } = req.body || {};
  if (active === false && String(user._id) === String(req.user._id)) {
    throw httpError(400, 'You cannot deactivate your own account');
  }
  if (name !== undefined) user.name = name;
  if (email !== undefined) {
    const clash = await User.findOne({ email: String(email).toLowerCase(), _id: { $ne: user._id } });
    if (clash) throw httpError(409, 'A user with this email already exists');
    user.email = email;
  }
  if (roleId !== undefined) {
    const role = await Role.findById(roleId);
    if (!role) throw httpError(400, 'Role not found');
    user.role = role._id;
  }
  if (active !== undefined) user.active = Boolean(active);
  await user.save();
  logAudit(req.user, 'users.update', 'user', user._id, { name, email, roleId, active });
  await user.populate('role');
  res.json({ user: user.toProfile() });
});

router.post('/:id/reset-password', async (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 8) {
    throw httpError(400, 'Password must be at least 8 characters');
  }
  const user = await User.findById(req.params.id);
  if (!user) throw httpError(404, 'User not found');
  user.passwordHash = await bcrypt.hash(password, 10);
  user.mustChangePassword = true;
  await user.save();
  logAudit(req.user, 'users.reset_password', 'user', user._id);
  res.json({ ok: true });
});

export default router;
