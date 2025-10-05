import * as DAL from '../api/data-access.js';
import XiuxianData from '../model/XiuxianData.js';
import { loadItemConfig } from '../model/ConfigLoader.js';

const giftsConfig = XiuxianData.gift_list;
const partnerLevelsConfig = loadItemConfig('partner_levels.yaml');


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

/** * 赠送礼物以增加好感度
 *
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

  const favorabilityChange = gift.value * amount;
  const relationshipKey = getRelationshipKey(giverId, receiverId);
  const currentFavorability = await redis.hIncrBy(relationshipKey, 'favorability', favorabilityChange);

  const receiverPlayerData = (await DAL.getAllPlayerData(receiverId)).player;
  const receiverName = receiverPlayerData?.名号 || receiverId;

  return {
    success: true,
    message: `你将 [${itemName}]x${amount} 赠予了 ${receiverName}，你们之间的好感度增加了 ${favorabilityChange}！\n当前总好感度：${currentFavorability}`
  };
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