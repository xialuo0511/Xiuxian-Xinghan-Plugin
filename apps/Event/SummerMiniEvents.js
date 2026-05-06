import plugin from '../../../../lib/plugins/plugin.js';
import path from 'path';
import puppeteer from '../../api/puppeteer-wrapper.js';
import Show from '../../model/show.js';
import {
  getActiveSummerEvent,
  getEventByCommand,
  getEventDateRange,
  getSummerEventStatus,
  playSummerEvent
} from '../../logic/summer_mini_event_logic.js';

const COMMAND_REG = /^#(采露|育田|问穗|听荷|竞渡)\s*(.*)$/;

export class SummerMiniEvents extends plugin {
  constructor() {
    super({
      name: 'SummerMiniEvents',
      dsc: '2026端午入夏小游戏活动',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^#(夏令活动|入夏活动)$', fnc: 'showActivity' },
        { reg: '^#(采露|育田|问穗|听荷|竞渡)\\s*(.*)$', fnc: 'playEvent' }
      ]
    });
  }

  async showActivity(e) {
    if (!e.isGroup) {
      await e.reply('修仙活动请在群聊中参与。');
      return true;
    }

    const status = await getSummerEventStatus(String(e.user_id));
    const renderData = await new Show(e).get_imgData('summer_mini_event', {
      ...status,
      generatedAt: new Date().toLocaleString('zh-CN', { hour12: false })
    });
    const htmlPath = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'resources', 'html', 'summer_mini_event', 'summer_mini_event.html');
    const img = await puppeteer.screenshot('summer_mini_event', {
      ...renderData,
      tplFile: htmlPath,
      imgType: 'png',
      scale: 2
    });
    await e.reply(img);
    return true;
  }

  async playEvent(e) {
    if (!e.isGroup) {
      await e.reply('修仙活动请在群聊中参与。');
      return true;
    }

    const match = e.msg.match(COMMAND_REG);
    if (!match) return false;

    const command = `#${match[1]}`;
    const choice = (match[2] || '').trim();
    const event = getEventByCommand(command);
    if (!event) {
      await e.reply('未找到对应的入夏活动。');
      return true;
    }

    const activeEvent = getActiveSummerEvent();
    if (!activeEvent || activeEvent.id !== event.id) {
      const activeTip = activeEvent ? `当前可参与活动为【${activeEvent.name}】${activeEvent.command}` : '当前没有正在进行的入夏小游戏活动';
      await e.reply(`【${event.name}】当前不在开放时间。\n${activeTip}\n本活动时间：${getEventDateRange(event)}`);
      return true;
    }

    const result = await playSummerEvent(String(e.user_id), event.id, choice);
    await e.reply(result.message);
    return true;
  }
}
