import { redisClient } from '../api/redis.js';

export async function notify(groupId, userId, message, e) {
  if (e && typeof e.reply === 'function') {
    await e.reply(message, true);
  } else {
    let finalMessage = message;
    if (typeof message === 'object' && message.type === 'atAll') {
      finalMessage = {
        ...message,
        isAtAll: true // 添加一个标记
      };
    }

    const notification = {
      group_id: groupId,
      user_id: userId,
      message: finalMessage
    };
    await redisClient.lPush('xiuxian:tasks:notifications', JSON.stringify(notification));
  }
}