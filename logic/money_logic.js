import * as DAL from '../api/data-access.js';
import { foundthing } from '../apps/Xiuxian/xiuxian.js';

/**
 * [DAL版] 增加或减少玩家灵石
 * @param {string} userId 玩家ID
 * @param {number} amount 灵石数量 (正数为增加, 负数为减少)
 * @returns {Promise<boolean>} 是否成功
 */
export async function addLingshi(userId, amount) {
  if (amount === 0) return true;
  return await DAL.transaction_update(userId, (player) => {
    player.灵石 = (player.灵石 || 0) + amount;
    return true;
  });
}

/**
 * 增加或减少纳戒中的物品
 * @param {string} userId 玩家ID
 * @param {string} thingName 物品名称
 * @param {string} thingClass 物品类别
 * @param {number} amount 数量 (正数为增加, 负数为减少)
 * @param {number|string|null} pinji 装备品级 (可选)
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function addNajieThing(userId, thingName, thingClass, amount, pinji = null) {
  // 确保传入的 amount 是数字
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount === 0) return { success: true, message: '数量无变化' };

  const allData = await DAL.getAllPlayerData(userId);
  if (!allData) return { success: false, message: '玩家数据不存在' };

  const { najie } = allData;
  const thingDefinition = await foundthing(thingName);
  if (numAmount > 0 && !thingDefinition) return { success: false, message: `物品 ${thingName} 定义不存在` };

  const category = thingClass === '口粮' ? '仙宠口粮' : thingClass;
  if (!najie[category]) najie[category] = [];

  let itemIndex = -1;
  if (thingClass === '装备') {
    // 装备的查找逻辑比较特殊，保持不变
    itemIndex = najie[category].findIndex(i => i.name === thingName && i.pinji === pinji);
  } else {
    itemIndex = najie[category].findIndex(i => i.name === thingName);
  }

  if (itemIndex > -1) {
    const item = najie[category][itemIndex];

    const currentAmount = Number(item.数量) || 0;
    item.数量 = currentAmount + numAmount;

  } else if (numAmount > 0) {
    let newItem = { ...thingDefinition, 数量: numAmount, islockd: 0 };
    if (thingClass === '装备') newItem.pinji = pinji; // 装备品级处理
    najie[category].push(newItem);
  } else {
    return { success: false, message: `纳戒中没有可减少的 ${thingName}` };
  }

  // 移除数量为0或以下的物品
  najie[category] = najie[category].filter(i => i.数量 > 0);

  await DAL.saveNajie(userId, najie);
  return { success: true, message: '操作成功' };
}

/**
 * [DAL版] 处理玩家间的赠送逻辑
 * @param {string} senderId 发送者ID
 * @param {string} receiverId 接收者ID
 * @param {string} type "灵石" 或 "物品"
 * @param {object} details 赠送详情
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function handleGive(senderId, receiverId, type, details) {
  if (type === '灵石') {
    const { amount, totalCost } = details;

    // 使用事务扣除发送者灵石
    const deductSuccess = await DAL.transaction_update(senderId, (player) => {
      if (player.灵石 < totalCost) return false; // 中止事务
      player.灵石 -= totalCost;
      return true;
    });

    if (!deductSuccess) {
      return { success: false, message: `你身上似乎没有${totalCost}灵石` };
    }

    // 增加接收者灵石
    await addLingshi(receiverId, amount);

    return { success: true, message: `赠送了${amount}灵石` };
  }

  if (type === '物品') {
    const { thingName, thingClass, amount, pinji } = details;
    // 先从发送者纳戒移除
    const removeResult = await addNajieThing(senderId, thingName, thingClass, -amount, pinji);
    if (!removeResult.success) {
      return removeResult;
    }
    // 再添加到接收者纳戒
    await addNajieThing(receiverId, thingName, thingClass, amount, pinji);

    return { success: true, message: `赠送了[${thingName}]×${amount}` };
  }

  return { success: false, message: '未知的赠送类型' };
}

/**
 * [DAL版] 处理打开钱包的逻辑
 */
export async function handleOpenWallet(userId) {
  const removeResult = await addNajieThing(userId, '水脚脚的钱包', '装备', -1);
  if (!removeResult.success) {
    return { success: false, message: '你没有[水脚脚的钱包]这样的装备' };
  }

  const rand = Math.random();
  let lingshi = 0;
  if (rand < 0.1) lingshi = 2000000;
  else if (rand < 0.2) lingshi = 1000000;
  else if (rand < 0.3) lingshi = 400000;
  else if (rand < 0.4) lingshi = 180000;
  else lingshi = 100000;

  await addLingshi(userId, lingshi);
  return { success: true, lingshi: lingshi };
}

/**
 * [DAL版] 处理交税逻辑
 */
export async function handleTax(userId, amount) {
  const success = await DAL.transaction_update(userId, (player) => {
    if (player.灵石 < amount) return false;
    player.灵石 -= amount;
    return true;
  });

  if (!success) {
    return { success: false, message: '醒醒，你没有那么多灵石！' };
  }

  await redis.incrByFloat('Xiuxian:Worldmoney', amount);
  return { success: true, message: `成功交税${amount}灵石！` };
}

/**
 * [DAL版] 处理发红包逻辑
 */
export async function handleCreateRedPacket(userId, lingshiPerPacket, count) {
  const totalCost = lingshiPerPacket * count;
  let resultMessage = '';

  const success = await DAL.transaction_update(userId, (player) => {
    if (player.灵石 < totalCost) {
      resultMessage = '你的灵石不足以发 इतने बड़े红包！';
      return false;
    }
    player.灵石 -= totalCost;
    return true;
  });

  if (!success) {
    return { success: false, message: resultMessage };
  }

  await redis.set(`xiuxian:player:${userId}:honbao`, lingshiPerPacket);
  await redis.set(`xiuxian:player:${userId}:honbaoacount`, count);

  const player = (await DAL.getAllPlayerData(userId)).player;
  return { success: true, message: `【全服公告】${player.名号} 发了 ${count} 个 ${lingshiPerPacket} 灵石的红包！` };
}

/**
 * [DAL版] 处理抢红包逻辑
 */
export async function handleClaimRedPacket(claimerId, ownerId) {
  const cdTime = xiuxianConfigData.CD.honbao * 60000;
  const lastTime = parseInt(await redis.get(`xiuxian:player:${claimerId}:last_getbung_time`)) || 0;

  if (Date.now() < lastTime + cdTime) {
    // 在指令文件中处理CD提示，这里只返回状态
    return { success: false, code: 'CD', remaining: (lastTime + cdTime - Date.now()) };
  }

  const count = await redis.decr(`xiuxian:player:${ownerId}:honbaoacount`);

  if (count < 0) {
    // 如果减后小于0，说明已经没了，再加回去
    await redis.incr(`xiuxian:player:${ownerId}:honbaoacount`);
    return { success: false, code: 'EMPTY', message: '他的红包被抢光啦！' };
  }

  const lingshi = parseInt(await redis.get(`xiuxian:player:${ownerId}:honbao`)) || 0;
  await addLingshi(claimerId, lingshi);
  await redis.set(`xiuxian:player:${claimerId}:last_getbung_time`, Date.now());

  const claimerPlayer = (await DAL.getAllPlayerData(claimerId)).player;
  return { success: true, lingshi: lingshi, claimerName: claimerPlayer.名号 };
}