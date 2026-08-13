import mongoose from 'mongoose';

const auditSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    action: { type: String, required: true },
    entityType: String,
    entityId: String,
    details: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

auditSchema.index({ createdAt: -1 });

export default mongoose.model('AuditLog', auditSchema);
