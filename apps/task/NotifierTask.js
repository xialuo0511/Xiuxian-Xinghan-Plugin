import plugin from '../../../../lib/plugins/plugin.js';
import { redisClient } from '../../api/redis.js';
import Show from '../../model/show.js';
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';

const AT_ALL_FLAG = '__AT_ALL__';

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

  async pushInfo(id, isGroup, msg) {
    if (!id || !msg) return;
    try {
      if (isGroup) {
        await Bot.pickGroup(Number(id)).sendMsg(msg);
      } else {
        await Bot.pickUser(Number(id)).sendMsg(msg);
      }
    } catch (error) {
      logger.error(`[通知器] 发送消息到 ${id} 失败:`, error);
    }
  }

  async startListener() {
    logger.info('[星瀚修仙-通知器] 启动成功，开始监听通知队列...');
    while (true) {
      try {
        if (!redisClient.isOpen) {
          logger.warn('[星瀚修仙-通知器] Redis 连接已断开，将在5秒后重试...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        const result = await redisClient.brPop('xiuxian:tasks:notifications', 0);
        const notification = JSON.parse(result.element);
        let messageContent = notification.message;

        logger.info(`[星瀚修仙-通知器] 收到通知，准备发送给 ${notification.group_id || notification.user_id}`);


        let finalMsg = [];

        // 1. 判断是否需要 @全体成员
        if (typeof messageContent === 'string' && messageContent.startsWith(AT_ALL_FLAG)) {
          finalMsg.push({ type: 'at', data: { qq: 'all' } });
          messageContent = messageContent.substring(AT_ALL_FLAG.length); // 移除标记
        }
        // 只有在非@全体成员时，才@单个用户
        else if (notification.user_id) {
          finalMsg.push(segment.at(notification.user_id));
        }

        // 2. 判断消息主体是图片还是文本
        if (typeof messageContent === 'object' && messageContent.render) {
          // 渲染图片
          const tempE = { user_id: notification.user_id, group_id: notification.group_id };
          const dataForPuppeteer = await new Show(tempE).get_secret_place_log(messageContent.data);
          const img = await puppeteer.screenshot(messageContent.render, { ...dataForPuppeteer });
          finalMsg.push(img);
        } else {
          // 普通文本
          let textToSend = messageContent;
          
          // 修复：处理异常的消息对象格式，防止 "converter is not a function"
          if (typeof messageContent === 'object' && messageContent !== null) {
              // 如果不是标准Segment（即没有 type 字段）
              if (!messageContent.type) {
                  // 尝试从常见结构中提取文本
                  if (messageContent.data && messageContent.data.message) {
                      textToSend = messageContent.data.message;
                  } else if (messageContent.text) {
                      textToSend = messageContent.text;
                  } else if (messageContent.content) {
                      textToSend = messageContent.content;
                  } else {
                      // 实在无法识别结构，转为字符串以确保能发出且不报错
                      try {
                          textToSend = JSON.stringify(messageContent);
                      } catch (e) {
                          textToSend = String(messageContent);
                      }
                  }
              }
          }
          finalMsg.push(textToSend);
        }

        // 3. 统一发送
        if (notification.group_id) {
          await this.pushInfo(notification.group_id, true, finalMsg);
        } else if (notification.user_id) {
          await this.pushInfo(notification.user_id, false, finalMsg);
        }

      } catch (error) {
        logger.error('[星瀚修仙-通知器] 处理通知时发生错误:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}