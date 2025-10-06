import plugin from '../../../lib/plugins/plugin.js';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';
import { scheduleTask } from '../api/task-scheduler.js'; // 复用您现有的任务调度函数

const configPath = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'config', 'activity_schedule.yaml');
let activityConfig = null;

// 加载并解析活动配置文件
function loadActivityConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const file = fs.readFileSync(configPath, 'utf8');
      activityConfig = YAML.parse(file);
      logger.mark('[活动调度器] 活动配置文件加载成功！');
      return true;
    } else {
      logger.warn('[活动调度器] 找不到活动配置文件 activity_schedule.yaml');
      return false;
    }
  } catch (error) {
    logger.error('[活动调度器] 加载活动配置文件失败:', error);
    return false;
  }
}

// 将活动安排进后台任务系统
async function scheduleAllActivities() {
  if (!activityConfig || !activityConfig.activities) {
    logger.info('[活动调度器] 没有可调度的活动。');
    return 0;
  }
  let scheduledCount = 0;
  for (const activity of activityConfig.activities) {
    const startTime = new Date(activity.startTime);
    const timestamp = startTime.getTime();

    if (timestamp < Date.now()) continue; // 跳过已过期的活动

    const taskPayload = {
      type: 'startActivityNotification', // 定义新的任务类型
      ...activity, // 将活动的所有信息都放入负载
      defaultGroup: activityConfig.defaultGroup
    };

    await scheduleTask(taskPayload, timestamp);
    scheduledCount++;
    logger.mark(`[活动调度器] 已成功调度活动 [${activity.name}] 于 ${activity.startTime}`);
  }
  return scheduledCount;
}

export class ActivityScheduler extends plugin {
  constructor() {
    super({
      name: '活动任务发布器',
      dsc: '读取配置，并将活动发布到后台任务系统',
      event: 'message',
      priority: 9999,
      rule: [{
        reg: /^#重载活动配置$/,
        fnc: 'reloadConfig',
        permission: 'master'
      }]
    });
  }

  // 插件初始化时，加载配置并调度任务
  async init() {
    if (loadActivityConfig()) {
      await scheduleAllActivities();
    }
    logger.mark('[活动任务发布器] 已启动。');
  }

  // 管理指令，用于热更新活动
  async reloadConfig(e) {
    if (loadActivityConfig()) {
      const count = await scheduleAllActivities();
      e.reply(`活动配置文件已重载，新增了 ${count} 个待调度活动。`, true);
    } else {
      e.reply('活动配置文件加载失败，请检查后台日志。', true);
    }
  }
}