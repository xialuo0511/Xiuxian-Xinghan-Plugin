import { getRedisClient } from './data-access.js';

/**
 * 调度一个新任务
 * @param {object} payload 任务负载json对象, e.g., { type: 'level_up_check', userId: '123' }
 * @param {number} endTime 任务结束的Unix时间戳 (毫秒)
 */
export async function scheduleTask(payload, endTime) {
  const client = await getRedisClient();
  await client.zAdd('tasks:scheduled', {
    score: endTime,
    value: JSON.stringify(payload)
  });
}