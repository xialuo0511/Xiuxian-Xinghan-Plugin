import { createNewClient } from './redis-client.js';
import { scheduleJob } from 'node-schedule';

const redisClient = createNewClient();
redisClient.on('error', (err) => console.error('[调度器] Redis 客户端错误:', err));

async function pollAndDispatch() {
  if (!redisClient.isOpen) return;
  try {
    const dueTasks = await redisClient.sendCommand(['ZRANGEBYSCORE', 'tasks:scheduled', '0', String(Date.now())]);
    if (dueTasks && dueTasks.length > 0) {
      console.log(`[调度器] 发现 ${dueTasks.length} 个到期任务。`);
      await redisClient.multi()
        .lPush('tasks:queue', dueTasks)
        .zRem('tasks:scheduled', dueTasks)
        .exec();
    }
  } catch (error) {
    console.error('[调度器] 轮询任务时出错:', error);
  }
}

async function startScheduler() {
  try {
    await redisClient.connect();
    console.log("[调度器] Redis 连接成功，进程已启动。");
    scheduleJob('*/1 * * * * *', pollAndDispatch);
  } catch (error) {
    console.error("[调度器] 无法连接到 Redis，调度器启动失败:", error);
  }
}
startScheduler();