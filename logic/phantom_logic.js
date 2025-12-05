import * as DAL from '../api/data-access.js';
import { transaction_update } from '../api/data-access.js';
import { exist_najie_thing } from '../apps/Xiuxian/xiuxian.js';
import data from '../model/XiuxianData.js';

/**
 * 装备幻影牌面逻辑
 * @param {string} userId 用户ID
 * @param {string} cardName 牌面名称
 * @param {string} cardType 牌面类型 ('练气' 或 '装备')
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function equipPhantomCard(userId, cardName, cardType) {
  return await transaction_update(userId, async (playerData) => {
    const { player, najie } = playerData;

    // 检查是否拥有该牌面
    const hasCard = await exist_najie_thing(userId, cardName, '道具');
    if (!hasCard) {
      return {
        success: false,
        message: `你没有[${cardName}]这张牌面`
      };
    }

    // 查找牌面信息
    let cardInfo;
    if (cardType === '练气') {
      cardInfo = data.daoju_list.find(item =>
        item.name === cardName && item.type === '幻影卡面_练气'
      );
    } else if (cardType === '装备') {
      cardInfo = data.yinghuanpaimian_list.find(item =>
        item.name === cardName && item.type === '幻影卡面_装备'
      );
    }

    if (!cardInfo) {
      return {
        success: false,
        message: `未找到[${cardName}]的牌面信息`
      };
    }

    // 装备牌面
    if (cardType === '练气') {
      player.练气皮肤 = cardName;
    } else {
      player.装备皮肤 = cardName;
    }

    return {
      success: true,
      message: `成功装备${cardType}幻影牌面[${cardName}]`
    };
  });
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