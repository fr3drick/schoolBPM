import Notification from '../models/Notification.js';
import User from '../models/User.js';

export async function notifyUsers(userIds, message, instance) {
  const docs = [...new Set(userIds.map(String))].map((id) => ({
    user: id,
    message,
    instance: instance?._id,
    reference: instance?.reference,
  }));
  if (docs.length) await Notification.insertMany(docs);
}

export async function notifyRoles(roleIds, message, instance, excludeUserId) {
  if (!roleIds?.length) return;
  const users = await User.find({
    role: { $in: roleIds },
    active: true,
    ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
  }).select('_id');
  await notifyUsers(users.map((u) => u._id), message, instance);
}
