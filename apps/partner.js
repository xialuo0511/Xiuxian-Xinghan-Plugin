import plugin from '../../../lib/plugins/plugin.js';
import * as partnerLogic from '../logic/partner_logic.js';
import * as DAL from '../api/data-access.js';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import Show from '../model/show.js';

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
        },
        {
          reg: /^#结为道侣$/,
          fnc: 'propose'
        },
        {
          reg: /^我同意$/,
          fnc: 'acceptProposal'
        },
        {
          reg: /^我拒绝$/,
          fnc: 'rejectProposal'
        },
        {
          reg: /^#断绝姻缘$/,
          fnc: 'breakUp'
        },
        {
          reg: /^#我的道侣$/,
          fnc: 'showPartnerStatus'
        },
        {
          reg: /^#姻缘堂$/,
          fnc: 'showPartnerShop'
        },
        {
          reg: /^#道侣购买\s*(.*)/,
          fnc: 'buyPartnerShopItem'
        }
      ]
    });
  }

  async showPartnerShop(e) {
    const result = await partnerLogic.getShopDetails(e.user_id);
    if (!result.success) {
      return e.reply(result.message, true);
    }

    const dataForPuppeteer = await new Show(e).get_imgData('partnerShop', result.data);
    const img = await puppeteer.screenshot('partnerShop', {
      ...dataForPuppeteer,
      _page: {
        deviceScaleFactor: 2 // 开启2倍超清渲染
      }
    });

    if (img) {
      await e.reply(img);
    } else {
      await e.reply('生成姻缘堂面板失败，请查看后台日志。');
    }
    return true;
  }

  async buyPartnerShopItem(e) {
    const inputStr = e.msg.replace(/#道侣购买\s*/, '').trim();
    if (!inputStr) {
      return e.reply('请输入要购买的物品，例如：#道侣购买 修为丹·贰万*2', true);
    }

    let itemName, amount = 1;
    const amountMatch = inputStr.match(/(.*)\*(\d+)/);
    if (amountMatch) {
      itemName = amountMatch[1].trim();
      amount = parseInt(amountMatch[2]);
    } else {
      itemName = inputStr.trim();
    }

    const result = await partnerLogic.purchaseShopItem(e.user_id, itemName, amount);
    return e.reply(result.message, true);
  }

  async giveGift(e) {
    if (!e.isGroup) {
      return e.reply('赠予之情，还是在大家面前表达为好。');
    }

    const at = e.message.find(item => item.type === 'at');
    if (!at) {
      await e.reply('请@一位你要赠予礼物的道友。', true);
      return true;
    }
    const receiverId = at.qq;
    const giverId = e.user_id;

    const regex = /^#赠予礼物\s*(.*)/;
    const match = regex.exec(e.msg);

    if (!match) {
      logger.warn('[仙侣系统] giveGift函数被触发，但正则匹配失败, e.msg:', e.msg);
      return;
    }

    const inputStr = match[1].trim();
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

  async propose(e) {
    if (!e.isGroup) {
      return e.reply('求婚乃是大事，当于众人面前表达。');
    }

    const at = e.message.find(item => item.type === 'at');
    if (!at) {
      await e.reply('道友欲与谁结为道侣？请@TA。', true);
      return true;
    }

    const proposerId = e.user_id;
    const receiverId = at.qq;

    const result = await partnerLogic.proposeToPartner(proposerId, receiverId);

    if (result.success) {
      await e.reply(result.message, true);
      await e.reply([segment.at(receiverId),
        ` ${e.sender.card} 向你求婚，你愿意与TA结为道侣吗？请在5分钟内回复【我同意】或【我拒绝】。`]);
    } else {
      await e.reply(result.message, true);
    }
    return true;
  }

  async acceptProposal(e) {
    const result = await partnerLogic.respondToProposal(e.user_id, true);
    if (!result.success) {
      // 如果没人求婚，这个指令就不应该被响应，所以可以返回false，让其他插件处理
      return false;
    }

    // 如果同意成功
    if (result.isAccepted) {
      const proposer = await DAL.getAllPlayerData(result.proposerId);
      const receiver = await DAL.getAllPlayerData(e.user_id);
      const proposerName = proposer?.player?.名号 || result.proposerId;
      const receiverName = receiver?.player?.名号 || e.user_id;
      // 发送全群公告
      await this.e.reply(`🎉 喜结良缘！恭喜 [${proposerName}] 与 [${receiverName}] 结为仙侣，愿二人道途共进，比翼齐飞！`, false);
    }
    return true; // 消费掉“我同意”这条消息
  }

  async rejectProposal(e) {
    const result = await partnerLogic.respondToProposal(e.user_id, false);
    if (!result.success) return false;

    // 通知求婚者
    const proposer = await DAL.getAllPlayerData(result.proposerId);
    const proposerName = proposer?.player?.名号 || result.proposerId;
    this.e.reply(`你拒绝了 ${proposerName} 的求婚。`, true);

    // 尝试私聊通知被拒绝方
    const friend = Bot.fl.get(result.proposerId);
    if (friend) {
      await Bot.pickUser(result.proposerId).sendMsg(`很遗憾，${e.sender.card} 拒绝了你的求婚。`).catch(() => {
      });
    }
    return true;
  }

  async breakUp(e) {
    const result = await partnerLogic.breakUp(e.user_id);
    if (!result.success) {
      return e.reply(result.message, true);
    }
    const user = await DAL.getAllPlayerData(e.user_id);
    const partner = await DAL.getAllPlayerData(result.partnerId);
    const userName = user?.player?.名号 || e.user_id;
    const partnerName = partner?.player?.名号 || result.partnerId;

    await this.e.reply(`叹人间，美中不足今方信。${userName} 与 ${partnerName} 自此仙路殊途，再无瓜葛。`, false);
    return true;
  }

  async showPartnerStatus(e) {
    const result = await partnerLogic.getPartnerDetails(e.user_id);

    if (!result.success) {
      return e.reply(result.message, true);
    }

    const dataForPuppeteer = await new Show(e).get_partnerData(result.data);
    const img = await puppeteer.screenshot('partner', {
      ...dataForPuppeteer,
      _page: {
        deviceScaleFactor: 2 // 开启2倍超清渲染
      }
    });

    if (img) {
      await e.reply(img);
    } else {
      await e.reply('生成道侣信息面板失败，请查看后台日志。');
    }
    return true;
  }
}