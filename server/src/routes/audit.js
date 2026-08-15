import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { requireAuth, permit } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, permit('audit.view'), async (req, res) => {
  const logs = await AuditLog.find({ school: req.user.school._id })
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ logs });
});

export default router;
