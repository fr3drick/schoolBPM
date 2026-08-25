import 'dotenv/config';
import mongoose from 'mongoose';
import School from '../models/School.js';
import { DEFAULT_MODULES } from '../modules.js';

/**
 * Gives the default modules to schools onboarded before the field existed.
 *
 * Without this, every existing school would deploy with an empty `modules`
 * array and silently lose its approval workflows. Uses $addToSet on schools
 * that have no modules at all, so a school the platform has deliberately
 * tailored is left alone. Safe to re-run.
 */
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolbpm';
await mongoose.connect(uri);
console.log(`Connected to ${uri}`);

const result = await School.updateMany(
  { $or: [{ modules: { $exists: false } }, { modules: { $size: 0 } }] },
  { $set: { modules: [...DEFAULT_MODULES] } }
);

console.log(`Schools matched: ${result.matchedCount}, updated: ${result.modifiedCount}`);
console.log(`Default modules: ${DEFAULT_MODULES.join(', ')}`);
if (result.modifiedCount === 0) console.log('Nothing to do — every school already has modules.');

await mongoose.disconnect();
