import * as DAL from '../api/data-access.js';
import { transaction_update } from '../api/data-access.js';
import { exist_najie_thing } from '../apps/Xiuxian/xiuxian.js';
import data from '../model/XiuxianData.js';

/**
 * 装备幻影牌面逻辑
 * @param {string} userId 用户ID
 * @param {string} cardName 牌面名称
 * @param {string} cardType 牌面类型 ('练气' 或 '装备')
 * @returns {Promise<boolean>}
 */
export async function equipPhantomCard(userId, cardName, cardType) {
  let result = { success: false, message: '装备失败，发生未知错误。' };

  const transactionSuccess = await transaction_update(userId, async (player) => {
    // 检查是否拥有该牌面
    let hasCard = await DAL.getNajieItemAmount(userId, cardName, '影幻牌面') > 0;
    if (!hasCard) {
      hasCard = await DAL.getNajieItemAmount(userId, cardName, '道具') > 0;
    }

    if (!hasCard) {
      result = { success: false, message: `你没有[${cardName}]这张牌面。` };
      return false; // 中止事务
    }

    // 查找牌面信息
    const cardInfo = data.yinghuanpaimian_list.find(item => item.name === cardName) || data.daoju_list.find(item => item.name === cardName);

    if (!cardInfo) {
      result = { success: false, message: `在配置中未找到[${cardName}]的牌面信息。` };
      return false; // 中止事务
    }
    
    // 装备牌面
    if (cardType === '练气') {
      player.练气皮肤 = cardName;
    } else {
      player.装备皮肤 = cardName;
    }
    
    // 设置成功信息
    result = { success: true, message: `成功装备${cardType}幻影牌面[${cardName}]` };
    return true; // 提交事务
  });

  // 如果事务本身因为冲突等原因失败，但逻辑判断是成功的，需要覆盖结果
  if (!transactionSuccess && result.success) {
    result = { success: false, message: '装备失败，数据写入时发生冲突，请重试。' };
  }
  
  return result;
}
/**
 * 查看幻影牌面列表
 * @param {string} cardType 牌面类型
 * @returns {Promise<{success: boolean, message?: string, cards?: Array}>}
 */
export async function getPhantomCardList(cardType) {
  let cards = [];

  if (cardType === '练气') {
    cards = data.daoju_list.filter(item => item.type === '幻影卡面_练气');
  } else if (cardType === '装备') {
    cards = data.yinghuanpaimian_list || [];
  }

  return {
    success: true,
    cards: cards
  };
}