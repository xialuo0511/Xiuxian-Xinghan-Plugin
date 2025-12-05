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

  // 使用同步回调，因为所有操作都是针对传入的js对象
  const transactionSuccess = await transaction_update(userId, (player, equipment, najie) => {
    
    // 1. 查找物品所在的分类和索引
    let itemClass = null;
    let itemIndex = -1;
    let categoryArray = null;

    const potentialClasses = ['影幻牌面', '道具'];
    for (const cls of potentialClasses) {
      if (najie[cls] && Array.isArray(najie[cls])) {
        itemIndex = najie[cls].findIndex(item => item.name === cardName);
        if (itemIndex !== -1) {
          itemClass = cls;
          categoryArray = najie[cls];
          break;
        }
      }
    }

    // 2. 如果找不到，中止事务
    if (!itemClass) {
      result = { success: false, message: `你没有[${cardName}]这张牌面。` };
      return false;
    }

    // 3. 查找牌面元数据
    const cardInfo = data.yinghuanpaimian_list?.find(item => item.name === cardName) || data.daoju_list?.find(item => item.name === cardName);
    if (!cardInfo) {
      result = { success: false, message: `在配置中未找到[${cardName}]的牌面信息。` };
      return false;
    }
    
    // 4. 消耗物品 (关键步骤)
    if (categoryArray[itemIndex].数量 > 1) {
      categoryArray[itemIndex].数量 -= 1;
    } else {
      categoryArray.splice(itemIndex, 1);
    }

    // 5. 装备皮肤
    if (cardType === '练气') {
      player.练气皮肤 = cardInfo.id;
    } else {
      player.装备皮肤 = cardInfo.id;
    }
    
    // 6. 设置成功信息
    result = { success: true, message: `成功消耗并装备${cardType}幻影[${cardInfo.name}]` };
    return true; // 提交对 player 和 najie 的所有更改
  });

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
    cards = data.kamian || [];
  }

  return {
    success: true,
    cards: cards
  };
}