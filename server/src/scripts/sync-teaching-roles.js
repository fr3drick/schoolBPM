import 'dotenv/config';
import mongoose from 'mongoose';
import Role from '../models/Role.js';

/**
 * Marks each school's seeded Teacher role as teaching staff, so the teacher
 * directory has something to list on schools onboarded before the flag
 * existed.
 *
 * Only the role named exactly "Teacher" is touched, and only where the flag
 * has never been set. That name is the one this platform seeds itself, so it
 * is a safe starting point — but it is a starting point, not the rule: from
 * here a school marks its own roles on the Roles screen, and a school that
 * has deliberately unflagged its Teacher role is left alone rather than
 * having the decision reversed on the next deploy.
 *
 * Safe to re-run.
 */
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolbpm';
await mongoose.connect(uri);
console.log(`Connected to ${uri}`);

// Counted before the write: Mongoose stamps updatedAt on every updateMany, so
// modifiedCount would report work on every re-run whether or not it did any.
const stale = await Role.countDocuments({ name: 'Teacher', isTeaching: { $exists: false } });

if (!stale) {
  console.log('Nothing to do — every Teacher role already has the flag set.');
} else {
  await Role.updateMany(
    { name: 'Teacher', isTeaching: { $exists: false } },
    { $set: { isTeaching: true } }
  );
  console.log(`Marked ${stale} Teacher role(s) as teaching staff.`);
}

const flagged = await Role.countDocuments({ isTeaching: true });
console.log(`${flagged} role(s) are now flagged as teaching staff.`);

await mongoose.disconnect();
