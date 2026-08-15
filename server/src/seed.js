import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import School from './models/School.js';
import User from './models/User.js';
import { provisionSchool } from './services/provisioning.js';

const fresh = process.argv.includes('--fresh');
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolbpm';
await mongoose.connect(uri);
console.log(`Connected to ${uri}`);

if (fresh) {
  await mongoose.connection.dropDatabase();
  console.log('Dropped existing database (--fresh)');
}

const passwordHash = await bcrypt.hash('Passw0rd!', 10);

async function upsertUser({ name, email, school = null, role = null, isPlatformAdmin = false }) {
  await User.findOneAndUpdate(
    { email },
    {
      $setOnInsert: {
        name,
        email,
        passwordHash,
        school,
        role,
        isPlatformAdmin,
        active: true,
        mustChangePassword: false,
      },
    },
    { upsert: true }
  );
}

// ---- Platform operator (no school, no role — onboards schools) ---------
await upsertUser({ name: 'Preye Dagogo', email: 'platform@school.test', isPlatformAdmin: true });
console.log('Platform admin: platform@school.test');

// ---- Demo school 1: full staff + starter templates ---------------------
const sunrise = await School.findOneAndUpdate(
  { slug: 'sunrise' },
  { $setOnInsert: { name: 'Sunrise High School', slug: 'sunrise', contactEmail: 'office@sunrise.test' } },
  { upsert: true, returnDocument: 'after' }
);
const sunriseRoles = await provisionSchool(sunrise);
for (const [name, email, role] of [
  ['Sana Adeyemi', 'superadmin@school.test', 'Super Admin'],
  ['Olu Bankole', 'owner@school.test', 'Owner'],
  ['Ngozi Okafor', 'proprietor@school.test', 'Proprietor'],
  ['David Mensah', 'principal@school.test', 'Principal'],
  ['Amina Yusuf', 'admin@school.test', 'Admin'],
  ['Tunde Balogun', 'teacher@school.test', 'Teacher'],
]) {
  await upsertUser({ name, email, school: sunrise._id, role: sunriseRoles[role]._id });
}
console.log('School: Sunrise High School (sunrise) — 6 users @school.test');

// ---- Demo school 2: proves tenant isolation ----------------------------
const hillcrest = await School.findOneAndUpdate(
  { slug: 'hillcrest' },
  { $setOnInsert: { name: 'Hillcrest College', slug: 'hillcrest', contactEmail: 'office@hillcrest.test' } },
  { upsert: true, returnDocument: 'after' }
);
const hillcrestRoles = await provisionSchool(hillcrest);
for (const [name, email, role] of [
  ['Kemi Adesida', 'superadmin@hillcrest.test', 'Super Admin'],
  ['Chidi Eze', 'principal@hillcrest.test', 'Principal'],
  ['Bola Akande', 'teacher@hillcrest.test', 'Teacher'],
]) {
  await upsertUser({ name, email, school: hillcrest._id, role: hillcrestRoles[role]._id });
}
console.log('School: Hillcrest College (hillcrest) — 3 users @hillcrest.test');

console.log('\nAll passwords: Passw0rd!');
console.log('Seed complete. Sign in at http://localhost:4200');
await mongoose.disconnect();
