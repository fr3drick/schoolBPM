import { Router } from 'express';
import ProcessInstance from '../models/ProcessInstance.js';
import { requireAuth, requireSchool, hasPerm } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireSchool);

router.get('/stats', async (req, res) => {
  const me = req.user;
  const school = me.school._id;
  const myOpen = await ProcessInstance.countDocuments({
    school,
    initiator: me._id,
    status: { $in: ['in_progress', 'returned'] },
  });

  let myTasks = 0;
  if (hasPerm(me, 'instances.act')) {
    myTasks = await ProcessInstance.countDocuments({
      school,
      status: 'in_progress',
      currentApproverRoles: me.role._id,
      initiator: { $ne: me._id },
    });
  }

  let totals = null;
  if (hasPerm(me, 'instances.view_all')) {
    const agg = await ProcessInstance.aggregate([
      { $match: { school } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    totals = { in_progress: 0, approved: 0, rejected: 0, returned: 0 };
    for (const a of agg) totals[a._id] = a.count;
  }

  const recentMine = await ProcessInstance.find({ school, initiator: me._id })
    .sort({ updatedAt: -1 })
    .limit(5);

  res.json({ myOpen, myTasks, totals, recentMine });
});

export default router;
