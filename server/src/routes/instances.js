import { Router } from 'express';
import ProcessDefinition from '../models/ProcessDefinition.js';
import ProcessInstance from '../models/ProcessInstance.js';
import { requireAuth, requireSchool, permit, hasPerm } from '../middleware/auth.js';
import { buildSnapshot, nextReference, stepApproverRoleIds, validateData } from '../services/workflow.js';
import { notifyRoles, notifyUsers } from '../services/notify.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';

const router = Router();
router.use(requireAuth, requireSchool);

function isApproverNow(user, instance) {
  return (
    instance.status === 'in_progress' &&
    hasPerm(user, 'instances.act') &&
    instance.currentApproverRoles.some((r) => String(r) === String(user.role._id)) &&
    String(instance.initiator) !== String(user._id)
  );
}

function assertCanView(user, instance) {
  if (String(instance.initiator) === String(user._id)) return;
  if (hasPerm(user, 'instances.view_all')) return;
  if (hasPerm(user, 'instances.act')) {
    const everApprover = (instance.definitionSnapshot.steps || []).some((s) =>
      (s.approverRoles || []).some((r) => String(r.id) === String(user.role._id))
    );
    if (everApprover) return;
  }
  throw httpError(403, 'You do not have access to this request');
}

function viewerContext(user, instance) {
  return {
    canAct: isApproverNow(user, instance),
    canResubmit: instance.status === 'returned' && String(instance.initiator) === String(user._id),
  };
}

router.post('/', permit('instances.initiate'), async (req, res) => {
  const { definitionId, data } = req.body || {};
  const def = await ProcessDefinition.findOne({ _id: definitionId, school: req.user.school._id });
  if (!def || !def.active) throw httpError(400, 'Process not found or inactive');
  const allowed =
    def.initiatorRoles.length === 0 ||
    def.initiatorRoles.some((r) => String(r) === String(req.user.role._id));
  if (!allowed) throw httpError(403, 'Your role cannot start this process');

  const snapshot = await buildSnapshot(def);
  const clean = validateData(snapshot.fields, data);
  const reference = await nextReference(req.user.school._id, def.key);
  const instance = await ProcessInstance.create({
    school: req.user.school._id,
    reference,
    definition: def._id,
    definitionSnapshot: snapshot,
    initiator: req.user._id,
    initiatorName: req.user.name,
    data: clean,
    currentStep: 0,
    currentApproverRoles: stepApproverRoleIds(snapshot, 0),
    status: 'in_progress',
    history: [
      {
        action: 'submitted',
        by: req.user._id,
        byName: req.user.name,
        roleName: req.user.role.name,
        stepIndex: 0,
        stepName: snapshot.steps[0].name,
      },
    ],
  });
  await notifyRoles(
    instance.currentApproverRoles,
    `${reference} · ${snapshot.name}: new request from ${req.user.name} awaits "${snapshot.steps[0].name}"`,
    instance,
    req.user._id
  );
  logAudit(req.user, 'instances.create', 'instance', instance._id, { reference });
  res.status(201).json({ instance });
});

router.get('/mine', async (req, res) => {
  const instances = await ProcessInstance.find({
    school: req.user.school._id,
    initiator: req.user._id,
  }).sort({ updatedAt: -1 });
  res.json({ instances });
});

// The caller's approval queue: in-progress requests whose current step is
// assigned to their role (own requests excluded — no self-approval).
router.get('/tasks', permit('instances.act'), async (req, res) => {
  const instances = await ProcessInstance.find({
    school: req.user.school._id,
    status: 'in_progress',
    currentApproverRoles: req.user.role._id,
    initiator: { $ne: req.user._id },
  }).sort({ updatedAt: 1 });
  res.json({ instances });
});

router.get('/', permit('instances.view_all'), async (req, res) => {
  const filter = { school: req.user.school._id };
  if (req.query.status) filter.status = req.query.status;
  const instances = await ProcessInstance.find(filter).sort({ updatedAt: -1 }).limit(500);
  res.json({ instances });
});

router.get('/:id', async (req, res) => {
  const instance = await ProcessInstance.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!instance) throw httpError(404, 'Request not found');
  assertCanView(req.user, instance);
  res.json({ instance, viewer: viewerContext(req.user, instance) });
});

router.post('/:id/action', permit('instances.act'), async (req, res) => {
  const { action, comment = '' } = req.body || {};
  if (!['approve', 'reject', 'return'].includes(action)) throw httpError(400, 'Invalid action');
  if ((action === 'reject' || action === 'return') && !String(comment).trim()) {
    throw httpError(400, 'A comment is required when rejecting or returning a request');
  }
  const instance = await ProcessInstance.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!instance) throw httpError(404, 'Request not found');
  if (!isApproverNow(req.user, instance)) {
    throw httpError(403, 'This request is not awaiting your action');
  }

  const snapshot = instance.definitionSnapshot;
  const stepIndex = instance.currentStep;
  const stepName = snapshot.steps[stepIndex].name;
  const entry = {
    by: req.user._id,
    byName: req.user.name,
    roleName: req.user.role.name,
    stepIndex,
    stepName,
    comment: String(comment).trim(),
  };

  if (action === 'approve') {
    if (stepIndex + 1 < snapshot.steps.length) {
      instance.currentStep = stepIndex + 1;
      instance.currentApproverRoles = stepApproverRoleIds(snapshot, instance.currentStep);
      instance.history.push({ ...entry, action: 'approved' });
      await instance.save();
      await notifyRoles(
        instance.currentApproverRoles,
        `${instance.reference} · ${snapshot.name}: awaiting "${snapshot.steps[instance.currentStep].name}"`,
        instance,
        instance.initiator
      );
      await notifyUsers(
        [instance.initiator],
        `${instance.reference}: "${stepName}" approved by ${req.user.name}`,
        instance
      );
    } else {
      instance.status = 'approved';
      instance.currentApproverRoles = [];
      instance.history.push({ ...entry, action: 'approved' });
      await instance.save();
      await notifyUsers(
        [instance.initiator],
        `${instance.reference} · ${snapshot.name}: fully approved`,
        instance
      );
    }
  } else if (action === 'reject') {
    instance.status = 'rejected';
    instance.currentApproverRoles = [];
    instance.history.push({ ...entry, action: 'rejected' });
    await instance.save();
    await notifyUsers(
      [instance.initiator],
      `${instance.reference} · ${snapshot.name}: rejected at "${stepName}"`,
      instance
    );
  } else {
    instance.status = 'returned';
    instance.currentApproverRoles = [];
    instance.history.push({ ...entry, action: 'returned' });
    await instance.save();
    await notifyUsers(
      [instance.initiator],
      `${instance.reference} · ${snapshot.name}: returned for changes — see comment`,
      instance
    );
  }

  logAudit(req.user, `instances.${action}`, 'instance', instance._id, {
    reference: instance.reference,
    step: stepName,
  });
  res.json({ instance, viewer: viewerContext(req.user, instance) });
});

// Initiator fixes the data of a returned request; the approval chain restarts
// from step 1 so every approver reviews the updated version.
router.post('/:id/resubmit', async (req, res) => {
  const instance = await ProcessInstance.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!instance) throw httpError(404, 'Request not found');
  if (String(instance.initiator) !== String(req.user._id)) {
    throw httpError(403, 'Only the initiator can resubmit this request');
  }
  if (instance.status !== 'returned') throw httpError(400, 'Only returned requests can be resubmitted');

  const snapshot = instance.definitionSnapshot;
  instance.data = validateData(snapshot.fields, req.body?.data);
  instance.markModified('data');
  instance.status = 'in_progress';
  instance.currentStep = 0;
  instance.currentApproverRoles = stepApproverRoleIds(snapshot, 0);
  instance.history.push({
    action: 'resubmitted',
    by: req.user._id,
    byName: req.user.name,
    roleName: req.user.role?.name,
    stepIndex: 0,
    stepName: snapshot.steps[0].name,
    comment: String(req.body?.comment || '').trim(),
  });
  await instance.save();
  await notifyRoles(
    instance.currentApproverRoles,
    `${instance.reference} · ${snapshot.name}: resubmitted by ${req.user.name}, awaiting "${snapshot.steps[0].name}"`,
    instance,
    req.user._id
  );
  logAudit(req.user, 'instances.resubmit', 'instance', instance._id, { reference: instance.reference });
  res.json({ instance, viewer: viewerContext(req.user, instance) });
});

export default router;
