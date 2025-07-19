import { createNewClient } from './redis-client.js';
import * as TaskHandlers from '../handlers/task-handlers.js';

const redisClient = createNewClient();
redisClient.on('error', (err) => console.error('[工作单元] Redis 客户端错误:', err));

async function startWorker() {
  try {
    await redisClient.connect();
    console.log(`[工作单元] Redis 连接成功，进程已启动，等待任务...`);
    while (true) {
      try {
        const result = await redisClient.brPop('tasks:queue', 0);
        const task = JSON.parse(result.element);
        console.log(`[工作单元] 接收到任务: ${task.type} (用户: ${task.userId})`);
        if (TaskHandlers[task.type]) {
          await TaskHandlers[task.type](task);
        } else {
          console.warn(`[工作单元] 未知的任务类型: ${task.type}`);
        }
      } catch (error) {
        console.error(`[工作单元] 处理任务时发生错误:`, error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error("[工作单元] 无法连接到 Redis，工作单元启动失败:", error);
  }
}
startWorker();