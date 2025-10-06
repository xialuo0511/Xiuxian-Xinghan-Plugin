import plugin from '../../../lib/plugins/plugin.js';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';
import { redisClient } from '../api/redis.js'; // 确保你有一个从主程序导入的 redisClient

const configPath = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'config', 'activity_schedule.yaml');
let activityConfig = null;

/**
 * 加载并解析活动配置文件
 */
function loadActivityConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const file = fs.readFileSync(configPath, 'utf8');
      activityConfig = YAML.parse(file);
      logger.mark('[活动调度器] 活动配置文件加载成功！');
      return true;
    } else {
      logger.warn('[活动调度器] 找不到活动配置文件 activity_schedule.yaml');
      activityConfig = null;
      return false;
    }
  } catch (error) {
    logger.error('[活动调度器] 加载活动配置文件失败:', error);
    activityConfig = null;
    return false;
  }
}

/**
 * 将配置文件中的活动转化为任务，并存入Redis调度队列
 */
async function scheduleActivities() {
  if (!activityConfig || !activityConfig.activities) {
    logger.info('[活动调度器] 没有可调度的活动。');
    return 0;
  }

  let scheduledCount = 0;
  for (const activity of activityConfig.activities) {
    const startTime = new Date(activity.startTime);
    const timestamp = startTime.getTime();

    // 如果活动已经过期，则跳过
    if (timestamp < Date.now()) {
      continue;
    }

    // 构建任务负载 (Payload)
    const taskPayload = {
      type: 'startActivityNotification',
      name: activity.name,
      startTime: activity.startTime,
      endTime: activity.endTime,
      context: activity.context,
      defaultGroup: activityConfig.defaultGroup
    };
    const taskString = JSON.stringify(taskPayload);

    // score 是任务的执行时间戳
    const added = await redisClient.zAdd('tasks:scheduled', {
      score: timestamp,
      value: taskString
    }, { NX: true });

    if (added) {
      scheduledCount++;
      logger.mark(`[活动调度器] 已成功调度活动 [${activity.name}] 于 ${activity.startTime}`);
    }
  }
  return scheduledCount;
}

export class ActivityScheduler extends plugin {
  constructor() {
    super({
      name: '活动任务发布器', // 名称变更
      dsc: '读取配置，并将活动发布到后台任务系统',
      event: 'message',
      priority: 9999,
      rule: [
        {
          reg: /^#重载活动配置$/,
          fnc: 'reloadConfig',
          permission: 'master'
        }
      ]
    });
  }

  // 插件初始化时，加载配置并调度任务
  async init() {
    if (loadActivityConfig()) {
      await scheduleActivities();
    }
    logger.mark('[活动任务发布器] 已启动。');
  }

  // 管理指令，用于热更新活动
  async reloadConfig(e) {
    if (loadActivityConfig()) {
      const count = await scheduleActivities();
      e.reply(`活动配置文件已重载，新增了 ${count} 个待调度活动。`, true);
    } else {
      e.reply('活动配置文件加载失败，请检查后台日志。', true);
    }
  }
}