import plugin from '../../../../lib/plugins/plugin.js';
import data from '../../model/XiuxianData.js';
import config from '../../model/Config.js';
import fs from 'fs';
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';

// 新的数据访问层
import * as DAL from '../../api/data-access.js';
import { transaction_update } from '../../api/data-access.js';
import { Gulid } from '../../api/api.js';

// 业务逻辑层
import { canPlayerAction } from '../../logic/transaction_logic.js';
import { depositWithdrawLingshi } from '../../logic/item_logic.js';
import { findItemLocation } from '../../logic/search_logic.js';
import { exchangeRedemptionCode } from '../../logic/exchange_logic.js';
import { refineEquipment } from '../../logic/refine_logic.js';
import { drawFromPool } from '../../logic/gacha_logic.js';
import { offerStone } from '../../logic/stone_logic.js';
import { checkPlayerArchives } from '../../logic/admin_logic.js';
import { buyItem, buyItemWithXianshi, sellItem } from '../../logic/shop_logic.js';
import { equipItem, consumeItem, learnSkill } from '../../logic/item_use_logic.js';

// 旧的工具函数（逐步替换）
import {
  foundthing,
  exist_najie_thing,
  sleep,
  Add_najie_thing
} from '../Xiuxian/xiuxian.js';
import { __PATH } from '../Xiuxian/xiuxian.js';
import { Add_仙宠 } from '../Pokemon/Pokemon.js';

/**
 * 修仙模块 - 物品和货币操作
 */
export class UserHome extends plugin {
  constructor() {
    super({
      name: 'UserHome',
      dsc: '修仙模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#(存|取)灵石(.*)$',
          fnc: 'takeLingshi'
        },
        {
          reg: '^#(装备|消耗|服用|学习|打开|解除封印|寻宝|合成|加工|附魔)((.*)|(.*)*(.*))$',
          fnc: 'playerUse'
        },
        {
          reg: '^#购买((.*)|(.*)*(.*))$',
          fnc: 'buyCommodities'
        },
        {
          reg: '^#仙石购买((.*)|(.*)*(.*))$',
          fnc: 'xianshiBuyCommodities'
        },
        {
          reg: '^#出售.*$',
          fnc: 'sellCommodities'
        },
        {
          reg: '^#查询(纳戒|物品)(.*)$',
          fnc: 'findNajieThing'
        },
        {
          reg: '^#哪里有(.*)$',
          fnc: 'findThing'
        },
        {
          reg: '^#召唤天理$',
          fnc: 'heavenly'
        },
        {
          reg: '^#精炼.*$',
          fnc: 'refining'
        },
        {
          reg: '^#检查存档.*$',
          fnc: 'checkPlayer'
        },
        {
          reg: '^#抽(天地卡池|灵界卡池|凡界卡池)$',
          fnc: 'drawPool'
        },
        {
          reg: '^#供奉奇怪的石头$',
          fnc: 'offerStone'
        },
        {
          reg: '^#兑换码兑换.*$',
          fnc: 'exchangeCode'
        },
        {
          reg: '^#幻影牌面.*$',
          fnc: 'phantomCard'
        }
      ]
    });
    this.xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');
  }

  /**
   * 预检函数，处理通用检查
   * @param {*} e 消息对象
   * @param {boolean} checkAction 是否检查玩家当前状态
   * @returns {Promise<string|null>} 玩家ID或null
   */
  async preCheck(e, checkAction = false) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return null;
    }
    const userId = await Gulid(e.user_id.toString().replace('qg_', ''));
    if (!await DAL.existPlayer(userId)) {
      return null; // 存档不存在，不回复
    }
    if (checkAction) {
      const check = await canPlayerAction(userId);
      if (!check.can_action) {
        e.reply(check.message);
        return null;
      }
    }
    return userId;
  }

  /**
   * #存/取灵石
   */
  async takeLingshi(e) {
    const userId = await this.preCheck(e, true);
    if (!userId) return;

    const match = e.msg.match(/^#(存|取)灵石(.*)$/);
    const type = match[1]; // '存' 或 '取'
    let amount = match[2].trim();

    if (amount === '全部') {
      // '全部' 是有效输入，直接传递
    } else {
      amount = Number(amount);
      if (isNaN(amount) || amount <= 0) {
        const player = (await DAL.getAllPlayerData(userId))?.player;
        e.reply([`【${player.名号}】`,
          `请在指令后面加上正确的灵石数量`]);
        return;
      }
    }

    // 调用核心逻辑函数
    const result = await depositWithdrawLingshi(userId, type, amount);

    // 根据返回结果回复用户
    const player = (await DAL.getAllPlayerData(userId))?.player;
    e.reply([`【${player.名号}】`,
    result.message]);
  }

  /**
   * #查询纳戒/物品
   */
  async findNajieThing(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    let thing = e.msg.replace('#', '');
    thing = thing.replace('查询纳戒', '').replace('查询物品', '');
    const code = thing.split('\*');
    const thingExist = await foundthing(code[0]);

    if (!thingExist) {
      e.reply(`这方世界没有[${code[0]}]`);
      return;
    }

    const quantity = await exist_najie_thing(userId, code[0], thingExist.class);
    if (!quantity) {
      e.reply(`你没有[${code[0]}]这样的${thingExist.class}`);
      return;
    }

    e.reply('你现在拥有' + code[0] + '*' + quantity);
  }

  /**
   * #兑换码兑换
   */
  async exchangeCode(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    const name = e.msg.replace('#兑换码兑换', '').trim();
    const result = await exchangeRedemptionCode(userId, name);

    e.reply(result.message);
  }

  /**
   * #检查存档 (仅主人可用)
   */
  async checkPlayer(e) {
    if (!e.isMaster) {
      e.reply('只有主人可以执行操作');
      return;
    }

    const result = await checkPlayerArchives();

    // 发送检查结果
    for (const report of result.reports) {
      await e.reply(report);
    }
  }

  /**
   * #供奉奇怪的石头
   */
  async offerStone(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    const result = await offerStone(userId);

    if (result.needSleep) {
      e.reply(result.firstMessage);
      await sleep(3000);
      e.reply(result.secondMessage);
      if (result.thirdMessage) {
        await sleep(1000);
        e.reply(result.thirdMessage);
      }
    } else {
      e.reply(result.message);
    }
  }

  /**
   * #抽卡池
   */
  async drawPool(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    const poolType = e.msg.replace('#抽', '');
    const result = await drawFromPool(userId, poolType);

    if (result.success) {
      e.reply('一道金光从天而降');
      await sleep(5000);
      e.reply(`金光掉落在地上，走近一看是【${result.grade}】${result.name}`);
      await sleep(1000);
      await Add_仙宠(userId, result.name, 1);
      e.reply(`恭喜获得${result.name}`);
    } else {
      e.reply(result.message);
    }
  }

  /**
   * #精炼装备
   */
  async refining(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    const thing = e.msg.replace('#精炼', '');
    const result = await refineEquipment(userId, thing);

    e.reply(result.message);
  }

  /**
   * #哪里有物品
   */
  async findThing(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    const thingName = e.msg.replace('#哪里有', '');
    const result = await findItemLocation(userId, thingName);

    e.reply(result.message);
  }

  /**
   * #召唤天理
   */
  async heavenly(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    const result = await summonHeavenly(userId);
    e.reply(result.message);
  }

  /**
   * #装备/消耗/服用等操作
   */
  async playerUse(e) {
    const userId = await this.preCheck(e, true);
    if (!userId) return;

    const match = e.msg.match(/^#(装备|消耗|服用|学习|打开|解除封印|寻宝|合成|加工|附魔)(.*)$/);
    const action = match[1];
    const itemName = match[2].trim();

    if (!itemName) {
      e.reply('请指定要操作的物品名称');
      return;
    }

    let result;
    switch (action) {
      case '装备':
        result = await equipItem(userId, itemName);
        break;
      case '消耗':
      case '服用':
        result = await consumeItem(userId, itemName);
        break;
      case '学习':
        result = await learnSkill(userId, itemName);
        break;
      case '打开':
        result = await openItem(userId, itemName);
        break;
      case '解除封印':
        result = await unsealItem(userId, itemName);
        break;
      case '寻宝':
        // 寻宝功能已在 findThing 中实现
        result = { success: false, message: '请使用 #寻物 命令' };
        break;
      case '合成':
        result = await synthesizeItem(userId, itemName);
        break;
      case '加工':
        result = await processItem(userId, itemName);
        break;
      case '附魔':
        // 附魔需要两个参数：附魔书和目标装备
        const parts = itemName.split(' ');
        if (parts.length < 2) {
          result = { success: false, message: '附魔格式：#附魔 附魔书名称 目标装备名称' };
        } else {
          result = await enchantItem(userId, parts[0], parts[1]);
        }
        break;
      default:
        result = {
          success: false,
          message: `${action}功能正在开发中`
        };
    }

    e.reply(result.message);
  }

  /**
   * #幻影牌面
   */
  async phantomCard(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    const match = e.msg.match(/^#幻影牌面\s*(装备|练气)?\s*(.*)$/);
    const cardType = match[1] || '练气';
    const cardName = match[2]?.trim();

    if (cardName) {
      // 装备指定牌面
      const result = await equipPhantomCard(userId, cardName, cardType);
      e.reply(result.message);
    } else {
      // 查看牌面列表
      const result = await getPhantomCardList(cardType);
      if (result.success) {
        const cardList = result.cards.map(card =>
          `${card.id}: ${card.name} (${card.type2 || '常驻'})`
        ).join('\n');
        e.reply(`${cardType}幻影牌面列表：\n${cardList}`);
      } else {
        e.reply('获取牌面列表失败');
      }
    }
  }
}

/**
 * Go函数 - 检查玩家状态，返回正在xxx中，还有xx分xx秒，并且截断函数不执行后续
 * @param {object} e - 事件对象
 * @returns {Promise<string|null>} - 返回用户ID或null（如果不能执行操作）
 */
export async function Go(e) {
  // 获取用户ID
  let userId = e.user_id.toString().replace('qg_', '');
  userId = await Gulid(userId);

  // 检查玩家是否存在
  if (!await existPlayer(userId)) {
    e.reply('你还没有踏入仙途，请先发送 #我要修仙 开始修仙之路');
    return null;
  }

  // 检查玩家是否正在执行其他操作
  const action = await DAL.getPlayerAction(userId);
  if (action) {
    const remainingTime = action.endTime - Date.now();
    if (remainingTime > 0) {
      const m = Math.floor(remainingTime / 60000);
      const s = Math.floor((remainingTime % 60000) / 1000);
      e.reply(`正在${action.action}中，剩余时间：${m > 0 ? m : 0}分${s > 0 ? s : 0}秒`);
      return null;
    }
  }

  // 检查玩家血量
  const playerData = await getAllPlayerData(userId);
  const player = playerData?.player;

  if (!player) {
    e.reply('获取玩家数据失败，请稍后再试');
    return null;
  }

  if (player.当前血量 < 200) {
    e.reply('你都伤成这样了，就不要出去浪了');
    return null;
  }

  // 所有检查通过，返回用户ID
  return userId;
}