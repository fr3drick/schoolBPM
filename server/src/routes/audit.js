import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { requireAuth, requireSchool, permit } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireSchool, permit('audit.view'));

router.get('/', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
  const filter = { school: req.user.school._id };
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ logs, total });
});

export default router;
