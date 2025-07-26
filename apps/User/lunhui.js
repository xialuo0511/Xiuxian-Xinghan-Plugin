import { plugin } from '../../api/api.js';
import * as DAL from '../../api/data-access.js';
import { handleReincarnation } from '../../logic/reincarnation_logic.js';

export class lunhui extends plugin {
  constructor() {
    super({
      name: 'lunhui',
      dsc: '修仙模块-轮回',
      event: 'message',
      priority: 200,
      rule: [
        {
          reg: '^#轮回$',
          fnc: 'lunhui'
        }
      ]
    });
  }

  async lunhui(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let usr_qq = e.user_id;

    if (!await DAL.existPlayer(usr_qq)) {
      return;
    }

    // 检查是否已确认
    const confirmation = await redis.get(`xiuxian:player:${usr_qq}:lunhui`);
    if (confirmation != '1') {
      e.reply('轮回之术乃逆天造化之术，须清空仙人所有的修为气血才可施展。\n' +
        '传说只有得到"轮回阵旗"进行辅助轮回，才会抵御轮回之苦的十之八九。\n' +
        '回复:【确认轮回】或者【先不轮回】进行选择');
      this.setContext('yeslunhui');
      return;
    }

    // 清除确认状态
    await redis.del(`xiuxian:player:${usr_qq}:lunhui`);

    // 调用核心逻辑
    const result = await handleReincarnation(usr_qq);

    // 发送结果消息
    for (const msg of result.messages) {
      await e.reply(msg);
      await new Promise(resolve => setTimeout(resolve, 500)); // 延迟发送，增加仪式感
    }
  }

  async yeslunhui(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let usr_qq = e.user_id;
    let choice = e.msg;

    if (choice == '先不轮回') {
      await this.reply('放弃轮回');
      this.finish('yeslunhui');
      return;
    } else if (choice == '确认轮回') {
      await redis.set(`xiuxian:player:${usr_qq}:lunhui`, 1);
      e.reply('道心已定，请再次输入#轮回，踏入往生之门。');
      this.finish('yeslunhui');
      return;
    } else {
      this.setContext('yeslunhui');
      await this.reply('回复:【确认轮回】或者【先不轮回】进行选择');
      return;
    }
  }
}
