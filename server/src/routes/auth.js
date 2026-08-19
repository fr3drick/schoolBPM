import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

const router = Router();

const DUMMY_HASH = '$2a$10$e8wY8b4G4Qc0eQd2rZ9w7eJ8uI9o0p1q2r3s4t5u6v7w8x9y0z1a2';

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw httpError(400, 'Email and password are required');
  const user = await User.findOne({ email: String(email).toLowerCase() })
    .populate('role')
    .populate('school');
  const passwordHash = user ? user.passwordHash : DUMMY_HASH;
  const match = await bcrypt.compare(String(password), passwordHash);
  if (!user || !match) {
    throw httpError(401, 'Invalid email or password');
  }
  if (!user.active) throw httpError(403, 'Your account has been deactivated');
  if (!user.isPlatformAdmin && (!user.school || !user.school.active)) {
    throw httpError(403, 'Your school is not active on this platform');
  }
  const token = jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || '1d',
  });
  logAudit(user, 'auth.login', 'user', user._id);
  res.json({ token, user: user.toProfile() });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toProfile() }));

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) throw httpError(400, 'Current and new password are required');
  const newPassStr = String(newPassword);
  if (newPassStr.length < 8 || newPassStr.length > 72) {
    throw httpError(400, 'New password must be between 8 and 72 characters');
  }
  if (!(await bcrypt.compare(String(currentPassword), req.user.passwordHash))) {
    throw httpError(400, 'Current password is incorrect');
  }
  req.user.passwordHash = await bcrypt.hash(newPassStr, 10);
  req.user.mustChangePassword = false;
  await req.user.save();
  logAudit(req.user, 'auth.change_password', 'user', req.user._id);
  res.json({ ok: true });
});

export default router;
