// /workers/scheduler.js (最终修正版)

import { createClient } from 'redis';
import { scheduleJob } from 'node-schedule';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';

// --- [新增] Redis 客户端初始化 ---
const redisConfigPath = path.join(process.cwd(), 'config', 'redis.yaml');
const redisConfig = YAML.parse(fs.readFileSync(redisConfigPath, 'utf8'));

const redisClient = createClient({
  url: `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`,
  disableOfflineQueue: true // 关键配置：如果连接断开，不缓存命令
});

redisClient.on('error', (err) => {
  console.error('[调度器] Redis 客户端发生错误:', err);
});

// --- 核心逻辑 ---
const BATCH_SIZE = 100;

async function pollAndDispatch() {
  if (!redisClient.isOpen) {
    // 如果连接断开，则不执行任何操作
    return;
  }
  try {
    const dueTasks = await redisClient.zRange('tasks:scheduled', 0, Date.now(), {
      BYSCORE: true,
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
    scheduleJob('*/1 * * * * *', pollAndDispatch); // 每秒轮询一次
  } catch (error) {
    console.error("[调度器] 无法连接到 Redis，调度器启动失败:", error);
  }
}

startScheduler();