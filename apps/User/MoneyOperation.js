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
import { foundthing, convert2integer, Check_thing } from '../Xiuxian/xiuxian.js';
import { Go } from './UserHome.js'; // 假设Go函数已迁移或重构

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
          reg: '^#发(装备|道具|丹药|功法|草药|材料|盒子|仙宠|口粮|项链|食材).*',
          fnc: 'wup'
        },
        {
          reg: '^#全体发(装备|道具|丹药|功法|草药|材料|盒子|仙宠|口粮|项链|食材).*',
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

      const thing_exist = await foundthing(thing_name);
      if (!thing_exist) return e.reply(`这方世界没有[${thing_name}]`);
      if (await Check_thing(thing_exist) === 1) return e.reply(`${thing_exist.name}为特殊物品，不可赠送！`);

      const result = await handleGive(A_qq, B_qq, '物品', {
        thingName: thing_name,
        thingClass: thing_exist.class,
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


  async wup(e) {
    if (!e.isMaster) return;
    const atItem = e.message.find(item => item.type === 'at');
    if (!atItem) return;
    const B_qq = atItem.qq;

    if (!(await DAL.existPlayer(B_qq))) {
      return e.reply('对方无存档');
    }

    const match = e.msg.match(/#发(装备|道具|丹药|功法|草药|材料|盒子|仙宠|口粮|项链|食材)(.*)/);
    if (!match) return;

    let thingClass = match[1] === '口粮' ? '仙宠口粮' : match[1];
    let args = match[2].trim().split('*');
    let thing_name = args[0];
    let amount = args.length > 1 ? await convert2integer(args[1]) : 1;
    let pinji = args.length > 2 ? args[2] : null;

    const thing_exist = await foundthing(thing_name);
    if (!thing_exist || thing_exist.class !== thingClass) {
      return e.reply(`这方世界没有[${thing_name}]这种${thingClass}`);
    }

    await addNajieThing(B_qq, thing_name, thingClass, amount, pinji);
    e.reply('发放成功');
  }

  async wup_all(e) {
    if (!e.isMaster) return;

    const match = e.msg.match(/#全体发(装备|道具|丹药|功法|草药|材料|盒子|仙宠|口粮|项链|食材)(.*)/);
    if (!match) return;

    let thingClass = match[1] === '口粮' ? '仙宠口粮' : match[1];
    let args = match[2].trim().split('*');
    let thing_name = args[0];
    let amount = args.length > 1 ? await convert2integer(args[1]) : 1;
    let pinji = args.length > 2 ? args[2] : null;

    const thing_exist = await foundthing(thing_name);
    if (!thing_exist || thing_exist.class !== thingClass) {
      return e.reply(`这方世界没有[${thing_name}]这种${thingClass}`);
    }

    const playerKeys = await redis.keys('XinghanXiuxian:Data:Player:*');
    if (!playerKeys || playerKeys.length === 0) {
      return e.reply('当前无人修仙。');
    }

    for (const key of playerKeys) {
      const userId = key.split(':').pop();
      await addNajieThing(userId, thing_name, thingClass, amount, pinji);
    }

    e.reply(`发放成功,目前共有${playerKeys.length}个玩家,每人增加${amount}个${thing_name}`);
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