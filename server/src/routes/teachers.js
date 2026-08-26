import { Router } from 'express';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Class from '../models/Class.js';
import { requireAuth, requireSchool, requireModule, permit } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireSchool, requireModule('teachers'), permit('teachers.view'));

/**
 * The teaching staff directory.
 *
 * Membership comes from roles flagged `isTeaching`, not from a role called
 * "Teacher". Roles are the school's own data — it may rename the seeded one,
 * or run several teaching roles alongside it — and a directory that matched
 * on the name would go quietly empty after a rename, or list only half the
 * staff. The flag is editable on the Roles screen, so a school decides for
 * itself what counts as teaching staff.
 *
 * Read-only. Creating and editing accounts stays in Administration → Users
 * under `users.manage`; a second place to edit the same records would be one
 * place too many to keep consistent.
 */
router.get('/', async (req, res) => {
  const schoolId = req.user.school._id;

  const teachingRoles = await Role.find({ school: schoolId, isTeaching: true }).select('_id name');
  if (!teachingRoles.length) {
    // An empty directory and "no role is marked as teaching" look identical
    // on screen, and the fix for the second is not obvious. Say which it is.
    return res.json({ teachers: [], teachingRoles: [], configured: false });
  }

  const roleIds = teachingRoles.map((r) => r._id);
  const users = await User.find({ school: schoolId, role: { $in: roleIds } })
    .populate('role', 'name')
    .sort({ name: 1 });

  // Form-teacher assignments, which is the one piece of context that makes
  // this a directory rather than a filtered user list.
  const classes = await Class.find({
    school: schoolId,
    formTeacher: { $in: users.map((u) => u._id) },
  }).select('name formTeacher active');

  const classesByTeacher = new Map();
  for (const c of classes) {
    const key = String(c.formTeacher);
    if (!classesByTeacher.has(key)) classesByTeacher.set(key, []);
    classesByTeacher.get(key).push({ _id: c._id, name: c.name, active: c.active });
  }

  res.json({
    configured: true,
    teachingRoles: teachingRoles.map((r) => ({ _id: r._id, name: r.name })),
    teachers: users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role?.name || '',
      active: u.active,
      mustChangePassword: u.mustChangePassword,
      formClasses: classesByTeacher.get(String(u._id)) || [],
      createdAt: u.createdAt,
    })),
  });
});

export default router;
