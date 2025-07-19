// /handlers/notifier.js
import redis from 'redis'; // Yunzai 全局 redis

export async function notify(groupId, userId, message) {
  const notification = {
    group_id: groupId,
    user_id: userId,
    message: message
  };
  await redis.lPush('xiuxian:tasks:notifications', JSON.stringify(notification));
}