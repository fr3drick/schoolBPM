import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Role from './models/Role.js';
import User from './models/User.js';
import ProcessDefinition from './models/ProcessDefinition.js';

const fresh = process.argv.includes('--fresh');
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolbpm';
await mongoose.connect(uri);
console.log(`Connected to ${uri}`);

if (fresh) {
  await mongoose.connection.dropDatabase();
  console.log('Dropped existing database (--fresh)');
}

// ---- Roles ------------------------------------------------------------
const ROLES = [
  {
    name: 'Super Admin',
    description: 'Platform administration only — manages users and roles, no access to processes',
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

const roleMap = {};
for (const r of ROLES) {
  roleMap[r.name] = await Role.findOneAndUpdate(
    { name: r.name },
    { $set: r },
    { upsert: true, returnDocument: 'after' }
  );
}
console.log(`Roles: ${Object.keys(roleMap).join(', ')}`);

// ---- Demo users (one per role) ---------------------------------------
const USERS = [
  { name: 'Sana Adeyemi', email: 'superadmin@school.test', role: 'Super Admin' },
  { name: 'Olu Bankole', email: 'owner@school.test', role: 'Owner' },
  { name: 'Ngozi Okafor', email: 'proprietor@school.test', role: 'Proprietor' },
  { name: 'David Mensah', email: 'principal@school.test', role: 'Principal' },
  { name: 'Amina Yusuf', email: 'admin@school.test', role: 'Admin' },
  { name: 'Tunde Balogun', email: 'teacher@school.test', role: 'Teacher' },
];
const passwordHash = await bcrypt.hash('Passw0rd!', 10);
for (const u of USERS) {
  await User.findOneAndUpdate(
    { email: u.email },
    {
      $setOnInsert: {
        name: u.name,
        email: u.email,
        passwordHash,
        role: roleMap[u.role]._id,
        active: true,
        mustChangePassword: false,
      },
    },
    { upsert: true }
  );
}
console.log(`Users: ${USERS.map((u) => u.email).join(', ')} (password: Passw0rd!)`);

// ---- Process templates ------------------------------------------------
const ids = (...names) => names.map((n) => roleMap[n]._id);

const DEFINITIONS = [
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

for (const d of DEFINITIONS) {
  const existing = await ProcessDefinition.findOne({ key: d.key });
  if (existing) {
    console.log(`Definition ${d.key} (${d.name}) already exists — skipped`);
    continue;
  }
  await ProcessDefinition.create({ ...d, initiatorRoles: [], active: true });
  console.log(`Definition created: ${d.key} — ${d.name}`);
}

console.log('\nSeed complete. Sign in at http://localhost:4200 with e.g. teacher@school.test / Passw0rd!');
await mongoose.disconnect();
