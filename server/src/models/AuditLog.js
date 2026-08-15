import mongoose from 'mongoose';

const auditSchema = new mongoose.Schema(
  {
    // null for platform-level actions that concern no single school.
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    action: { type: String, required: true },
    entityType: String,
    entityId: String,
    details: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

auditSchema.index({ school: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditSchema);
