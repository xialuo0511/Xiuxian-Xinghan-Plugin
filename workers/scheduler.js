import redis from 'redis';
import { scheduleJob } from 'node-schedule';

const BATCH_SIZE = 100; // 每次从调度池中取出的最大任务数

async function pollAndDispatch() {
  try {
    // [修正] 将 zRangeByScore 更新为 V4 的 ZRANGE ... BYSCORE 语法
    const dueTasks = await redis.zRange('tasks:scheduled', 0, Date.now(), {
      BYSCORE: true, // 明确指出是按分数范围查找
      LIMIT: { offset: 0, count: BATCH_SIZE }
    });

    if (dueTasks && dueTasks.length > 0) {
      console.log(`[调度器] 发现 ${dueTasks.length} 个到期任务。`);
      // [修正] V4 的 lPush 和 zRem 现在接收数组
      await redis.multi()
        .lPush('tasks:queue', dueTasks)
        .zRem('tasks:scheduled', dueTasks)
        .exec();
    }
  } catch (error) {
    console.error('[调度器] 发生错误:', error);
  }
}

console.log(" 调度器已启动。");
// 每秒轮询一次
scheduleJob('*/1 * * * * *', pollAndDispatch);