import { Router } from 'express';
import Notification from '../models/Notification.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const [notifications, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ notifications, unread });
});

router.post('/read-all', async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
});

router.post('/:id/read', async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { read: true } });
  res.json({ ok: true });
});

export default router;
