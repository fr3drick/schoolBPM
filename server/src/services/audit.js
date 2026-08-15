import AuditLog from '../models/AuditLog.js';

// Fire-and-forget: an audit failure must never break the request.
// The school is taken from the actor unless explicitly overridden
// (platform admins acting on a school pass that school's id).
export function logAudit(user, action, entityType, entityId, details = {}, school) {
  AuditLog.create({
    school: school ?? user?.school?._id ?? user?.school ?? null,
    actor: user?._id,
    actorName: user?.name,
    action,
    entityType,
    entityId: entityId ? String(entityId) : undefined,
    details,
  }).catch(() => {});
}
