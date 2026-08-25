import 'dotenv/config';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';

/**
 * Rebuilds the student/class/subject unique indexes with a case-insensitive
 * collation.
 *
 * Mongoose will not alter an index that already exists with different
 * options, so a deployment that predates the collation keeps the old
 * case-sensitive index forever unless it is dropped. syncIndexes() does the
 * drop-and-recreate.
 *
 * The rebuild fails if the collection already holds rows that differ only in
 * case — two "Mathematics" subjects, say. That is a data problem a script
 * must not guess its way through: which of the two is the real one, and where
 * do the students pointing at the loser go? So this reports the clashes and
 * leaves them for a human. Safe to re-run.
 */
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolbpm';
await mongoose.connect(uri);
console.log(`Connected to ${uri}`);

/** The field whose case-insensitive uniqueness we are about to enforce. */
const targets = [
  { model: Student, field: 'admissionNumber', label: 'students' },
  { model: Class, field: 'name', label: 'classes' },
  { model: Subject, field: 'name', label: 'subjects' },
];

let blocked = 0;

for (const { model, field, label } of targets) {
  // Look before leaping: a failed createIndex reports one offending value,
  // which is a poor map when a school has several.
  const clashes = await model.aggregate([
    { $group: { _id: { school: '$school', key: { $toLower: `$${field}` } }, count: { $sum: 1 }, values: { $addToSet: `$${field}` } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (clashes.length) {
    blocked += clashes.length;
    console.error(`\n${label}: ${clashes.length} name(s) differ only in case and must be resolved first:`);
    for (const c of clashes) {
      console.error(`  school ${c._id.school} — ${c.values.join('  /  ')}`);
    }
    continue;
  }

  const dropped = await model.syncIndexes();
  console.log(`${label}: indexes in sync${dropped.length ? ` (dropped ${dropped.join(', ')})` : ''}`);
}

if (blocked) {
  console.error(`\n${blocked} clash(es) left the indexes unchanged. Merge or rename the duplicates, then re-run.`);
}

await mongoose.disconnect();
process.exit(blocked ? 1 : 0);
