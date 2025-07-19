// /workers/worker.js (最终修正版)

import { createClient } from 'redis';
import * as TaskHandlers from '../handlers/task-handlers.js';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';

// --- [新增] Redis 客户端初始化 ---
const redisConfigPath = path.join(process.cwd(), 'config','config', 'redis.yaml');
const redisConfig = YAML.parse(fs.readFileSync(redisConfigPath, 'utf8'));

const redisClient = createClient({
  url: `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`,
  disableOfflineQueue: true
});

redisClient.on('error', (err) => {
  console.error('[工作单元] Redis 客户端发生错误:', err);
});

// --- 核心逻辑 ---
async function startWorker() {
  try {
    await redisClient.connect();
    console.log(`[工作单元] Redis 连接成功，进程已启动，等待任务...`);

    while (true) {
      try {
        // brPop 返回一个对象 { key: 'tasks:queue', element: '...' }
        const result = await redisClient.brPop('tasks:queue', 0);
        const taskJson = result.element;
        const task = JSON.parse(taskJson);

        console.log(`[工作单元] 接收到任务: ${task.type} (用户: ${task.userId})`);

        switch (task.type) {
          case 'tribulation_strike':
            await TaskHandlers.handleTribulationStrike(task);
            break;
          default:
            console.warn(`[工作单元] 未知的任务类型: ${task.type}`);
        }
      } catch (error) {
        // brPop 如果被中断可能会报错，或者JSON解析失败
        console.error(`[工作单元] 处理任务时发生错误:`, error);
        // 等待一秒再继续，防止因错误导致CPU空转
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error("[工作单元] 无法连接到 Redis，工作单元启动失败:", error);
  }
}

startWorker();