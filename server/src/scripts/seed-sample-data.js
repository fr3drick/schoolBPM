import 'dotenv/config';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import School from '../models/School.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Student from '../models/Student.js';
import Exam from '../models/Exam.js';
import Result from '../models/Result.js';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { gradeFor } from '../services/grading.js';
import { validateModuleSelection } from '../modules.js';

/**
 * Lays down demonstration data — classes, subjects, students with guardians,
 * an exam with marks, and a fortnight of registers — so the school-management
 * modules have something to show.
 *
 * Idempotent: everything is matched on its natural key and updated in place,
 * so re-running converges rather than duplicating.
 *
 * The exam is deliberately left **open, not published**. Publishing is what
 * emails guardians, and that is a decision for a person to take in the UI
 * with the confirmation dialog in front of them — not something a seed script
 * should do on their behalf.
 *
 * Usage: node src/scripts/seed-sample-data.js [school-slug]
 */

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolbpm';
const slug = process.argv[2] || 'sunrise';

// This writes a lot of rows into whatever it is pointed at. A production
// database is never the intended target, and the cost of being wrong is far
// higher than the cost of an extra flag.
const dbName = uri.split('/').pop().split('?')[0];
if (!/test|dev|local/i.test(dbName) && !process.argv.includes('--force')) {
  console.error(`Refusing to seed "${dbName}": the name does not look like a test database.`);
  console.error('Re-run with --force if this really is what you intend.');
  process.exit(1);
}

await mongoose.connect(uri);
console.log(`Connected to ${uri}`);

const school = await School.findOne({ slug });
if (!school) {
  console.error(`No school with slug "${slug}".`);
  process.exit(1);
}
console.log(`Seeding ${school.name}\n`);

// The data is meaningless with the modules that display it switched off.
const { modules, error } = validateModuleSelection([
  ...new Set([...(school.modules || []), 'students', 'exams', 'attendance', 'reports', 'communications']),
]);
if (error) throw new Error(error);
school.modules = modules;
await school.save();
console.log(`Modules: ${modules.join(', ')}`);

const teacher = await User.findOne({ school: school._id }).sort({ createdAt: 1 });

// ---------------------------------------------------------------- subjects
const SUBJECTS = [
  ['Mathematics', 'MTH'],
  ['English Language', 'ENG'],
  ['Basic Science', 'BSC'],
  ['Social Studies', 'SOS'],
  ['Civic Education', 'CVE'],
  ['Agricultural Science', 'AGR'],
];

const subjects = {};
for (const [name, code] of SUBJECTS) {
  subjects[name] = await Subject.findOneAndUpdate(
    { school: school._id, name },
    { $set: { code, active: true } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, collation: { locale: 'en', strength: 2 } }
  );
}
console.log(`Subjects: ${Object.keys(subjects).length}`);

// ----------------------------------------------------------------- classes
const CLASSES = [
  { name: 'JSS 1A', level: 'JSS1' },
  { name: 'JSS 2A', level: 'JSS2' },
];

const classes = {};
for (const c of CLASSES) {
  classes[c.name] = await Class.findOneAndUpdate(
    { school: school._id, name: c.name },
    { $set: { level: c.level, academicYear: '2026/2027', active: true, formTeacher: teacher?._id || null } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, collation: { locale: 'en', strength: 2 } }
  );
}
console.log(`Classes: ${Object.keys(classes).join(', ')}`);

// ---------------------------------------------------------------- students
//
// Guardian addresses are +aliases of the account that owns this environment.
// Test sends through a live provider, so a made-up domain would pile up hard
// bounces against the sending reputation, and a real stranger's address is
// out of the question.
const OWNER = 'fredrickirubor@gmail.com';

/**
 * A random-looking +alias, derived from the guardian's name rather than
 * generated freshly each run.
 *
 * Deterministic on purpose: the seeder is idempotent, and an address that
 * changed on every re-run would leave a trail of stale guardians and make
 * the outbox impossible to follow. Keyed on the guardian, not the student,
 * so siblings genuinely share one address and the de-duplication in a
 * general announcement is real rather than staged.
 */
const parent = (guardianName) => {
  const tag = createHash('sha1').update(guardianName).digest('hex').slice(0, 8);
  return OWNER.replace('@', `+${tag}@`);
};

const STUDENTS = [
  // JSS 1A
  ['SHS/2026/001', 'Chidera', 'Okonkwo', 'Ada', 'female', 'JSS 1A', 'Mrs Ngozi Okonkwo', 'Mother', parent('Mrs Ngozi Okonkwo'), '+2348031110001'],
  ['SHS/2026/002', 'Emeka',   'Okonkwo', '',    'male',   'JSS 1A', 'Mrs Ngozi Okonkwo', 'Mother', parent('Mrs Ngozi Okonkwo'), '+2348031110001'],
  ['SHS/2026/003', 'Aisha',   'Bello',   'Zainab', 'female', 'JSS 1A', 'Alhaji Musa Bello', 'Father', parent('Alhaji Musa Bello'), '+2348031110002'],
  ['SHS/2026/004', 'Tunde',   'Adeyemi', '',    'male',   'JSS 1A', 'Mr Segun Adeyemi', 'Father', parent('Mr Segun Adeyemi'), '+2348031110003'],
  ['SHS/2026/005', 'Ifeoma',  'Nwosu',   'Chi',  'female', 'JSS 1A', 'Mrs Grace Nwosu', 'Mother', parent('Mrs Grace Nwosu'), '+2348031110004'],
  ['SHS/2026/006', 'Yusuf',   'Ibrahim', '',    'male',   'JSS 1A', 'Mallam Sani Ibrahim', 'Father', parent('Mallam Sani Ibrahim'), '+2348031110005'],
  // Deliberately without an email: shows the "results cannot be sent" warning
  // on the grid and the skipped tally on publish.
  ['SHS/2026/007', 'Blessing', 'Etim',   '',    'female', 'JSS 1A', 'Mr Etim Bassey', 'Father', '', '+2348031110006'],
  // JSS 2A
  ['SHS/2025/011', 'Kelechi', 'Eze',     '',    'male',   'JSS 2A', 'Mrs Amaka Eze', 'Mother', parent('Mrs Amaka Eze'), '+2348031110007'],
  ['SHS/2025/012', 'Fatima',  'Abubakar', 'Hauwa', 'female', 'JSS 2A', 'Hajiya Binta Abubakar', 'Mother', parent('Hajiya Binta Abubakar'), '+2348031110008'],
  ['SHS/2025/013', 'Daniel',  'Ogunleye', '',   'male',   'JSS 2A', 'Mr Kunle Ogunleye', 'Father', parent('Mr Kunle Ogunleye'), '+2348031110009'],
  ['SHS/2025/014', 'Amara',   'Uche',    'Ngo',  'female', 'JSS 2A', 'Mrs Chioma Uche', 'Mother', parent('Mrs Chioma Uche'), '+2348031110010'],
  ['SHS/2025/015', 'Samuel',  'Adebayo', '',    'male',   'JSS 2A', 'Mr Wale Adebayo', 'Father', parent('Mr Wale Adebayo'), '+2348031110011'],
];

const students = {};
for (const [adm, first, last, other, gender, klass, gName, gRel, gEmail, gPhone] of STUDENTS) {
  students[adm] = await Student.findOneAndUpdate(
    { school: school._id, admissionNumber: adm },
    {
      $set: {
        firstName: first,
        lastName: last,
        otherNames: other,
        gender,
        class: classes[klass]._id,
        status: 'active',
        dateOfBirth: new Date(klass === 'JSS 1A' ? '2013-05-14' : '2012-09-02'),
        guardians: [{ name: gName, relationship: gRel, email: gEmail, phone: gPhone, isPrimary: true }],
      },
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, collation: { locale: 'en', strength: 2 } }
  );
}
const withEmail = Object.values(students).filter((s) => s.guardians.some((g) => g.email)).length;
console.log(`Students: ${Object.keys(students).length} (${withEmail} with a guardian email)`);
console.log('  Chidera and Emeka Okonkwo share one guardian address — a general');
console.log('  announcement reaches that parent once, not twice.');

// -------------------------------------------------------------------- exam
const examSubjects = ['Mathematics', 'English Language', 'Basic Science', 'Social Studies']
  .map((name) => ({ subject: subjects[name]._id, maxScore: 100 }));

const exam = await Exam.findOneAndUpdate(
  { school: school._id, class: classes['JSS 1A']._id, session: '2026/2027', term: 'first' },
  { $set: { subjects: examSubjects, status: 'open' } },
  { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
);
console.log(`\nExam: JSS 1A · first term 2026/2027 · ${examSubjects.length} subjects · status ${exam.status}`);

// A spread that exercises the whole grading scale, from a distinction down to
// a fail, so the grades and positions on screen are worth looking at.
const MARKS = {
  'SHS/2026/001': [88, 79, 82, 75],
  'SHS/2026/002': [64, 58, 71, 66],
  'SHS/2026/003': [92, 85, 90, 88],
  'SHS/2026/004': [47, 52, 44, 50],
  'SHS/2026/005': [73, 68, 77, 70],
  'SHS/2026/006': [35, 41, 38, 45],
  // SHS/2026/007 has no marks on purpose: the report card list shows it as
  // "No results yet" and publish reports it as skipped.
};

const ops = [];
for (const [adm, scores] of Object.entries(MARKS)) {
  scores.forEach((score, i) => {
    const { grade, remark } = gradeFor(score, 100);
    ops.push({
      updateOne: {
        filter: { exam: exam._id, student: students[adm]._id, subject: examSubjects[i].subject },
        update: { $set: { score, grade, remark, school: school._id, enteredBy: teacher?._id || null } },
        upsert: true,
      },
    });
  });
}
await Result.bulkWrite(ops);
console.log(`Results: ${ops.length} marks for ${Object.keys(MARKS).length} of 7 students`);

// -------------------------------------------------------------- attendance
//
// Ten weekdays back, so the report card has an attendance figure and the
// rates table has something to rank.
const roll = Object.values(students).filter((s) => String(s.class) === String(classes['JSS 1A']._id));
const days = [];
for (let back = 1; days.length < 10; back += 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - back);
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
  days.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
}

// Deterministic rather than random, so re-running does not quietly change the
// attendance rates someone was looking at.
const PATTERN = {
  'SHS/2026/001': 'PPPPPPPPPP',
  'SHS/2026/002': 'PPLPPPPLPP',
  'SHS/2026/003': 'PPPPPPPPPP',
  'SHS/2026/004': 'PAPPAPPAPP',
  'SHS/2026/005': 'PPPPLPPPPP',
  'SHS/2026/006': 'AAPAPPAAPP',
  'SHS/2026/007': 'PPPEPPPPEP',
};
const STATUS = { P: 'present', A: 'absent', L: 'late', E: 'excused' };

for (const [i, date] of days.entries()) {
  await Attendance.findOneAndUpdate(
    { school: school._id, class: classes['JSS 1A']._id, date },
    {
      $set: {
        takenBy: teacher?._id || null,
        records: roll.map((s) => {
          const code = (PATTERN[s.admissionNumber] || 'PPPPPPPPPP')[i];
          return {
            student: s._id,
            status: STATUS[code],
            note: code === 'A' ? 'No reason given' : code === 'E' ? 'Family bereavement' : '',
          };
        }),
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}
console.log(`Attendance: ${days.length} registers for JSS 1A`);

console.log('\nThe exam is open, not published — no guardian has been emailed.');
console.log('Publish it from Exams → ⋮ → Publish to guardians when you want to test that.');

await mongoose.disconnect();
