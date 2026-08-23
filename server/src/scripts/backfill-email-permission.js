import 'dotenv/config';
import mongoose from 'mongoose';
import Role from '../models/Role.js';

/**
 * Grants the `email.view` permission to the roles that receive it by default
 * (Super Admin, Owner, Proprietor) in schools onboarded before the permission
 * existed.
 *
 * Uses $addToSet on named roles rather than re-running provisionSchool, which
 * would $set the whole default definition and wipe any permission changes a
 * school has made to its own roles. Safe to run repeatedly.
 */
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolbpm';
await mongoose.connect(uri);
console.log(`Connected to ${uri}`);

const TARGET_ROLES = ['Super Admin', 'Owner', 'Proprietor'];

const result = await Role.updateMany(
  { name: { $in: TARGET_ROLES }, permissions: { $ne: 'email.view' } },
  { $addToSet: { permissions: 'email.view' } }
);

console.log(`Roles matched: ${result.matchedCount}, updated: ${result.modifiedCount}`);
if (result.modifiedCount === 0) console.log('Nothing to do — all target roles already have email.view.');

await mongoose.disconnect();
