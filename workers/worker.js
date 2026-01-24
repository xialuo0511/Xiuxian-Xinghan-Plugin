// Worker 进程 - 独立运行，不依赖主线程
console.log('[Worker] 进程启动中...');

// 全局异常捕获
process.on('uncaughtException', (err) => {
  console.error('[Worker] 未捕获的异常:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] 未处理的 Promise 拒绝:', reason);
});

let redisClient, TaskHandlers;

try {
  console.log('[Worker] 正在加载 redis-client...');
  const { createNewClient } = await import('./redis-client.js');
  redisClient = createNewClient();
  console.log('[Worker] redis-client 加载成功');

  console.log('[Worker] 正在加载 task-handlers...');
  TaskHandlers = await import('../handlers/task-handlers.js');
  console.log('[Worker] task-handlers 加载成功');
} catch (err) {
  console.error('[Worker] 模块加载失败:', err);
  process.exit(1);
}

redisClient.on('error', (err) => console.error('[Worker] Redis 客户端错误:', err));

async function startWorker() {
  try {
    console.log('[Worker] 正在连接 Redis...');
    await redisClient.connect();
    console.log('[Worker] Redis 连接成功，等待任务...');

    while (true) {
      try {
        const result = await redisClient.brPop('tasks:queue', 0);
        const task = JSON.parse(result.element);
        console.log(`[Worker] 接收到任务: ${task.type} (用户: ${task.userId})`);
        if (TaskHandlers[task.type]) {
          await TaskHandlers[task.type](task);
        } else {
          console.warn(`[Worker] 未知的任务类型: ${task.type}`);
        }
      } catch (error) {
        console.error('[Worker] 处理任务时发生错误:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('[Worker] 启动失败:', error);
    process.exit(1);
  }
}

startWorker();