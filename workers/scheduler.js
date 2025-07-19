
import { scheduleJob } from 'node-schedule';

const BATCH_SIZE = 100; // 每次从调度池中取出的最大任务数

async function pollAndDispatch() {
  try {
    const dueTasks = await redis.zRangeByScore('tasks:scheduled', 0, Date.now(), {
      LIMIT: { offset: 0, count: BATCH_SIZE }
    });

    if (dueTasks && dueTasks.length > 0) {
      console.log(` 发现 ${dueTasks.length} 个到期任务。`);
      await redis.multi()
        .lPush('tasks:queue', dueTasks)      // 推入工作队列
        .zRem('tasks:scheduled', dueTasks) // 从调度集合中移除
        .exec();
    }
  } catch (error) {
    console.error(' 发生错误:', error);
  }
}

console.log(" 调度器已启动。");
// 每秒轮询一次
scheduleJob('*/1 * * * * *', pollAndDispatch);