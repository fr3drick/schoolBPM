import { Router } from 'express';
import Role from '../models/Role.js';
import User from '../models/User.js';
import ProcessDefinition from '../models/ProcessDefinition.js';
import { requireAuth, permit } from '../middleware/auth.js';
import { PERMISSIONS, PERMISSION_KEYS } from '../permissions.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

const router = Router();
router.use(requireAuth);

// Role lists are also needed by the user editor and the process designer.
router.get('/', permit('roles.manage', 'users.manage', 'definitions.manage'), async (req, res) => {
  const roles = await Role.find().sort({ createdAt: 1 });
  const counts = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({
    roles: roles.map((r) => ({
      id: r._id,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      isSystem: r.isSystem,
      userCount: countMap.get(String(r._id)) || 0,
    })),
  });
});

router.get('/permissions', permit('roles.manage'), (req, res) => {
  res.json({ permissions: PERMISSIONS });
});

function cleanPermissions(perms) {
  if (!Array.isArray(perms)) throw httpError(400, 'permissions must be an array');
  const unknown = perms.filter((p) => !PERMISSION_KEYS.includes(p));
  if (unknown.length) throw httpError(400, `Unknown permissions: ${unknown.join(', ')}`);
  return [...new Set(perms)];
}

router.post('/', permit('roles.manage'), async (req, res) => {
  const { name, description = '', permissions = [] } = req.body || {};
  if (!name?.trim()) throw httpError(400, 'Role name is required');
  if (await Role.findOne({ name: name.trim() })) {
    throw httpError(409, 'A role with this name already exists');
  }
  const role = await Role.create({
    name: name.trim(),
    description,
    permissions: cleanPermissions(permissions),
  });
  logAudit(req.user, 'roles.create', 'role', role._id, { name: role.name, permissions: role.permissions });
  res.status(201).json({ role });
});

router.put('/:id', permit('roles.manage'), async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw httpError(404, 'Role not found');
  if (role.isSystem) throw httpError(400, 'The Super Admin role cannot be modified');
  const { name, description, permissions } = req.body || {};
  if (name !== undefined) {
    const clash = await Role.findOne({ name: name.trim(), _id: { $ne: role._id } });
    if (clash) throw httpError(409, 'A role with this name already exists');
    role.name = name.trim();
  }
  if (description !== undefined) role.description = description;
  if (permissions !== undefined) role.permissions = cleanPermissions(permissions);
  await role.save();
  logAudit(req.user, 'roles.update', 'role', role._id, { name: role.name, permissions: role.permissions });
  res.json({ role });
});

router.delete('/:id', permit('roles.manage'), async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw httpError(404, 'Role not found');
  if (role.isSystem) throw httpError(400, 'The Super Admin role cannot be deleted');
  const userCount = await User.countDocuments({ role: role._id });
  if (userCount) throw httpError(400, `Cannot delete: ${userCount} user(s) still have this role`);
  const defCount = await ProcessDefinition.countDocuments({
    $or: [{ initiatorRoles: role._id }, { 'steps.approverRoles': role._id }],
  });
  if (defCount) {
    throw httpError(400, `Cannot delete: this role is used in ${defCount} process definition(s)`);
  }
  await role.deleteOne();
  logAudit(req.user, 'roles.delete', 'role', role._id, { name: role.name });
  res.json({ ok: true });
});

export default router;
