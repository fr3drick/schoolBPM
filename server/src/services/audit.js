import AuditLog from '../models/AuditLog.js';

// Fire-and-forget: an audit failure must never break the request.
export function logAudit(user, action, entityType, entityId, details = {}) {
  AuditLog.create({
    actor: user?._id,
    actorName: user?.name,
    action,
    entityType,
    entityId: entityId ? String(entityId) : undefined,
    details,
  }).catch(() => {});
}
