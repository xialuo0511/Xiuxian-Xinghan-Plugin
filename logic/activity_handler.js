import { notify } from '../handlers/notifier.js';

const AT_ALL_FLAG = '__AT_ALL__';

/**
 * 处理“活动开始”通知任务 (在独立的worker中执行)
 * @param {object} task - 从任务队列中获取的任务对象
 */
export async function startActivityNotification(task) {
  if (!task) return;
  console.info(`[工作单元] 开始处理活动通知任务: [${task.name}]`);

  // 构建消息文本
  let msgBody = `\n🔔 活动【${task.name}】已开启！\n\n` +
    `🕛 活动时间：\n${task.startTime} ~ ${task.endTime}\n`;

  if (task.context) {
    msgBody += `\n📜 活动详情：\n${task.context}\n`;
  }

  // 万象天机活动特殊提示
  if (task.name === '万象天机') {
    msgBody += '\n💡 首次参与请先发送【#万象天机】领取星魂并查看活动指引！\n';
  }

  msgBody += '\n请各位道友尽快参与~';

  // 将特殊标记和消息文本拼接起来
  const finalMessage = AT_ALL_FLAG + msgBody;

  // 通过 notifier.js 将通知推送到Yunzai主进程的监听队列
  await notify(task.defaultGroup, null, finalMessage);
}