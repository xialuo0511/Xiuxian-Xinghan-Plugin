import plugin from '../../../../lib/plugins/plugin.js';
import common from "../../../../lib/common/common.js";
// [CORRECTION] Import the single, shared client instance, not the factory function
import { redisClient } from '../../api/redis.js';

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
      cron: '*/1 * * * * ?',
      name: 'NotifierTask',
      fnc: () => this.runNotifier()
    };
  }

  async runNotifier() {
    // Check if our custom client is connected and ready
    if (!redisClient.isOpen) {
      return;
    }

    // [CORRECTION] Use the imported redisClient instance to call rPop
    const notificationJson = await redisClient.rPop('xiuxian:tasks:notifications');

    if (notificationJson) {
      try {
        const notification = JSON.parse(notificationJson);
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