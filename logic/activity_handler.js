import { notify } from '../handlers/notifier.js';

/**
 * 处理“活动开始”通知任务
 * 这个函数在独立的worker中执行，不能使用Yunzai的全局变量如 Bot, segment
 * @param {object} task - 从任务队列中获取的任务对象
 */
export async function startActivityNotification(task) {
  logger.info(`[工作单元] 开始处理活动通知任务: [${task.name}]`);

  const messageBody = [
    `\n🔔 活动【${task.name}】已开启！\n`,
    `\n🕛 活动时间：\n${task.startTime} ~ ${task.endTime}\n`,
    task.context ? `\n📜 活动详情：\n${task.context}\n` : '',
    '\n请各位道友尽快参与~'
  ].join('');

  const atAllMessage = {
    type: 'atAll',
    text: messageBody
  };

  // 通过 notifier 将格式化后的消息推送到通知队列
  await notify(task.defaultGroup, null, atAllMessage);
}