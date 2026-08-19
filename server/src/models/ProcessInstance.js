import mongoose from 'mongoose';

const historySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['submitted', 'approved', 'rejected', 'returned', 'resubmitted'],
      required: true,
    },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    roleName: String,
    stepIndex: Number,
    stepName: String,
    comment: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const instanceSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    // Unique per school — two schools can both have LR-0001.
    reference: { type: String, required: true },
    definition: { type: mongoose.Schema.Types.ObjectId, ref: 'ProcessDefinition', required: true },
    // Frozen copy of the definition (fields + steps with role names) taken at
    // submission time, so past requests stay intact if the process is edited.
    definitionSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    initiator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    initiatorName: String,
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    currentStep: { type: Number, default: 0 },
    // Role ids that can act on the current step — kept denormalised so the
    // approval queue is a single indexed query.
    currentApproverRoles: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    status: {
      type: String,
      enum: ['in_progress', 'approved', 'rejected', 'returned'],
      default: 'in_progress',
    },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true }
);

instanceSchema.index({ school: 1, reference: 1 }, { unique: true });
instanceSchema.index({ school: 1, status: 1, currentApproverRoles: 1 });
instanceSchema.index({ school: 1, initiator: 1, updatedAt: -1 });
instanceSchema.index({ school: 1, status: 1, updatedAt: -1 });
instanceSchema.index({ school: 1, definition: 1 });

export default mongoose.model('ProcessInstance', instanceSchema);
