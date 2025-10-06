import { redisClient } from '../api/redis.js';

async function runDiagnostics() {
  try {
    await redisClient.connect();
    console.log('--- Redis 任务系统诊断报告 ---');
    console.log('\n');

    // 1. 检查“待调度”列表 (tasks:scheduled)
    console.log('1. 正在检查【待调度列表 (tasks:scheduled)】...');
    const scheduledTasks = await redisClient.zRangeWithScores('tasks:scheduled', 0, -1);
    if (scheduledTasks.length > 0) {
      console.log(`   [发现 ${scheduledTasks.length} 个待调度任务]:`);
      for (const task of scheduledTasks) {
        const readableTime = new Date(task.score).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        console.log(`   - 任务内容: ${task.value}`);
        console.log(`     计划执行时间: ${readableTime} (${task.score})`);
      }
    } else {
      console.log('   [结果]: 待调度列表为空。');
    }
    console.log('\n');

    // 2. 检查“待执行”队列 (tasks:queue)
    console.log('2. 正在检查【待执行队列 (tasks:queue)】...');
    const queuedTasks = await redisClient.lRange('tasks:queue', 0, -1);
    if (queuedTasks.length > 0) {
      console.log(`   [发现 ${queuedTasks.length} 个待执行任务]:`);
      queuedTasks.forEach(task => console.log(`   - ${task}`));
    } else {
      console.log('   [结果]: 待执行队列为空。');
    }
    console.log('\n');

    // 3. 检查“通知”队列 (xiuxian:tasks:notifications)
    console.log('3. 正在检查【通知队列 (xiuxian:tasks:notifications)】...');
    const notificationTasks = await redisClient.lRange('xiuxian:tasks:notifications', 0, -1);
    if (notificationTasks.length > 0) {
      console.log(`   [发现 ${notificationTasks.length} 个待发送通知]:`);
      notificationTasks.forEach(task => console.log(`   - ${task}`));
    } else {
      console.log('   [结果]: 通知队列为空。');
    }
    console.log('\n');

    console.log('--- 诊断结束 ---');

  } catch (error) {
    console.error('诊断过程中发生错误:', error);
  } finally {
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  }
}

runDiagnostics();