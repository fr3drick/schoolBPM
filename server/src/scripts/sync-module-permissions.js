import 'dotenv/config';
import mongoose from 'mongoose';
import Role from '../models/Role.js';
import { DEFAULT_ROLES } from '../services/provisioning.js';
import { MODULES } from '../modules.js';

/**
 * Grants the exams, attendance, report-card and communications permissions to
 * the default roles that should hold them, across schools onboarded before
 * those modules existed.
 *
 * Without this, enabling a module for an existing school gives nobody the
 * right to use it: the module gate opens and every request still fails on
 * permissions, which looks like the module is broken.
 *
 * Uses $addToSet against roles matched by name rather than re-running
 * provisionSchool, which $sets the whole default definition and would discard
 * permission changes a school has made to its own roles. Only ever adds — a
 * school that has deliberately taken a permission away from a role does not
 * get it forced back. Safe to re-run.
 */
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolbpm';
await mongoose.connect(uri);
console.log(`Connected to ${uri}`);

// Only the permissions that belong to the modules added after the first
// release; the rest were already granted at provisioning time.
const NEW_MODULES = ['exams', 'attendance', 'reports', 'communications'];
const scope = new Set(MODULES.filter((m) => NEW_MODULES.includes(m.key)).flatMap((m) => m.permissions));

let total = 0;
for (const role of DEFAULT_ROLES) {
  const wanted = role.permissions.filter((p) => scope.has(p));
  if (!wanted.length) continue;

  // Counted from the documents that are actually short of a permission, not
  // from modifiedCount: Mongoose stamps updatedAt on every updateMany, so a
  // no-op $addToSet still reports every role as modified and the script
  // would claim work it did not do on each re-run.
  const stale = await Role.countDocuments({
    name: role.name,
    permissions: { $not: { $all: wanted } },
  });
  if (!stale) {
    console.log(`${role.name}: already up to date`);
    continue;
  }

  await Role.updateMany({ name: role.name }, { $addToSet: { permissions: { $each: wanted } } });
  total += stale;
  console.log(`${role.name}: ${stale} role(s) granted ${wanted.length} permission(s)`);
}

if (!total) console.log('\nNothing to do — every role already has these permissions.');

await mongoose.disconnect();
