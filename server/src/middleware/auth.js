import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).populate('role').populate('school');
    if (!user || !user.active) return res.status(401).json({ error: 'Account is not active' });
    if (!user.isPlatformAdmin && (!user.school || !user.school.active)) {
      return res.status(401).json({ error: 'Your school is not active on this platform' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Passes if the user's role has ANY of the listed permissions.
export function permit(...allowed) {
  return (req, res, next) => {
    const perms = req.user?.role?.permissions || [];
    if (allowed.some((p) => perms.includes(p))) return next();
    return res.status(403).json({ error: 'You do not have permission to do this' });
  };
}

export function hasPerm(user, perm) {
  return (user?.role?.permissions || []).includes(perm);
}

// Platform staff only: school onboarding and suspension.
export function requirePlatformAdmin(req, res, next) {
  if (req.user?.isPlatformAdmin) return next();
  return res.status(403).json({ error: 'Platform administrator access required' });
}

// School-scoped routes: rejects platform staff, who belong to no school.
export function requireSchool(req, res, next) {
  if (req.user?.school) return next();
  return res.status(403).json({ error: 'This area belongs to a school account' });
}
