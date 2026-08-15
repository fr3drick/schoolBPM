import Counter from '../models/Counter.js';
import Role from '../models/Role.js';
import { httpError } from './errors.js';

export async function nextReference(schoolId, key) {
  const counter = await Counter.findOneAndUpdate(
    { _id: `${schoolId}:${key}` },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return `${key}-${String(counter.seq).padStart(4, '0')}`;
}

// Frozen copy of a definition, with approver role names resolved so the
// timeline stays readable even if roles are later renamed or deleted.
export async function buildSnapshot(definition) {
  const roleIds = new Set();
  definition.steps.forEach((s) => s.approverRoles.forEach((r) => roleIds.add(String(r))));
  const roles = await Role.find({ _id: { $in: [...roleIds] } }).select('name');
  const nameOf = new Map(roles.map((r) => [String(r._id), r.name]));
  return {
    name: definition.name,
    key: definition.key,
    category: definition.category,
    description: definition.description,
    fields: definition.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options,
      placeholder: f.placeholder,
    })),
    steps: definition.steps.map((s) => ({
      name: s.name,
      instructions: s.instructions,
      approverRoles: s.approverRoles.map((r) => ({
        id: String(r),
        name: nameOf.get(String(r)) || 'Unknown role',
      })),
    })),
  };
}

export function stepApproverRoleIds(snapshot, stepIndex) {
  return (snapshot.steps[stepIndex]?.approverRoles || []).map((r) => r.id);
}

// Validates submitted form data against the field schema. Returns a cleaned
// object containing only known fields; throws a 400 listing every problem.
export function validateData(fields, input) {
  const data = {};
  const errors = [];
  for (const field of fields) {
    let value = input?.[field.key];
    if (field.type === 'checkbox') {
      const checked = value === true || value === 'true';
      if (field.required && !checked) errors.push(`"${field.label}" must be checked`);
      data[field.key] = checked;
      continue;
    }
    const empty = value === undefined || value === null || String(value).trim() === '';
    if (empty) {
      if (field.required) errors.push(`"${field.label}" is required`);
      continue;
    }
    if (field.type === 'number') {
      const num = Number(value);
      if (Number.isNaN(num)) {
        errors.push(`"${field.label}" must be a number`);
        continue;
      }
      value = num;
    } else if (field.type === 'date') {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        errors.push(`"${field.label}" must be a valid date`);
        continue;
      }
      value = d.toISOString().slice(0, 10);
    } else if (field.type === 'select') {
      if (field.options?.length && !field.options.includes(value)) {
        errors.push(`"${field.label}" must be one of the listed options`);
        continue;
      }
    } else {
      value = String(value).trim();
    }
    data[field.key] = value;
  }
  if (errors.length) throw httpError(400, errors.join('; '));
  return data;
}
