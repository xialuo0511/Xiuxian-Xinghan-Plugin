import * as DAL from '../api/data-access.js';
import XiuxianData from '../model/XiuxianData.js';

// 加载礼物配置
const giftsConfig = XiuxianData.gift_list;

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
 * 赠送礼物以增加好感度
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

  // 1. 查找礼物信息
  const gift = giftsConfig.find(g => g.name === itemName && g.class === '礼物');
  if (!gift) {
    return { success: false, message: `似乎没有名为 [${itemName}] 的礼物呢。` };
  }

  // 2. 获取赠送者完整数据，并从纳戒中检查礼物数量
  const giverData = await DAL.getAllPlayerData(giverId);
  if (!giverData || !giverData.najie) {
    return { success: false, message: '无法获取你的纳戒信息。' };
  }
  console.log(`玩家:${giverData}`);
  const najie = giverData.najie;
  const itemCategory = najie['礼物'];
  const userItem = itemCategory ? itemCategory[itemName] : undefined;
  console.log(`花篮:${userItem}`);
  console.log(`amount: ${amount}`);
  if (!userItem || userItem.amount < amount) {
    return { success: false, message: `你的纳戒中没有足够的 [${itemName}]。` };
  }

  // 3. 扣除赠送者的礼物
  await DAL.updateNajieItem(giverId, itemName, '礼物', -amount);

  // 4. 计算好感度/亲密度变化
  const favorabilityChange = gift.value * amount;

  // 5. 获取关系键并更新好感度
  const relationshipKey = getRelationshipKey(giverId, receiverId);
  const currentFavorability = await redis.hIncrBy(relationshipKey, 'favorability', favorabilityChange);

  // 获取接收者昵称用于回复
  const receiverPlayerData = (await DAL.getAllPlayerData(receiverId)).player;
  const receiverName = receiverPlayerData?.name || receiverId;

  return {
    success: true,
    message: `你将 [${itemName}]x${amount} 赠予了 ${receiverName}，你们之间的好感度增加了 ${favorabilityChange}！\n当前总好感度：${currentFavorability}`
  };
}