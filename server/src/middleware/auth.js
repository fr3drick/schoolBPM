import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getModule } from '../modules.js';

// Reachable whatever state the account or its school is in: without these a
// user who must change their password, or whose school is still under review,
// could not load their own profile to be told so.
const ALWAYS_ALLOWED = ['/api/auth/me', '/api/auth/change-password'];

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const user = await User.findById(payload.sub).populate('role').populate('school');
    if (!user || !user.active) return res.status(401).json({ error: 'Account is not active' });
    // A password change or reset bumps tokenVersion, retiring tokens issued
    // before it. Tokens predating this field carry no `tv` and match 0.
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ error: 'Session ended. Please sign in again.' });
    }
    if (!user.isPlatformAdmin && (!user.school || !user.school.active)) {
      return res.status(401).json({ error: 'Your school is not active on this platform' });
    }
    const currentPath = (req.baseUrl || '') + (req.path || '');
    if (user.mustChangePassword && !ALWAYS_ALLOWED.includes(currentPath)) {
      return res.status(403).json({ error: 'Password change required before accessing other resources' });
    }
    // A school that registered itself is inert until the platform approves it.
    // Its Super Admin may sign in and read their own profile — they have to be
    // told why nothing works — but no school-scoped endpoint answers, so no
    // users can be invited and no process started ahead of the decision.
    if (!user.isPlatformAdmin && user.school.status !== 'approved' && !ALWAYS_ALLOWED.includes(currentPath)) {
      return res.status(403).json({
        error:
          user.school.status === 'rejected'
            ? 'This school registration was not approved'
            : 'Your school is awaiting approval by the platform team',
        schoolStatus: user.school.status,
      });
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

/**
 * The read-only half of `requireModule`, for endpoints that are never
 * module-gated as a whole but assemble a response out of per-module sections.
 * The dashboard is the case this exists for: a school must always be able to
 * reach it, so the router cannot carry `requireModule`, but a section fed by a
 * module the school does not have must not appear in the payload either.
 */
export function hasModule(user, key) {
  if (user?.isPlatformAdmin) return false;
  return (user?.school?.modules || []).includes(key);
}

// Platform staff only: school onboarding and suspension.
export function requirePlatformAdmin(req, res, next) {
  if (req.user?.isPlatformAdmin) return next();
  return res.status(403).json({ error: 'Platform administrator access required' });
}

/**
 * Gates a router on a feature module being enabled for the caller's school.
 *
 * Distinct from `permit`: a missing permission is the user's account, a
 * disabled module is what the school has been given. Saying "you do not have
 * permission" for the latter sends an admin hunting through roles for a
 * setting that was never theirs, so this answers differently and names the
 * module so the UI can say something useful.
 */
export function requireModule(key) {
  return (req, res, next) => {
    // Platform staff hold no school; their own routes are never module-gated.
    if (req.user?.isPlatformAdmin) return next();
    const enabled = req.user?.school?.modules || [];
    if (enabled.includes(key)) return next();
    return res.status(403).json({
      error: `The ${getModule(key)?.name || key} module is not enabled for your school.`,
      module: key,
    });
  };
}

// School-scoped routes: rejects platform staff, who belong to no school.
export function requireSchool(req, res, next) {
  if (req.user?.school) return next();
  return res.status(403).json({ error: 'This area belongs to a school account' });
}
