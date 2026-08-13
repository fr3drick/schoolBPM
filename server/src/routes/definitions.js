import { Router } from 'express';
import ProcessDefinition, { FIELD_TYPES } from '../models/ProcessDefinition.js';
import ProcessInstance from '../models/ProcessInstance.js';
import Role from '../models/Role.js';
import { requireAuth, permit, hasPerm } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

const router = Router();
router.use(requireAuth);

function canInitiate(user, def) {
  return (
    hasPerm(user, 'instances.initiate') &&
    def.active &&
    (def.initiatorRoles.length === 0 ||
      def.initiatorRoles.some((r) => String(r._id || r) === String(user.role._id)))
  );
}

// ?all=1 (designers only) returns every definition incl. inactive ones;
// otherwise: the active definitions the caller is allowed to start.
router.get('/', async (req, res) => {
  if (req.query.all === '1' && hasPerm(req.user, 'definitions.manage')) {
    const definitions = await ProcessDefinition.find()
      .populate('initiatorRoles', 'name')
      .populate('steps.approverRoles', 'name')
      .sort({ name: 1 });
    return res.json({ definitions });
  }
  if (!hasPerm(req.user, 'instances.initiate')) return res.json({ definitions: [] });
  const definitions = await ProcessDefinition.find({
    active: true,
    $or: [{ initiatorRoles: { $size: 0 } }, { initiatorRoles: req.user.role._id }],
  })
    .populate('steps.approverRoles', 'name')
    .sort({ name: 1 });
  res.json({ definitions });
});

router.get('/:id', async (req, res) => {
  const def = await ProcessDefinition.findById(req.params.id)
    .populate('initiatorRoles', 'name')
    .populate('steps.approverRoles', 'name');
  if (!def) throw httpError(404, 'Process not found');
  if (!hasPerm(req.user, 'definitions.manage') && !canInitiate(req.user, def)) {
    throw httpError(403, 'You cannot start this process');
  }
  res.json({ definition: def });
});

function slugify(text) {
  return (
    String(text)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'field'
  );
}

async function validateDefinition(body, excludeId) {
  const {
    name,
    key,
    category = 'General',
    description = '',
    initiatorRoles = [],
    fields = [],
    steps = [],
    active = true,
  } = body || {};

  if (!name?.trim()) throw httpError(400, 'Process name is required');
  if (!/^[A-Za-z]{2,5}$/.test(key || '')) {
    throw httpError(400, 'Key must be 2–5 letters (used for reference numbers, e.g. LR)');
  }
  const upperKey = String(key).toUpperCase();
  if (await ProcessDefinition.findOne({ name: name.trim(), _id: { $ne: excludeId } })) {
    throw httpError(409, 'A process with this name already exists');
  }
  if (await ProcessDefinition.findOne({ key: upperKey, _id: { $ne: excludeId } })) {
    throw httpError(409, 'A process with this key already exists');
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    throw httpError(400, 'At least one approval step is required');
  }

  const roleIds = new Set(
    [...initiatorRoles, ...steps.flatMap((s) => s.approverRoles || [])].map(String)
  );
  if (roleIds.size) {
    const found = await Role.countDocuments({ _id: { $in: [...roleIds] } });
    if (found !== roleIds.size) throw httpError(400, 'One or more referenced roles do not exist');
  }

  const seen = new Set();
  const cleanFields = (Array.isArray(fields) ? fields : []).map((f) => {
    if (!f?.label?.trim()) throw httpError(400, 'Every form field needs a label');
    if (!FIELD_TYPES.includes(f.type)) throw httpError(400, `Invalid field type: ${f.type}`);
    const base = slugify(f.key || f.label);
    let candidate = base;
    let n = 2;
    while (seen.has(candidate)) candidate = `${base}_${n++}`;
    seen.add(candidate);
    const options = Array.isArray(f.options) ? f.options.map((o) => String(o).trim()).filter(Boolean) : [];
    if (f.type === 'select' && options.length === 0) {
      throw httpError(400, `Select field "${f.label}" needs at least one option`);
    }
    return {
      key: candidate,
      label: f.label.trim(),
      type: f.type,
      required: Boolean(f.required),
      options: f.type === 'select' ? options : [],
      placeholder: f.placeholder || '',
    };
  });

  const cleanSteps = steps.map((s, i) => {
    if (!s?.name?.trim()) throw httpError(400, `Step ${i + 1} needs a name`);
    if (!Array.isArray(s.approverRoles) || s.approverRoles.length === 0) {
      throw httpError(400, `Step "${s.name}" needs at least one approver role`);
    }
    return { name: s.name.trim(), approverRoles: s.approverRoles, instructions: s.instructions || '' };
  });

  return {
    name: name.trim(),
    key: upperKey,
    category,
    description,
    initiatorRoles,
    fields: cleanFields,
    steps: cleanSteps,
    active: Boolean(active),
  };
}

router.post('/', permit('definitions.manage'), async (req, res) => {
  const clean = await validateDefinition(req.body);
  const def = await ProcessDefinition.create({ ...clean, createdBy: req.user._id });
  logAudit(req.user, 'definitions.create', 'definition', def._id, { name: def.name });
  res.status(201).json({ definition: def });
});

router.put('/:id', permit('definitions.manage'), async (req, res) => {
  const def = await ProcessDefinition.findById(req.params.id);
  if (!def) throw httpError(404, 'Process not found');
  const clean = await validateDefinition(req.body, def._id);
  Object.assign(def, clean);
  await def.save();
  logAudit(req.user, 'definitions.update', 'definition', def._id, { name: def.name });
  res.json({ definition: def });
});

router.delete('/:id', permit('definitions.manage'), async (req, res) => {
  const def = await ProcessDefinition.findById(req.params.id);
  if (!def) throw httpError(404, 'Process not found');
  const count = await ProcessInstance.countDocuments({ definition: def._id });
  if (count) {
    throw httpError(400, `Cannot delete: ${count} request(s) exist for this process. Deactivate it instead.`);
  }
  await def.deleteOne();
  logAudit(req.user, 'definitions.delete', 'definition', def._id, { name: def.name });
  res.json({ ok: true });
});

export default router;
