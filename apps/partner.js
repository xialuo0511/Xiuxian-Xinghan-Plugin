import plugin from '../../../../lib/plugins/plugin.js';
import * as partnerLogic from '../logic/partner_logic.js';

export class partner extends plugin {
  constructor() {
    super({
      name: '仙侣系统',
      dsc: '好感度、道侣、姻缘堂等功能',
      event: 'message',
      priority: 500,
      rule: [
        {
          reg: /^#赠予礼物\s*(.*)/,
          fnc: 'giveGift'
        }
      ]
    });
  }

  async giveGift(e) {
    if (!e.isGroup) {
      return e.reply('赠予之情，还是在大家面前表达为好。');
    }

    const at = e.message.find(item => item.type === 'at');
    if (!at) {
      // 如果消息中没有 at 任何人，则提示并中断
      await e.reply('请@一位你要赠予礼物的道友。', true);
      return true;
    }
    const receiverId = at.qq;
    const giverId = e.user_id;

    // 从正则匹配的结果中获取物品信息文本
    let inputStr = e.reg.exec(e.msg)[1].trim();
    if (!inputStr) {
      await e.reply('请指定要赠予的礼物名称，例如：#赠予礼物 花篮 @张三', true);
      return true;
    }

    let itemName, amount = 1;

    // 解析数量
    const amountMatch = inputStr.match(/(.*)\*(\d+)/);
    if (amountMatch) {
      itemName = amountMatch[1].trim();
      amount = parseInt(amountMatch[2]);
    } else {
      itemName = inputStr.trim();
    }

    if (amount < 1) amount = 1;

    const result = await partnerLogic.giveGift(giverId, receiverId, itemName, amount);

    await e.reply(result.message, true);
    return true;
  }
}