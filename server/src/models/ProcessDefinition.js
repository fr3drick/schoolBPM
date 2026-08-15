import mongoose from 'mongoose';

export const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'checkbox'];

const fieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: FIELD_TYPES, required: true },
    required: { type: Boolean, default: false },
    options: { type: [String], default: [] },
    placeholder: { type: String, default: '' },
  },
  { _id: false }
);

const stepSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    approverRoles: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }], required: true },
    instructions: { type: String, default: '' },
  },
  { _id: false }
);

const definitionSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    // Short prefix for reference numbers, e.g. "LR" -> LR-0001 (per school)
    key: { type: String, required: true, uppercase: true, match: /^[A-Z]{2,5}$/ },
    category: { type: String, default: 'General' },
    description: { type: String, default: '' },
    // Empty array = any role with instances.initiate can start it
    initiatorRoles: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }], default: [] },
    fields: { type: [fieldSchema], default: [] },
    steps: { type: [stepSchema], required: true },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

definitionSchema.index({ school: 1, name: 1 }, { unique: true });
definitionSchema.index({ school: 1, key: 1 }, { unique: true });

export default mongoose.model('ProcessDefinition', definitionSchema);
