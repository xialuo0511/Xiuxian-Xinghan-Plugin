// /handlers/notifier.js
import { createNewClient } from '../workers/redis-client.js'; // 使用共享客户端

export async function notify(groupId, userId, message) {
  const notification = {
    group_id: groupId,
    user_id: userId,
    message: message
  };
  await createNewClient.lPush('xiuxian:tasks:notifications', JSON.stringify(notification));
}