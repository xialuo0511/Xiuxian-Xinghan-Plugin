import * as DAL from '../api/data-access.js';
import { transaction_update } from '../api/data-access.js';
import { foundthing, exist_najie_thing, Add_najie_thing } from '../apps/Xiuxian/xiuxian.js';
import data from '../model/XiuxianData.js';

/**
 * 装备物品逻辑
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function equipItem(userId, itemName) {
  try {
    const itemInfo = await foundthing(itemName);
    if (!itemInfo || itemInfo.class !== '装备') {
      return {
        success: false,
        message: `[${itemName}]不是装备或不存在`
      };
    }

    // 检查玩家是否拥有该装备
    const ownedQuantity = await exist_najie_thing(userId, itemName, '装备');
    if (!ownedQuantity) {
      return {
        success: false,
        message: `你没有[${itemName}]这件装备`
      };
    }

    const playerData = await DAL.getAllPlayerData(userId);
    const player = playerData.player;
    const equipment = playerData.equipment;
    const najie = playerData.najie;

    // 检查装备部位
    const equipmentSlot = itemInfo.部位;
    if (!equipmentSlot) {
      return {
        success: false,
        message: `[${itemName}]没有指定装备部位`
      };
    }

    // 如果已有装备，先卸下
    const updatedEquipment = { ...equipment };
    const updatedNajie = { ...najie };

    if (equipment[equipmentSlot]) {
      // 将当前装备放回纳戒
      await Add_najie_thing(userId, equipment[equipmentSlot].name, '装备', 1);
    }

    // 从纳戒中移除要装备的物品
    const itemKey = Object.keys(najie).find(key =>
      najie[key].name === itemName && najie[key].class === '装备'
    );

    if (updatedNajie[itemKey].数量 > 1) {
      updatedNajie[itemKey].数量 -= 1;
    } else {
      delete updatedNajie[itemKey];
    }

    // 装备新物品
    updatedEquipment[equipmentSlot] = {
      name: itemName,
      ...itemInfo
    };

    // 更新数据
    const updates = {
      equipment: updatedEquipment,
      najie: updatedNajie
    };

    await transaction_update(userId, updates);

    return {
      success: true,
      message: `成功装备[${itemName}]`
    };
  } catch (error) {
    console.error('装备物品失败:', error);
    return {
      success: false,
      message: '装备失败，请稍后重试'
    };
  }
}

/**
 * 消耗丹药或食材，并为玩家应用其效果
 * @param {string} userId 玩家ID
 * @param {string} itemName 物品名称
 * @param {number} quantity 消耗数量
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function consumeItem(userId, itemName, quantity = 1) {
  // 1. 查找物品的定义
  const itemInfo = await foundthing(itemName);
  if (!itemInfo) {
    return { success: false, message: `这方天地似乎没有名为【${itemName}】的物品。` };
  }

  // 2. 检查物品是否为可服用的丹药或食材
  if (itemInfo.class !== '丹药' && itemInfo.class !== '食材') {
    return { success: false, message: `【${itemName}】似乎不能直接服用。` };
  }

  // 3. 检查玩家纳戒中是否有足够的物品
  const allData = await DAL.getAllPlayerData(userId);
  if (!allData || !allData.najie) {
    return { success: false, message: '无法获取你的纳戒信息。' };
  }

  const categoryArray = allData.najie[itemInfo.class];
  const itemInNajie = Array.isArray(categoryArray) ? categoryArray.find(i => i.name === itemName) : null;

  if (!itemInNajie || Number(itemInNajie.数量) < quantity) {
    return { success: false, message: `你的纳戒中没有足够的【${itemName}】。` };
  }

  // 4. 在事务中应用效果并扣除物品
  const transactionSuccess = await DAL.transaction_update(userId, (player, equipment, najie) => {

    // 在事务内部再次查找物品以进行修改
    const categoryArray = najie[itemInfo.class];
    if (!Array.isArray(categoryArray)) return false; // 安全检查
    const itemIndex = categoryArray.findIndex(i => i.name === itemName);

    // 再次确认数量，防止并发问题
    if (itemIndex === -1 || Number(categoryArray[itemIndex].数量) < quantity) {
      return false;
    }

    // --- 应用物品效果 ---
    let effectApplied = false;
    if (itemInfo.class === '丹药') {
      if (itemInfo.exp > 0) {
        player.修为 = (Number(player.修为) || 0) + (itemInfo.exp * quantity);
        effectApplied = true;
      }
      if (itemInfo.xueqi > 0) {
        player.血气 = (Number(player.血气) || 0) + (itemInfo.xueqi * quantity);
        effectApplied = true;
      }
      if (itemInfo.HP > 0) {
        player.当前血量 = Math.min(player.血量上限, (Number(player.当前血量) || 0) + (itemInfo.HP * quantity));
        effectApplied = true;
      }
    } else if (itemInfo.class === '食材') {
      if (typeof itemInfo.加成 !== 'undefined') {
        // 假设玩家数据中有 “饱食度” 字段
        player.饱食度 = (Number(player.饱食度) || 0) + (itemInfo.加成 * quantity);
        effectApplied = true;
      }
    }

    if (!effectApplied) {
      logger.warn(`[物品服用] 物品【${itemName}】没有可识别的效果。`);
      return { success: false, message: `服用【${itemName}】失败，该物品暂不支持服用，请留意后续更新。` };
    }

    // --- 扣除物品 ---
    categoryArray[itemIndex].数量 = Number(categoryArray[itemIndex].数量) - quantity;
    if (categoryArray[itemIndex].数量 <= 0) {
      categoryArray.splice(itemIndex, 1); // 从数组中移除
    }

    return true; // 事务成功
  });

  if (transactionSuccess) {
    return { success: true, message: `成功服用了【${itemName}】x ${quantity}。` };
  } else {
    // 事务失败通常是因为并发冲突或数量不足
    return { success: false, message: `服用【${itemName}】失败，可能是数量不足或道心不稳，请稍后再试。` };
  }
}

/**
 * 学习功法逻辑
 * @param {string} userId 用户ID
 * @param {string} itemName 功法名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function learnSkill(userId, itemName) {
  try {
    const itemInfo = await foundthing(itemName);
    if (!itemInfo || itemInfo.class !== '功法') {
      return {
        success: false,
        message: `[${itemName}]不是功法或不存在`
      };
    }

    // 检查玩家是否拥有该功法
    const ownedQuantity = await exist_najie_thing(userId, itemName, '功法');
    if (!ownedQuantity) {
      return {
        success: false,
        message: `你没有[${itemName}]这本功法`
      };
    }

    const playerData = await DAL.getAllPlayerData(userId);
    const player = playerData.player;
    const najie = playerData.najie;
    const skills = playerData.skills || {};

    // 检查是否已经学会
    if (skills[itemName]) {
      return {
        success: false,
        message: `你已经学会了[${itemName}]`
      };
    }

    // 检查学习条件（如境界要求等）
    if (itemInfo.学习条件) {
      // TODO: 实现学习条件检查
    }

    // 学习功法
    const updatedSkills = {
      ...skills,
      [itemName]: {
        name: itemName,
        level: 1,
        ...itemInfo
      }
    };

    // 从纳戒中移除功法
    const updatedNajie = { ...najie };
    const itemKey = Object.keys(najie).find(key =>
      najie[key].name === itemName && najie[key].class === '功法'
    );

    if (updatedNajie[itemKey].数量 > 1) {
      updatedNajie[itemKey].数量 -= 1;
    } else {
      delete updatedNajie[itemKey];
    }

    // 更新数据
    const updates = {
      skills: updatedSkills,
      najie: updatedNajie
    };

    await transaction_update(userId, updates);

    return {
      success: true,
      message: `成功学会[${itemName}]`
    };
  } catch (error) {
    console.error('学习功法失败:', error);
    return {
      success: false,
      message: '学习失败，请稍后重试'
    };
  }
}