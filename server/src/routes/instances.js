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
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
  const instances = await ProcessInstance.find({
    school: req.user.school._id,
    initiator: req.user._id,
  })
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit);
  res.json({ instances });
});

// The caller's approval queue: in-progress requests whose current step is
// assigned to their role (own requests excluded — no self-approval).
router.get('/tasks', permit('instances.act'), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
  const instances = await ProcessInstance.find({
    school: req.user.school._id,
    status: 'in_progress',
    currentApproverRoles: req.user.role._id,
    initiator: { $ne: req.user._id },
  })
    .sort({ updatedAt: 1 })
    .skip(skip)
    .limit(limit);
  res.json({ instances });
});

const ALLOWED_STATUSES = ['in_progress', 'approved', 'rejected', 'returned'];

router.get('/', permit('instances.view_all'), async (req, res) => {
  const filter = { school: req.user.school._id };
  if (req.query.status) {
    const statusStr = String(req.query.status);
    if (!ALLOWED_STATUSES.includes(statusStr)) throw httpError(400, 'Invalid status filter');
    filter.status = statusStr;
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
  const instances = await ProcessInstance.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit);
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
  const stepName = snapshot.steps[stepIndex]?.name || `Step ${stepIndex + 1}`;
  const entry = {
    by: req.user._id,
    byName: req.user.name,
    roleName: req.user.role.name,
    stepIndex,
    stepName,
    comment: String(comment).trim(),
    action: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'returned',
  };

  let update = {};
  let notifyNextRoles = false;
  let nextApproverRoles = [];
  let nextStepName = '';

  if (action === 'approve') {
    if (stepIndex + 1 < snapshot.steps.length) {
      const nextStepIndex = stepIndex + 1;
      nextApproverRoles = stepApproverRoleIds(snapshot, nextStepIndex);
      nextStepName = snapshot.steps[nextStepIndex]?.name || `Step ${nextStepIndex + 1}`;
      notifyNextRoles = true;
      update = {
        $set: {
          currentStep: nextStepIndex,
          currentApproverRoles: nextApproverRoles,
        },
        $push: { history: entry },
      };
    } else {
      update = {
        $set: {
          status: 'approved',
          currentApproverRoles: [],
        },
        $push: { history: entry },
      };
    }
  } else if (action === 'reject') {
    update = {
      $set: {
        status: 'rejected',
        currentApproverRoles: [],
      },
      $push: { history: entry },
    };
  } else {
    update = {
      $set: {
        status: 'returned',
        currentApproverRoles: [],
      },
      $push: { history: entry },
    };
  }

  // Atomic conditional update prevents concurrency race conditions (TOCTOU)
  const updatedInstance = await ProcessInstance.findOneAndUpdate(
    {
      _id: instance._id,
      school: req.user.school._id,
      currentStep: stepIndex,
      status: 'in_progress',
    },
    update,
    { returnDocument: 'after' }
  );

  if (!updatedInstance) {
    throw httpError(409, 'This request state was modified by another approver. Please reload.');
  }

  if (action === 'approve') {
    if (notifyNextRoles) {
      await notifyRoles(
        nextApproverRoles,
        `${updatedInstance.reference} · ${snapshot.name}: awaiting "${nextStepName}"`,
        updatedInstance,
        updatedInstance.initiator
      );
      await notifyUsers(
        [updatedInstance.initiator],
        `${updatedInstance.reference}: "${stepName}" approved by ${req.user.name}`,
        updatedInstance
      );
    } else {
      await notifyUsers(
        [updatedInstance.initiator],
        `${updatedInstance.reference} · ${snapshot.name}: fully approved`,
        updatedInstance
      );
    }
  } else if (action === 'reject') {
    await notifyUsers(
      [updatedInstance.initiator],
      `${updatedInstance.reference} · ${snapshot.name}: rejected at "${stepName}"`,
      updatedInstance
    );
  } else {
    await notifyUsers(
      [updatedInstance.initiator],
      `${updatedInstance.reference} · ${snapshot.name}: returned for changes — see comment`,
      updatedInstance
    );
  }

  logAudit(req.user, `instances.${action}`, 'instance', updatedInstance._id, {
    reference: updatedInstance.reference,
    step: stepName,
  });
  res.json({ instance: updatedInstance, viewer: viewerContext(req.user, updatedInstance) });
});

// Initiator fixes the data of a returned request; the approval chain restarts
// from step 1 so every approver reviews the updated version.
router.post('/:id/resubmit', permit('instances.initiate'), async (req, res) => {
  const instance = await ProcessInstance.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!instance) throw httpError(404, 'Request not found');
  if (String(instance.initiator) !== String(req.user._id)) {
    throw httpError(403, 'Only the initiator can resubmit this request');
  }
  if (instance.status !== 'returned') throw httpError(400, 'Only returned requests can be resubmitted');

  // Verify process definition is still active and initiator's current role is permitted
  const def = await ProcessDefinition.findOne({ _id: instance.definition, school: req.user.school._id });
  if (!def || !def.active) throw httpError(400, 'This process is no longer active and cannot be resubmitted');
  const allowed =
    def.initiatorRoles.length === 0 ||
    def.initiatorRoles.some((r) => String(r) === String(req.user.role._id));
  if (!allowed) throw httpError(403, 'Your current role is not authorized to initiate this process');

  const snapshot = instance.definitionSnapshot;
  const cleanData = validateData(snapshot.fields, req.body?.data);
  const entry = {
    action: 'resubmitted',
    by: req.user._id,
    byName: req.user.name,
    roleName: req.user.role?.name,
    stepIndex: 0,
    stepName: snapshot.steps[0]?.name || 'Step 1',
    comment: String(req.body?.comment || '').trim(),
  };

  const initialApproverRoles = stepApproverRoleIds(snapshot, 0);

  const updatedInstance = await ProcessInstance.findOneAndUpdate(
    {
      _id: instance._id,
      school: req.user.school._id,
      initiator: req.user._id,
      status: 'returned',
    },
    {
      $set: {
        data: cleanData,
        status: 'in_progress',
        currentStep: 0,
        currentApproverRoles: initialApproverRoles,
      },
      $push: { history: entry },
    },
    { returnDocument: 'after' }
  );

  if (!updatedInstance) {
    throw httpError(409, 'Request state has changed; please refresh.');
  }

  await notifyRoles(
    updatedInstance.currentApproverRoles,
    `${updatedInstance.reference} · ${snapshot.name}: resubmitted by ${req.user.name}, awaiting "${snapshot.steps[0]?.name || 'Step 1'}"`,
    updatedInstance,
    req.user._id
  );
  logAudit(req.user, 'instances.resubmit', 'instance', updatedInstance._id, { reference: updatedInstance.reference });
  res.json({ instance: updatedInstance, viewer: viewerContext(req.user, updatedInstance) });
});

export default router;
