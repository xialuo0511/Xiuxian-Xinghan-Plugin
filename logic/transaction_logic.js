import * as DAL from '../api/data-access.js';
import config from '../model/Config.js';

const xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');

/**
 * 检查玩家是否可以执行操作 (重构的 Go 函数)
 * @param {string} userId
 * @returns {Promise<{can_action: boolean, message: string, player: object|null}>}
 */
export async function canPlayerAction(userId) {
  const action = await DAL.getPlayerAction(userId);
  if (action) {
    let m = Math.floor((action.endTime - Date.now()) / 60000);
    let s = Math.floor(((action.endTime - Date.now()) % 60000) / 1000);
    return {
      can_action: false,
      message: `正在${action.action}中,剩余时间:${m > 0 ? m : 0}分${s > 0 ? s : 0}秒`,
      player: null
    };
  }
  const player = (await DAL.getAllPlayerData(userId))?.player;
  if (player.当前血量 < 200) {
    return { can_action: false, message: '你都伤成这样了,就不要出去浪了', player: null };
  }
  return { can_action: true, message: '', player: player };
}


/**
 * 赠送灵石
 * @param {string} senderId
 * @param {string} receiverId
 * @param {number} amount
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function transferLingshi(senderId, receiverId, amount) {
  const cost = xiuxianConfigData.percentage.cost;
  const totalCost = amount + Math.trunc(amount * cost);

  // 使用事务来确保双方灵石的正确转移
  const senderResult = await DAL.transaction_update(senderId, (player) => {
    if (player.level_id < 12) {
      return { success: false, message: `${player.名号}你暂未解锁赠送功能，赠送功能金丹期后解锁` };
    }
    if (player.灵石 < totalCost) {
      return { success: false, message: `你身上似乎没有${totalCost}灵石` };
    }
    player.灵石 -= totalCost;
    return { success: true };
  });

  if (!senderResult.success) {
    return senderResult;
  }

  // 对方增加灵石
  await DAL.transaction_update(receiverId, (player) => {
    player.灵石 += amount;
    return true;
  });

  // 更新世界财富
  const worldMoney = Number(await redis.get('Xiuxian:Worldmoney') || 0);
  await redis.set('Xiuxian:Worldmoney', worldMoney + (totalCost - amount));

  return { success: true };
}

/**
 * 打开钱包
 * @param {string} userId
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function openWallet(userId) {
  const itemName = '水脚脚的钱包';
  let message = `你没有[${itemName}]这样的装备`;
  let success = false;

  const transactionSuccess = await DAL.transaction_update(userId, (player, equipment, najie) => {
    const wallet = najie.装备.find(item => item.name === itemName);
    if (!wallet || wallet.数量 < 1) {
      return false; // 钱包不存在或数量不足，中止事务
    }

    // 扣除钱包
    wallet.数量--;
    if (wallet.数量 === 0) {
      najie.装备 = najie.装备.filter(item => item.name !== itemName);
    }

    // 计算随机灵石
    const rand = Math.random();
    let lingshi = 0;
    if (rand < 0.1) lingshi = 2000000;
    else if (rand < 0.2) lingshi = 1000000;
    else if (rand < 0.4) lingshi = 400000;
    else if (rand < 0.7) lingshi = 180000;
    else lingshi = 100000;

    player.灵石 += lingshi;
    message = `${player.名号}打开了[${itemName}]，金光一现！获得了${lingshi}颗灵石！`;
    success = true;
    return true; // 提交事务
  });

  return { success: transactionSuccess && success, message: message };
}


/**
 * [后台] 全体发福利 (灵石)
 * @param {number} amount
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function giveLingshiToAll(amount) {
  const playerKeys = await redis.keys('XinghanXiuxian:Data:Player:*');
  if (playerKeys.length === 0) {
    return { success: false, message: '当前没有任何玩家' };
  }

  // 注意：对大量玩家进行循环更新可能会有性能影响
  for (const key of playerKeys) {
    const userId = key.split(':').pop();
    await DAL.transaction_update(userId, (player) => {
      player.灵石 += amount;
      return true;
    });
  }

  return { success: true, message: `福利发放成功,目前共有${playerKeys.length}个玩家,每人增加${amount}灵石` };
}
