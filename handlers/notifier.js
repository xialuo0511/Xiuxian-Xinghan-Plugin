// /handlers/notifier.js
import { redisClient } from '../api/redis.js';

export async function notify(groupId, userId, message) {
  const notification = {
    group_id: groupId,
    user_id: userId,
    message: message
  };
  await redisClient.lPush('xiuxian:tasks:notifications', JSON.stringify(notification));
}