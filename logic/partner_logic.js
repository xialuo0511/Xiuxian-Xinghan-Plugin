import * as DAL from '../api/data-access.js';
import XiuxianData from '../model/XiuxianData.js';
import { loadItemConfig, loadSystemConfig } from '../model/ConfigLoader.js';
import { foundthing } from '../apps/Xiuxian/xiuxian.js';

const giftsConfig = XiuxianData.gift_list;
const partnerLevelsConfig = loadItemConfig('partner_levels.yaml');
const partnerShopConfig = loadItemConfig('partner_shop.yaml'); // 加载商店配置


/**
 * 根据两个用户ID，生成唯一的、规范化的关系键
 * @param {string|number} userId1
 * @param {string|number} userId2
 * @returns {string} Redis key
 */
export function getRelationshipKey(userId1, userId2) {
  const minId = Math.min(Number(userId1), Number(userId2));
  const maxId = Math.max(Number(userId1), Number(userId2));
  return `XinghanXiuxian:relationship:${minId}:${maxId}`;
}

/**
 * 获取道侣等级指南所需的数据
 * @param {string} userId
 * @returns {Promise<{success: boolean, data?: object, message?: string}>}
 */
export async function getPartnerLevelGuide(userId) {
  const partnerId = await getPartnerId(userId);
  const systemConfig = loadSystemConfig('partner_system.yaml'); // 加载系统配置

  let currentLevel = -1;
  if (partnerId) {
    const relationshipKey = getRelationshipKey(userId, partnerId);
    currentLevel = parseInt(await redis.hGet(relationshipKey, 'level') || '0');
  }

  const startLevel = Math.max(0, currentLevel - 2);
  const endLevel = currentLevel + 5;

  const displayLevels = partnerLevelsConfig.filter(
    level => level.level >= startLevel && level.level <= endLevel
  );

  displayLevels.forEach(level => {
    level.is_unlocked = (level.level <= currentLevel);
  });

  const hasMoreLevels = partnerLevelsConfig.some(level => level.level > endLevel);

  const dataForRender = {
    level_list: displayLevels,
    has_more_levels: hasMoreLevels,
    is_partner: !!partnerId,
    help_text: systemConfig.level_guide_help_text
  };

  return { success: true, data: dataForRender };
}

/**
 * 获取姻缘堂商店的详细信息
 * @param {string} userId
 * @returns {Promise<{success: boolean, data?: object, message?: string}>}
 */
export async function getShopDetails(userId) {
  const partnerId = await getPartnerId(userId);
  if (!partnerId) {
    return { success: false, message: '孤身一人，无法开启姻缘堂。' };
  }

  const relationshipKey = getRelationshipKey(userId, partnerId);
  const relationshipStats = await redis.hGetAll(relationshipKey);
  const currentCoins = parseInt(relationshipStats.coins || '0');

  // 获取已购买数量
  const purchaseLimits = await redis.hGetAll(relationshipKey + ':limits');

  // 组装商品列表，并加入已购买信息
  const shopItems = partnerShopConfig.map(item => ({
    ...item,
    purchased: parseInt(purchaseLimits[item.name] || '0')
  }));

  return {
    success: true,
    data: {
      coins: currentCoins,
      items: shopItems
    }
  };
}


/**
 * 购买姻缘堂商品
 * @param {string} userId 购买者ID
 * @param {string} itemName 物品名称
 * @param {number} amount 购买数量
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function purchaseShopItem(userId, itemName, amount) {
  if (amount <= 0) return { success: false, message: '购买数量必须大于0。' };

  const partnerId = await getPartnerId(userId);
  if (!partnerId) {
    return { success: false, message: '此乃仙侣专属，道友请先寻觅良缘。' };
  }

  const itemInfo = partnerShopConfig.find(item => item.name === itemName);
  if (!itemInfo) {
    return { success: false, message: `姻缘堂中并无 [${itemName}] 此物。` };
  }

  const relationshipKey = getRelationshipKey(userId, partnerId);
  const limitKey = relationshipKey + ':limits';

  // 1. 检查购买限额
  const purchasedAmount = parseInt(await redis.hGet(limitKey, itemName) || '0');
  if (purchasedAmount + amount > itemInfo.purchaseLimit) {
    return {
      success: false,
      message: `[${itemName}] 每对仙侣限购 ${itemInfo.purchaseLimit} 个，你们已购买 ${purchasedAmount} 个，无法再购买 ${amount} 个。`
    };
  }

  // 2. 检查道侣币是否足够
  const totalCost = itemInfo.price * amount;
  const currentCoins = parseInt(await redis.hGet(relationshipKey, 'coins') || '0');
  if (currentCoins < totalCost) {
    return { success: false, message: `你们的道侣币不足，需要 ${totalCost}，当前拥有 ${currentCoins}。` };
  }

  // 3. 执行购买（原子操作）
  const newCoinValue = await redis.hIncrBy(relationshipKey, 'coins', -totalCost);
  // 检查扣款后是否为负，以防并发问题（虽然hIncrBy是原子的，但这是一个额外的保险）
  if (newCoinValue < 0) {
    // 回滚扣款
    await redis.hIncrBy(relationshipKey, 'coins', totalCost);
    return { success: false, message: '道侣币不足，请稍后再试。' };
  }

  // 4. 更新购买数量记录
  await redis.hIncrBy(limitKey, itemName, amount);

  // 5. 为双方发放物品
  const itemConfig = await foundthing(itemName); // 获取物品的完整信息，如class
  if (!itemConfig) {
    logger.error(`[姻缘堂] 致命错误：商店物品 [${itemName}] 在物品库中不存在！`);
    return { success: false, message: '系统错误：商品信息不存在，请联系管理员。' };
  }

  await Promise.all([
    DAL.updateNajieItem(userId, itemName, itemConfig.class, amount, itemConfig),
    DAL.updateNajieItem(partnerId, itemName, itemConfig.class, amount, itemConfig)
  ]);

  return {
    success: true,
    message: `购买成功！你们共同消耗了 ${totalCost} 道侣币，双方均获得了 [${itemName}] x ${amount}。`
  };
}

/**
 * 赠送礼物以增加好感度或亲密度
 * @param {string} giverId 赠送者ID
 * @param {string} receiverId 接收者ID
 * @param {string} itemName 礼物名称
 * @param {number} amount 数量
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function giveGift(giverId, receiverId, itemName, amount) {
  if (giverId == receiverId) {
    return { success: false, message: '道友何必自己赠予自己？' };
  }

  const gift = giftsConfig.find(g => g.name === itemName && g.class === '礼物');
  if (!gift) {
    return { success: false, message: `似乎没有名为 [${itemName}] 的礼物呢。` };
  }

  const userItemAmount = await DAL.getNajieItemAmount(giverId, itemName, '礼物');
  if (userItemAmount < amount) {
    return { success: false, message: `你的纳戒中没有足够的 [${itemName}]。` };
  }

  await DAL.updateNajieItem(giverId, itemName, '礼物', -amount);

  const valueChange = gift.value * amount;
  const relationshipKey = getRelationshipKey(giverId, receiverId);
  const receiverPlayerData = (await DAL.getAllPlayerData(receiverId))?.player;
  const receiverName = receiverPlayerData?.名号 || receiverId;

  // 判断双方是否为道侣
  const giverPartnerId = await getPartnerId(giverId);

  // --- 分支一：是道侣关系 ---
  if (giverPartnerId && giverPartnerId == receiverId) {
    const intimacyChange = Math.ceil(valueChange / 2); // 亲密度折半向上取整

    // 同时增加好感度和亲密度
    const [currentFavorability, currentIntimacy] = await Promise.all([
      redis.hIncrBy(relationshipKey, 'favorability', valueChange),
      redis.hIncrBy(relationshipKey, 'intimacy', intimacyChange)
    ]);

    // 检查是否升级
    const levelUpMsg = await checkAndApplyPartnerLevelUp(relationshipKey, giverId, receiverId);

    let finalMessage = `你将 [${itemName}]x${amount} 赠予了你的道侣 ${receiverName}，你们的亲密度增加了 ${intimacyChange}！\n当前亲密度：${currentIntimacy}`;
    if (levelUpMsg) {
      finalMessage += `\n${levelUpMsg}`; // 如果升级了，附带上升级信息
    }

    return { success: true, message: finalMessage };
  }
  // --- 分支二：不是道侣关系 ---
  else {
    const currentFavorability = await redis.hIncrBy(relationshipKey, 'favorability', valueChange);
    return {
      success: true,
      message: `你将 [${itemName}]x${amount} 赠予了 ${receiverName}，你们之间的好感度增加了 ${valueChange}！\n当前总好感度：${currentFavorability}`
    };
  }
}

/**
 * 检查并处理道侣等级提升
 * @param {string} relationshipKey 关系键
 * @param {string} userId1 玩家1
 * @param {string} userId2 玩家2
 * @returns {Promise<string|null>} 如果升级则返回升级贺词，否则返回null
 */
async function checkAndApplyPartnerLevelUp(relationshipKey, userId1, userId2) {
  const stats = await redis.hGetAll(relationshipKey);
  const currentLevel = parseInt(stats.level || '0');
  const currentIntimacy = parseInt(stats.intimacy || '0');

  const nextLevelInfo = partnerLevelsConfig.find(l => l.level === currentLevel + 1);

  // 如果没有下一级，或者亲密度未达到要求
  if (!nextLevelInfo || currentIntimacy < nextLevelInfo.intimacy_required) {
    return null;
  }

  // --- 执行升级 ---
  // 可能会有多级连升的情况，使用 while 循环处理
  let finalLevel = currentLevel;
  let totalCoinReward = 0;
  let nextLevelToCheck = partnerLevelsConfig.find(l => l.level === finalLevel + 1);

  while (nextLevelToCheck && currentIntimacy >= nextLevelToCheck.intimacy_required) {
    finalLevel = nextLevelToCheck.level;
    totalCoinReward += nextLevelToCheck.coin_reward;
    nextLevelToCheck = partnerLevelsConfig.find(l => l.level === finalLevel + 1);
  }

  // 如果等级有变化，才更新数据和发送消息
  if (finalLevel > currentLevel) {
    await redis.hSet(relationshipKey, 'level', finalLevel);
    await redis.hIncrBy(relationshipKey, 'coins', totalCoinReward);

    const finalLevelInfo = partnerLevelsConfig.find(l => l.level === finalLevel);

    // 构建并返回贺词
    let msg = `🎉[同心]恭喜！你们的情缘等级提升至【${finalLevelInfo.name} (Lv.${finalLevel})】！\n获得奖励：道侣币 x ${totalCoinReward}`;
    return msg;
  }

  return null;
}

/**
 * 获取道侣双方的详细信息以供渲染
 * @param {string} userId 发起指令的用户ID
 * @returns {Promise<{success: boolean, data?: object, message?: string}>}
 */
export async function getPartnerDetails(userId) {
  const partnerId = await getPartnerId(userId);
  if (!partnerId) {
    return { success: false, message: '你尚未拥有道侣，无法查看。' };
  }

  // 1. 获取双方玩家数据
  const userPlayerData = (await DAL.getAllPlayerData(userId))?.player;
  const partnerPlayerData = (await DAL.getAllPlayerData(partnerId))?.player;

  if (!userPlayerData || !partnerPlayerData) {
    return { success: false, message: '无法获取道侣信息，请稍后再试。' };
  }

  // 2. 获取共享关系数据
  const relationshipKey = getRelationshipKey(userId, partnerId);
  const relationshipStats = await redis.hGetAll(relationshipKey);
  const currentIntimacy = parseInt(relationshipStats.intimacy || '520');
  const currentLevel = parseInt(relationshipStats.level || '0');
  const currentCoins = parseInt(relationshipStats.coins || '0');

  // 3. 计算等级和进度条信息
  const currentLevelInfo = partnerLevelsConfig.find(l => l.level === currentLevel) || partnerLevelsConfig[0];
  const nextLevelInfo = partnerLevelsConfig.find(l => l.level === currentLevel + 1);

  let progress = {
    current: currentIntimacy,
    needed: '已满级',
    percentage: 100
  };

  if (nextLevelInfo) {
    const base = currentLevelInfo.intimacy_required;
    const target = nextLevelInfo.intimacy_required;
    const progressValue = currentIntimacy - base;
    const totalValue = target - base;
    progress.needed = target;
    progress.percentage = Math.min(100, (progressValue / totalValue) * 100);


  }

  let formattedDate = '';
  if (relationshipStats.marriage_date) {
    const date = new Date(relationshipStats.marriage_date);
    formattedDate = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  // 4. 组装最终数据
  const dataForRender = {
    user: {
      id: userId,
      name: userPlayerData.name
    },
    partner: {
      id: partnerId,
      name: partnerPlayerData.name
    },
    stats: {
      intimacy: currentIntimacy,
      level: currentLevel,
      levelName: currentLevelInfo.name,
      coins: currentCoins,
      marriage_date: formattedDate // 使用格式化后的日期
    },
    progress: progress
  };

  return { success: true, data: dataForRender };
}

/**
 * 获取玩家的道侣ID
 *
 */
export async function getPartnerId(userId) {
  return await redis.get(`XinghanXiuxian:partner:${userId}`);
}

/**
 * 发起求婚
 *
 */
export async function proposeToPartner(proposerId, receiverId) {
  if (proposerId == receiverId) return { success: false, message: '不能向自己求婚哦。' };

  const [proposerPartner, receiverPartner] = await Promise.all([
    getPartnerId(proposerId),
    getPartnerId(receiverId)
  ]);

  if (proposerPartner) return { success: false, message: '你已拥有道侣，请先断绝关系。' };
  if (receiverPartner) return { success: false, message: '对方已拥有道侶，你来晚了一步。' };

  const relationshipKey = getRelationshipKey(proposerId, receiverId);
  const favorability = await redis.hGet(relationshipKey, 'favorability') || 0;

  if (favorability < 520) {
    return { success: false, message: `你与TA的好感度尚未达到520，目前为【${favorability}】，继续努力吧！` };
  }

  const proposalKey = `XinghanXiuxian:proposal:${receiverId}`;
  await redis.set(proposalKey, proposerId, { EX: 300 });

  return { success: true, message: `已向对方传达你的心意，等待对方的回应...` };
}

/**
 * 回应求婚
 *
 */
export async function respondToProposal(receiverId, isAccepted) {
  const proposalKey = `XinghanXiuxian:proposal:${receiverId}`;
  const proposerId = await redis.get(proposalKey);

  if (!proposerId) return { success: false, message: '目前没有人向你求婚。' };

  await redis.del(proposalKey);

  if (!isAccepted) {
    return { success: true, proposerId, message: `你拒绝了对方的求婚。` };
  }

  const relationshipKey = getRelationshipKey(proposerId, receiverId);
  const favorability = parseInt(await redis.hGet(relationshipKey, 'favorability') || 520);

  const initialIntimacy = 520 + Math.ceil(Math.max(0, favorability - 520) / 2);

  // partnerLevelsConfig 现在是正确的数组，.find() 可以正常工作
  const initialLevelInfo = partnerLevelsConfig.find(l => l.level === 0);
  if (!initialLevelInfo) {
    logger.error('[仙侣系统] 严重错误：找不到 level 0 的道侣等级配置！');
    return { success: false, message: '系统配置错误，无法结为道侣。' };
  }

  await Promise.all([
    redis.set(`XinghanXiuxian:partner:${proposerId}`, receiverId),
    redis.set(`XinghanXiuxian:partner:${receiverId}`, proposerId)
  ]);

  await redis.hSet(relationshipKey, {
    'intimacy': initialIntimacy,
    'level': 0,
    'coins': initialLevelInfo.coin_reward,
    'marriage_date': new Date().toISOString()
  });

  return { success: true, proposerId, isAccepted: true, message: '恭喜你们结为仙侣，大道之路，携手同行！' };
}

/**
 * 断绝道侣关系
 *
 */
export async function breakUp(userId) {
  const partnerId = await getPartnerId(userId);
  if (!partnerId) return { success: false, message: '你尚未拥有道侣。' };

  const relationshipKey = getRelationshipKey(userId, partnerId);

  await Promise.all([
    redis.del(`XinghanXiuxian:partner:${userId}`),
    redis.del(`XinghanXiuxian:partner:${partnerId}`),
    redis.hDel(relationshipKey, ['intimacy',
      'level',
      'coins',
      'marriage_date'])
  ]);

  const currentFavorability = parseInt(await redis.hGet(relationshipKey, 'favorability') || 0);
  await redis.hSet(relationshipKey, 'favorability', Math.floor(currentFavorability / 2));

  return { success: true, partnerId, message: '仙路殊途，各自安好。' };
}