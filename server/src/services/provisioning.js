import bcrypt from 'bcryptjs';
import Role from '../models/Role.js';
import User from '../models/User.js';
import ProcessDefinition from '../models/ProcessDefinition.js';

// Defaults given to every newly onboarded school. All of it is editable
// afterwards from the school's own admin UI (except the Super Admin role).

export const DEFAULT_ROLES = [
  {
    name: 'Super Admin',
    description: 'School administration only — manages users and roles, no access to processes',
    permissions: ['users.manage', 'roles.manage'],
    isSystem: true,
  },
  {
    name: 'Owner',
    description: 'School owner',
    permissions: ['instances.initiate', 'instances.act', 'instances.view_all', 'definitions.manage', 'audit.view'],
  },
  {
    name: 'Proprietor',
    description: 'School proprietor',
    permissions: ['instances.initiate', 'instances.act', 'instances.view_all', 'audit.view'],
  },
  {
    name: 'Principal',
    description: 'Head of school',
    permissions: ['instances.initiate', 'instances.act', 'instances.view_all', 'definitions.manage', 'audit.view'],
  },
  {
    name: 'Admin',
    description: 'School administrator',
    permissions: ['instances.initiate', 'instances.act', 'instances.view_all', 'definitions.manage'],
  },
  {
    name: 'Teacher',
    description: 'Teaching staff',
    permissions: ['instances.initiate', 'instances.act'],
  },
];

export function defaultTemplates(roleMap) {
  const ids = (...names) => names.map((n) => roleMap[n]._id);
  return [
    {
      name: 'Leave Request',
      key: 'LR',
      category: 'Staff & HR',
      description: 'Request annual, sick, casual, compassionate or study leave.',
      fields: [
        { key: 'leave_type', label: 'Leave type', type: 'select', required: true, options: ['Annual', 'Sick', 'Casual', 'Compassionate', 'Study'] },
        { key: 'start_date', label: 'Start date', type: 'date', required: true },
        { key: 'end_date', label: 'End date', type: 'date', required: true },
        { key: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'Why do you need this leave?' },
        { key: 'cover_arrangements', label: 'Cover arrangements', type: 'textarea', required: false, placeholder: 'Who covers your classes while away?' },
      ],
      steps: [
        { name: 'Admin review', approverRoles: ids('Admin'), instructions: 'Check leave balance and cover arrangements.' },
        { name: 'Principal approval', approverRoles: ids('Principal') },
      ],
    },
    {
      name: 'Purchase Requisition',
      key: 'PR',
      category: 'Finance',
      description: 'Request supplies, equipment or services to be purchased.',
      fields: [
        { key: 'item', label: 'Item / service', type: 'text', required: true },
        { key: 'quantity', label: 'Quantity', type: 'number', required: true },
        { key: 'estimated_cost', label: 'Estimated total cost', type: 'number', required: true },
        { key: 'urgency', label: 'Urgency', type: 'select', required: true, options: ['Low', 'Medium', 'High'] },
        { key: 'justification', label: 'Justification', type: 'textarea', required: true },
      ],
      steps: [
        { name: 'Admin review', approverRoles: ids('Admin') },
        { name: 'Principal approval', approverRoles: ids('Principal') },
        { name: 'Budget approval', approverRoles: ids('Proprietor', 'Owner'), instructions: 'Confirm budget availability.' },
      ],
    },
    {
      name: 'Field Trip Approval',
      key: 'FT',
      category: 'Events',
      description: 'Approval for excursions and off-campus activities.',
      fields: [
        { key: 'destination', label: 'Destination', type: 'text', required: true },
        { key: 'trip_date', label: 'Trip date', type: 'date', required: true },
        { key: 'classes_involved', label: 'Classes involved', type: 'text', required: true },
        { key: 'student_count', label: 'Number of students', type: 'number', required: true },
        { key: 'cost_per_student', label: 'Cost per student', type: 'number', required: true },
        { key: 'risk_notes', label: 'Risk assessment notes', type: 'textarea', required: false },
      ],
      steps: [
        { name: 'Principal approval', approverRoles: ids('Principal') },
        { name: 'Proprietor sign-off', approverRoles: ids('Proprietor', 'Owner') },
      ],
    },
    {
      name: 'Maintenance Request',
      key: 'MR',
      category: 'Operations',
      description: 'Report a fault or request repairs around the school.',
      fields: [
        { key: 'location', label: 'Location', type: 'text', required: true, placeholder: 'e.g. Science lab, Block B' },
        { key: 'issue', label: 'Describe the issue', type: 'textarea', required: true },
        { key: 'priority', label: 'Priority', type: 'select', required: true, options: ['Low', 'Medium', 'High', 'Urgent'] },
      ],
      steps: [{ name: 'Admin action', approverRoles: ids('Admin'), instructions: 'Schedule the repair and confirm completion.' }],
    },
    {
      name: 'Exam Question-Paper Moderation',
      key: 'EQ',
      category: 'Academic',
      description: 'Submit an exam paper for moderation before printing.',
      fields: [
        { key: 'subject', label: 'Subject', type: 'text', required: true },
        { key: 'class_name', label: 'Class', type: 'text', required: true, placeholder: 'e.g. SS2' },
        { key: 'exam_date', label: 'Exam date', type: 'date', required: true },
        { key: 'moderation_notes', label: 'Notes for the moderator', type: 'textarea', required: false },
      ],
      steps: [{ name: 'Principal moderation', approverRoles: ids('Principal') }],
    },
  ];
}

/**
 * Idempotently equips a school with its default roles and (optionally) the
 * five starter process templates. Returns the role map by name.
 */
export async function provisionSchool(school, { seedTemplates = true } = {}) {
  const roleMap = {};
  for (const r of DEFAULT_ROLES) {
    roleMap[r.name] = await Role.findOneAndUpdate(
      { school: school._id, name: r.name },
      { $set: { ...r, school: school._id } },
      { upsert: true, returnDocument: 'after' }
    );
  }
  if (seedTemplates) {
    for (const d of defaultTemplates(roleMap)) {
      const exists = await ProcessDefinition.findOne({ school: school._id, key: d.key });
      if (!exists) {
        await ProcessDefinition.create({ ...d, school: school._id, initiatorRoles: [], active: true });
      }
    }
  }
  return roleMap;
}

export async function createSchoolAdmin(school, roleMap, { name, email, password, mustChangePassword = true }) {
  return User.create({
    name,
    email,
    school: school._id,
    role: roleMap['Super Admin']._id,
    passwordHash: await bcrypt.hash(password, 10),
    mustChangePassword,
  });
}
