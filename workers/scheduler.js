// /workers/scheduler.js (最终修正版 v2)

import { createClient } from 'redis';
import { scheduleJob } from 'node-schedule';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';

// --- Redis 客户端初始化 (保持不变) ---
const redisConfigPath = path.join(process.cwd(), 'config', 'config', 'redis.yaml'); // 修正了路径深度
const redisConfig = YAML.parse(fs.readFileSync(redisConfigPath, 'utf8'));

const redisClient = createClient({
  url: `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`,
  disableOfflineQueue: true
});

redisClient.on('error', (err) => {
  console.error('[调度器] Redis 客户端发生错误:', err);
});

// --- 核心逻辑 ---
const BATCH_SIZE = 100;

async function pollAndDispatch() {
  if (!redisClient.isOpen) {
    return;
  }
  try {
    // [修正] 将命令改回旧的、兼容性更好的 ZRANGEBYSCORE
    const dueTasks = await redisClient.zRangeByScore('tasks:scheduled', 0, Date.now(), {
      LIMIT: { offset: 0, count: BATCH_SIZE }
    });

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