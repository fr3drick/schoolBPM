import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).populate('role');
    if (!user || !user.active) return res.status(401).json({ error: 'Account is not active' });
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
