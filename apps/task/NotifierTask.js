// /apps/tasks/NotifierTask.js (最终修正版 - 阻塞监听模式)

import plugin from '../../../../lib/plugins/plugin.js';
import { redisClient } from '../../api/redis.js'; // 导入我们自己创建的 Redis 客户端
import Show from '../../model/show.js';
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';


export class NotifierTask extends plugin {
  constructor() {
    super({
      name: 'NotifierTask',
      dsc: '修仙后台任务通知器',
      event: 'message',
      priority: 100,
      rule: []
    });

    this.startListener();
  }

  /**
   * [新增] 启动一个长期运行的、阻塞式的监听器
   */
  async startListener() {
    // 这是一个死循环，会一直运行，但 brPop 会让它在大部分时间里都处于“休眠”状态，不消耗CPU
    logger.info('[星瀚修仙-通知器] 启动成功，开始监听通知队列...');
    while (true) {
      try {
        if (!redisClient.isOpen) {
          // 如果连接断开，等待一段时间再重试
          logger.warn('[星瀚修仙-通知器] Redis 连接已断开，将在5秒后重试...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue; // 继续下一次循环
        }

        // [核心] 使用 BRPOP 命令阻塞式地等待通知，0表示无限等待
        const result = await redisClient.brPop('xiuxian:tasks:notifications', 0);

        // 只有当 result 不为 null (即成功收到消息) 时，才会执行下面的代码
        const notificationJson = result.element;
        const notification = JSON.parse(notificationJson);
        const messageContent = notification.message;

        // [日志] 现在只在有实际工作时才打印日志
        logger.info(`[星瀚修仙-通知器] 收到通知，准备发送给 ${notification.group_id || notification.user_id}`);

        // [核心修改] 判断消息类型
        if (typeof messageContent === 'object' && messageContent.render) {
          // 这是一个渲染请求
          logger.info(`[星瀚修仙-通知器] 收到渲染请求: ${messageContent.render}`);

          // 构造一个临时的 e 对象，用于传入 Show 类
          const tempE = {
            user_id: notification.user_id,
            group_id: notification.group_id
            // ... 其他可能需要的属性
          };

          // 使用 Show 类准备数据
          const dataForPuppeteer = await new Show(tempE).get_secret_place_log(messageContent.data);

          // 使用 puppeteer 生成图片
          const img = await puppeteer.screenshot(messageContent.render, { ...dataForPuppeteer });

          // 发送图片
          await pushInfo(notification.group_id, true, img);

        } else {
          await pushInfo(notification.group_id, true, messageContent);
        }

        await pushInfo(notification.user_id, notification.message);

      } catch (error) {
        // 如果 brPop 被中断或 JSON 解析失败
        logger.error('[星瀚修仙-通知器] 处理通知时发生错误:', error);
        // 发生错误时，短暂等待再继续，防止因连续错误导致日志刷屏
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

async function pushInfo(groupId, message) {
  await Bot.pickGroup(groupId)
    .sendMsg(message)
    .catch((err) => {
      logger.mark(err);
    });
}