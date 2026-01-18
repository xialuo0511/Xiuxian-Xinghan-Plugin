import plugin from '../../../../lib/plugins/plugin.js';
import config from '../../model/Config.js';
import * as DAL from '../../api/data-access.js';
import {
  addLingshi,
  addNajieThing,
  handleClaimRedPacket, handleCreateRedPacket,
  handleGive,
  handleOpenWallet
} from '../../logic/money_logic.js';
import { foundthing, convert2integer } from '../Xiuxian/xiuxian.js';
import { Go } from './UserHome.js';

export class MoneyOperation extends plugin {
  constructor() {
    super({
      name: 'MoneyOperation',
      dsc: '修仙模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^赠送.*',
          fnc: 'Give'
        },
        {
          reg: '^#发红包.*$',
          fnc: 'Give_honbao'
        },
        {
          reg: '^#抢红包$',
          fnc: 'uer_honbao'
        },
        {
          reg: '^#发福利.*$',
          fnc: 'Allfuli'
        },
        {
          reg: '^#发补偿.*$',
          fnc: 'Fuli'
        },
        {
          reg: '^#发\s*.*',
          fnc: 'wup'
        },
        {
          reg: '^#全体发\s*.*',
          fnc: 'wup_all'
        },
        {
          reg: '^#扣除.*$',
          fnc: 'Deduction'
        },
        {
          reg: '^#打开钱包$',
          fnc: 'openwallet'
        }
      ]
    });
    this.xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');
  }

  async Give(e) {
    const A_qq = await Go(e);
    if (!A_qq) return;

    const atItem = e.message.find(item => item.type === 'at');
    if (!atItem) return;
    const B_qq = atItem.qq;

    if (!(await DAL.existPlayer(B_qq))) {
      return e.reply(`此人尚未踏入仙途`);
    }

    const A_player = (await DAL.getAllPlayerData(A_qq)).player;
    const B_player = (await DAL.getAllPlayerData(B_qq)).player;

    if (A_player.level_id < 12) {
      return e.reply(`${A_player.名号}, 你暂未解锁赠送功能，金丹期后方可解锁。`);
    }

    let msg = e.msg.replace('#赠送', '').replace(/<@!*(\d+)>/, '').trim();

    if (msg.startsWith('灵石')) {
      let lingshi = Number(msg.replace('灵石*', ''));
      if (isNaN(lingshi) || lingshi < 1000) {
        lingshi = 1000;
        e.reply(`这么点灵石也好意思出手？起码1000灵石，已为你自动调整。`);
      }

      const cost = this.xiuxianConfigData.percentage.cost;
      let totalCost = lingshi + Math.trunc(lingshi * cost);

      const result = await handleGive(A_qq, B_qq, '灵石', { amount: lingshi, totalCost });
      if (result.success) {
        e.reply([segment.at(A_qq),
        segment.at(B_qq),
        `${B_player.名号} 获得了由 ${A_player.名号} ${result.message}`]);
      } else {
        e.reply(result.message);
      }

    } else {
      let [thing_name, pinji_str, amount_str] = msg.split('*');
      let amount = 1;
      let pinji = null;

      if (amount_str) {
        pinji = pinji_str;
        amount = await convert2integer(amount_str);
      } else if (pinji_str) {
        amount = await convert2integer(pinji_str);
      }

      // 使用 DAL 获取发送者纳戒数据进行检查
      const senderData = await DAL.getAllPlayerData(A_qq);
      if (!senderData || !senderData.najie) {
        return e.reply('未找到你的纳戒数据');
      }
      const najie = senderData.najie;

      // 查找物品及其类别
      let foundItem = null;
      let foundCategory = null;
      const categories = ['装备', '丹药', '道具', '功法', '草药', '材料', '食材', '盒子', '仙宠', '仙宠口粮'];

      for (const category of categories) {
        if (najie[category]) {
          const item = najie[category].find(i => i.name === thing_name);
          if (item) {
            foundItem = item;
            foundCategory = category;
            break;
          }
        }
      }

      if (!foundItem) {
        return e.reply(`你的纳戒中没有[${thing_name}]`);
      }

      // 检查物品数量
      if (foundItem.数量 < amount) {
        return e.reply(`你的[${thing_name}]数量不足，当前拥有 ${foundItem.数量} 个`);
      }

      // 检查是否锁定
      if (foundItem.islockd === 1) {
        return e.reply(`[${thing_name}]已被锁定，无法赠送！请先解锁后再操作。`);
      }

      // 检查是否为活动类物品
      if (foundItem.class === '活动') {
        return e.reply(`[${thing_name}]为活动物品，不可赠送！`);
      }

      // 检查特殊物品ID范围 (与原 Check_thing 逻辑一致)
      if (foundItem.id >= 5005000 && foundItem.id <= 5005009) {
        return e.reply(`[${thing_name}]为特殊物品，不可赠送！`);
      }
      if (foundItem.id >= 400991 && foundItem.id <= 400999) {
        return e.reply(`[${thing_name}]为特殊物品，不可赠送！`);
      }

      const result = await handleGive(A_qq, B_qq, '物品', {
        thingName: thing_name,
        thingClass: foundCategory,
        amount: amount,
        pinji: pinji
      });

      if (result.success) {
        e.reply([segment.at(A_qq),
        segment.at(B_qq),
        `${B_player.名号} 获得了由 ${A_player.名号} ${result.message}`]);
      } else {
        e.reply(result.message);
      }
    }
  }


  /**
   * 解析物品字符串并使用 foundthing 查找物品
   * @param {string} itemStr - 格式为 "物品名*数量*品级" 的字符串
   * @returns {Promise<{success: boolean, item?: object, amount?: number, pinji?: string, message?: string}>}
   */
  async parseItemStrAndFind(itemStr) {
    if (!itemStr) {
      return { success: false, message: '请提供物品信息。' };
    }

    const args = itemStr.trim().split('*');
    const itemName = args[0];
    const amount = args.length > 1 ? await convert2integer(args[1]) : 1;
    const pinji = args.length > 2 ? args[2] : null;

    if (!itemName) {
      return { success: false, message: '请输入要发放的物品名称。' };
    }

    const item = await foundthing(itemName);
    if (!item) {
      return { success: false, message: `这方世界似乎没有名为 [${itemName}] 的物品。` };
    }

    return { success: true, item, amount, pinji };
  }


  // 优化后的 wup 函数
  async wup(e) {
    if (!e.isMaster) return;

    const atItem = e.message.find(item => item.type === 'at');
    if (!atItem) {
      return e.reply('请@你要发放物品的玩家。', true);
    }
    const B_qq = atItem.qq;

    if (!(await DAL.existPlayer(B_qq))) {
      return e.reply('对方无存档');
    }

    const itemStr = e.msg.replace(/#发\s*/, '');
    const result = await this.parseItemStrAndFind(itemStr);

    if (!result.success) {
      return e.reply(result.message, true);
    }

    await addNajieThing(B_qq, result.item.name, result.item.class, result.amount, result.pinji);
    e.reply(`已成功向玩家 [${B_qq}] 发放 [${result.item.name}] x ${result.amount}。`);
  }


  // 【最终修复版】

  async wup_all(e) {
    if (!e.isMaster) {
      return e.reply('暂无权限操作。', true);
    }

    try {
      const itemStr = e.msg.replace(/#全体发\s*/, '');
      if (!itemStr) {
        return e.reply('请提供要发放的物品信息，例如：#全体发 秘境之匙*10', true);
      }

      const args = itemStr.trim().split('*');
      const itemName = args[0];
      if (!itemName) {
        return e.reply('请输入要发放的物品名称。', true);
      }
      const amount = args.length > 1 ? await convert2integer(args[1]) : 1;
      const pinji = args.length > 2 ? args[2] : null;

      const item = await foundthing(itemName);
      if (!item) {
        return e.reply(`这方世界似乎没有名为 [${itemName}] 的物品。`, true);
      }

      e.reply('正在统计所有修仙玩家，请稍候...', true);

      let cursor = 0; // SCAN的初始游标必须是数字0，而不是字符串'0'
      const userIds = [];

      do {
        // --- 【核心修正】改用对象形式传递SCAN参数 ---
        const scanResult = await redis.scan(cursor, {
          MATCH: 'XinghanXiuxian:Data:Player:*',
          COUNT: 200
        });
        // --- 修正结束 ---

        cursor = scanResult.cursor;
        if (scanResult.keys && scanResult.keys.length > 0) {
          for (const key of scanResult.keys) {
            userIds.push(key.split(':').pop());
          }
        }
      } while (cursor !== 0); // 循环的终止条件也是数字0

      if (userIds.length === 0) {
        return e.reply('当前无人修仙。');
      }

      e.reply(`已统计到 ${userIds.length} 位玩家，开始发放 [${item.name}] x ${amount}，过程可能需要一些时间...`);

      let successCount = 0;
      for (const userId of userIds) {
        try {
          await addNajieThing(userId, item.name, item.class, amount, pinji);
          successCount++;
        } catch (addError) {
          logger.error(`[全体发放] 为用户 ${userId} 发放 [${item.name}] 时失败:`, addError);
        }
      }

      e.reply(`操作成功！\n已为 ${successCount} / ${userIds.length} 位玩家发放了 [${item.name}] x ${amount}。`);

    } catch (error) {
      logger.error(`[全体发放] 执行时发生严重错误:`, error);
      return e.reply('执行全体发放时遇到未知错误，请查看后台日志。', true);
    }
  }

  async Deduction(e) {
    if (!e.isMaster) return e.reply('你小子');
    const atItem = e.message.find(item => item.type === 'at');
    if (!atItem) return;
    const B_qq = atItem.qq;

    if (!(await DAL.existPlayer(B_qq))) {
      return e.reply(`此人尚未踏入仙途`);
    }

    let lingshi = Number(e.msg.replace(/#扣除|<@!*(\d+)>/g, '').trim());
    if (isNaN(lingshi) || lingshi < 1000) {
      return;
    }

    await addLingshi(B_qq, -lingshi);
    e.reply('已强行扣除灵石' + lingshi);
  }

  async Give_honbao(e) {
    const userId = await Go(e);
    if (!userId) return;

    let [lingshiStr, countStr] = e.msg.replace('#发红包', '').trim().split('*');
    let lingshiPerPacket = Number(lingshiStr);
    let count = Number(countStr);

    if (isNaN(lingshiPerPacket) || isNaN(count) || lingshiPerPacket <= 0 || count <= 0) return;

    if (count < 8) {
      e.reply('你好意思发这几个红包？看不起谁呢(已自动修改为八个)');
      count = 8;
    }
    if (lingshiPerPacket < 10000 || lingshiPerPacket % 10000 !== 0) {
      return e.reply(`一个红包最低为一万灵石，且必须是万的倍数。`);
    }

    const result = await handleCreateRedPacket(userId, lingshiPerPacket, count);
    e.reply(result.message);
  }

  async uer_honbao(e) {
    const claimerId = await Go(e);
    if (!claimerId) return;

    const atItem = e.message.find(item => item.type === 'at');
    if (!atItem) return;
    const ownerId = atItem.qq;

    if (!(await DAL.existPlayer(ownerId))) return;

    const result = await handleClaimRedPacket(claimerId, ownerId);

    if (result.success) {
      e.reply(`【全服公告】${result.claimerName} 抢到了一个 ${result.lingshi} 灵石的红包！`);
    } else if (result.code === 'CD') {
      const m = Math.floor(result.remaining / 60000);
      const s = Math.floor((result.remaining % 60000) / 1000);
      e.reply(`每${this.xiuxianConfigData.CD.honbao}分钟抢一次，正在CD中，剩余cd: ${m}分${s}秒`);
    } else {
      e.reply(result.message);
    }
  }

  async Allfuli(e) {
    if (!e.isMaster) return;

    let lingshi = Number(e.msg.replace('#发福利', '').trim());
    if (isNaN(lingshi) || lingshi <= 0) {
      lingshi = 100;
    }

    const playerKeys = await redis.keys('XinghanXiuxian:Data:Player:*');
    if (!playerKeys || playerKeys.length === 0) {
      return e.reply('当前无人修仙。');
    }

    for (const key of playerKeys) {
      const userId = key.split(':').pop();
      await addLingshi(userId, lingshi);
    }

    e.reply(`福利发放成功,目前共有${playerKeys.length}个玩家,每人增加${lingshi}灵石`);
  }

  async Fuli(e) {
    if (!e.isMaster) return;

    const atItem = e.message.find(item => item.type === 'at');
    if (!atItem) return;
    const targetId = atItem.qq;

    if (!(await DAL.existPlayer(targetId))) {
      return e.reply(`此人尚未踏入仙途`);
    }

    let lingshi = Number(e.msg.replace(/#发补偿|<@!*(\d+)>/g, '').trim());
    if (isNaN(lingshi) || lingshi <= 0) {
      lingshi = 100;
    }

    await addLingshi(targetId, lingshi);
    const targetPlayer = (await DAL.getAllPlayerData(targetId)).player;
    e.reply(`【全服公告】 ${targetPlayer.名号} 获得了${lingshi}灵石的补偿`);
  }

  async openwallet(e) {
    const userId = await Go(e);
    if (!userId) return;

    const result = await handleOpenWallet(userId);
    if (result.success) {
      const player = (await DAL.getAllPlayerData(userId)).player;
      e.reply(`${player.名号} 打开了[水脚脚的钱包]，金光一闪！获得了 ${result.lingshi} 颗灵石！`);
    } else {
      e.reply(result.message);
    }
  }

}