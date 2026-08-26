import 'dotenv/config';
import mongoose from 'mongoose';
import Role from '../models/Role.js';
import { DEFAULT_ROLES } from '../services/provisioning.js';
import { MODULES } from '../modules.js';

/**
 * Grants each default role the module permissions it is supposed to hold, for
 * schools onboarded before those modules existed.
 *
 * Without this, enabling a module for an existing school gives nobody the
 * right to use it: the module gate opens and every request still fails on
 * permissions, so the feature looks broken and its nav item never appears.
 *
 * Convergence is decided **per school per module**, not per role. A school
 * where no role holds any of a module's permissions predates that module and
 * is granted the defaults; a school where any role holds one already knows
 * about the module, so a role missing it was curated deliberately and is left
 * alone.
 *
 * Deciding this per role would be wrong. Teacher's whole share of the
 * students module is `students.view` — so a Teacher role stripped of it looks
 * exactly like one that predates the module, and a per-role rule would force
 * it back onto every school that had removed it on purpose. The school-level
 * signal tells the two apart.
 *
 * Matches roles by name rather than re-running provisionSchool, which $sets
 * whole role definitions and would discard a school's own edits. Only ever
 * adds, never removes. Safe to re-run.
 */
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolbpm';
await mongoose.connect(uri);
console.log(`Connected to ${uri}`);

const allSchools = (await Role.distinct('school')).filter(Boolean);
let total = 0;

for (const module of MODULES) {
  // Schools that already know about this module, however partially.
  const aware = (await Role.distinct('school', { permissions: { $in: module.permissions } }))
    .map(String);
  const awareSet = new Set(aware);
  const targets = allSchools.filter((id) => !awareSet.has(String(id)));

  if (!targets.length) {
    console.log(`${module.key}: all ${allSchools.length} school(s) already know this module`);
    continue;
  }

  for (const role of DEFAULT_ROLES) {
    const wanted = role.permissions.filter((p) => module.permissions.includes(p));
    if (!wanted.length) continue;

    const result = await Role.updateMany(
      { name: role.name, school: { $in: targets } },
      { $addToSet: { permissions: { $each: wanted } } }
    );
    // Every matched role is short of the permissions by construction — the
    // school held none of them — so matchedCount is the honest number here,
    // unlike modifiedCount, which Mongoose inflates by stamping updatedAt.
    if (result.matchedCount) {
      total += result.matchedCount;
      console.log(`${module.key} → ${role.name}: ${result.matchedCount} role(s) granted ${wanted.join(', ')}`);
    }
  }
}

if (!total) console.log('\nNothing to do — every school already has its module permissions.');
else console.log(`\n${total} role(s) updated.`);

await mongoose.disconnect();
