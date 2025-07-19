import * as TaskHandlers from '../handlers/task-handlers.js';

async function startWorker() {
  console.log(`[工作单元] 进程已启动，等待任务...`);
  while (true) {
    try {
      const result = await redis.brPop('tasks:queue', 0);
      const taskJson = result.element;
      const task = JSON.parse(taskJson);

      console.log(`[工作单元] 接收到任务: ${task.type} (用户: ${task.userId})`);

      switch (task.type) {
        case 'tribulation_strike': // 渡劫
          await TaskHandlers.handleTribulationStrike(task);
          break;
        default:
          console.warn(`[工作单元] 未知的任务类型: ${task.type}`);
      }
    } catch (error) {
      console.error(`[工作单元] 处理任务时发生错误:`, error);
    }
  }
}

startWorker();