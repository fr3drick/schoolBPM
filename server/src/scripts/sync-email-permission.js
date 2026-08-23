import 'dotenv/config';
import mongoose from 'mongoose';
import Role from '../models/Role.js';

/**
 * Converges the `email.view` permission onto the roles that hold it by
 * default — Owner and Proprietor — across schools onboarded before the
 * permission existed.
 *
 * It also removes the permission from Super Admin, which briefly received it
 * by default. Super Admin is deliberately scoped to user and role management
 * with no visibility into process activity, and the delivery log exposes
 * request references and approver addresses.
 *
 * Targets named roles with $addToSet/$pull rather than re-running
 * provisionSchool, which $sets the whole default definition and would discard
 * any permission changes a school has made to its own roles. Safe to re-run.
 */
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolbpm';
await mongoose.connect(uri);
console.log(`Connected to ${uri}`);

const granted = await Role.updateMany(
  { name: { $in: ['Owner', 'Proprietor'] }, permissions: { $ne: 'email.view' } },
  { $addToSet: { permissions: 'email.view' } }
);
console.log(`Granted email.view to ${granted.modifiedCount} Owner/Proprietor role(s)`);

// Only Super Admin is corrected: a school that deliberately gave email.view
// to another role keeps it.
const revoked = await Role.updateMany(
  { name: 'Super Admin', permissions: 'email.view' },
  { $pull: { permissions: 'email.view' } }
);
console.log(`Revoked email.view from ${revoked.modifiedCount} Super Admin role(s)`);

if (granted.modifiedCount === 0 && revoked.modifiedCount === 0) {
  console.log('Nothing to do — every role already matches the intended state.');
}

await mongoose.disconnect();
