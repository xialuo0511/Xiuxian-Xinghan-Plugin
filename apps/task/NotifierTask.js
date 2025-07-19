// /apps/tasks/NotifierTask.js

import plugin from '../../../../lib/plugins/plugin.js';
import common from "../../../../lib/common/common.js";
import redis from 'redis';


export class NotifierTask extends plugin {
  constructor() {
    super({
      name: 'NotifierTask',
      dsc: '修仙后台任务通知器',
      event: 'message',
      priority: 100,
      rule: []
    });
    this.task = {
      cron: '*/1 * * * * ?', // 每秒执行一次
      name: 'NotifierTask',
      fnc: () => this.runNotifier()
    };
  }

  async runNotifier() {
    // [修正] 使用 rPop 确保消息顺序
    const notificationJson = await redis.rPop('xiuxian:tasks:notifications');
    if (notificationJson) {
      try {
        const notification = JSON.parse(notificationJson);
        // 优先使用群号
        if (notification.group_id) {
          await common.relpyGroup(notification.group_id, notification.message);
        } else {
          await common.relpyPrivate(notification.user_id, notification.message);
        }
      } catch (error) {
        logger.error("[通知器] 发送消息失败:", error);
      }
    }
  }
}