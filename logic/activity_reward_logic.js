import * as DAL from '../api/data-access.js';
import * as SkinLogic from './skin_logic.js';
import data from '../model/XiuxianData.js';

/**
 * 奖励 amount 规范化：
 * - 可解析为数字且不为 0：按输入值发放
 * - 其他情况：默认按 1 发放
 */
function normalizeAmount(amount) {
  const parsed = Number(amount);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : 1;
}

/**
 * 重复奖励补偿字段兼容：
 * - duplicate_compensation（yaml 常用蛇形命名）
 * - duplicateCompensation（js 常用驼峰命名）
 */
function resolveDuplicateCompensation(reward) {
  return reward?.duplicate_compensation || reward?.duplicateCompensation || null;
}

function existsInList(list, itemName) {
  return Array.isArray(list) && list.some(item => item?.name === itemName);
}

/**
 * 资源奖励发放（直接写玩家主属性）
 * reward.name 枚举：
 * - 灵石
 * - 修为
 * - 血气
 */
async function grantResource(userId, rewardName, amount) {
  const supportedFields = new Set(['灵石', '修为', '血气']);
  if (!supportedFields.has(rewardName)) {
    return {
      success: false,
      granted: [],
      messages: [`不支持的资源奖励类型：${rewardName}`]
    };
  }

  const success = await DAL.transaction_update(userId, (player) => {
    player[rewardName] = (player[rewardName] || 0) + amount;
  });

  if (!success) {
    return {
      success: false,
      granted: [],
      messages: [`资源奖励发放失败：${rewardName}`]
    };
  }

  return {
    success: true,
    granted: [{ name: rewardName, class: '资源', amount }],
    messages: []
  };
}

/**
 * 称号奖励发放：
 * - 写入 player.all_titles
 * - 已拥有则不重复写入
 */
async function grantTitle(userId, titleName) {
  let isNewTitle = false;
  const success = await DAL.transaction_update(userId, (player) => {
    if (!Array.isArray(player.all_titles)) {
      player.all_titles = [];
    }
    if (!player.all_titles.includes(titleName)) {
      player.all_titles.push(titleName);
      isNewTitle = true;
    }
  });

  if (!success) {
    return {
      success: false,
      granted: [],
      messages: [`称号奖励发放失败：${titleName}`]
    };
  }

  if (!isNewTitle) {
    return {
      success: true,
      granted: [],
      messages: []
    };
  }

  return {
    success: true,
    granted: [{ name: `称号「${titleName}」`, class: '称号', amount: 1 }],
    messages: []
  };
}

/**
 * 皮肤奖励发放：
 * - 支持通过 skinId / id / name 解析目标皮肤
 * - 已拥有时可按配置自动走补偿奖励
 */
async function grantSkin(userId, reward, allowDuplicateCompensation) {
  const source = reward.skinId || reward.id || reward.name;
  let skin = SkinLogic.GetSkinConfig(source);
  if (!skin) {
    skin = SkinLogic.FindSkinByName(source);
  }
  if (!skin) {
    return {
      success: false,
      granted: [],
      messages: [`皮肤奖励配置无效：${source}`]
    };
  }

  const grantResult = await SkinLogic.GrantSkin(userId, skin.id);
  if (grantResult.success) {
    return {
      success: true,
      granted: [{ name: `皮肤「${skin.name}」`, class: '皮肤', amount: 1 }],
      messages: []
    };
  }

  const compensation = resolveDuplicateCompensation(reward);
  if (!allowDuplicateCompensation || !compensation || !String(grantResult.message || '').includes('已拥有')) {
    return {
      success: false,
      granted: [],
      messages: [grantResult.message || `皮肤奖励发放失败：${skin.name}`]
    };
  }

  const compensationResult = await grantActivityReward(userId, compensation, {
    allowDuplicateCompensation: false
  });

  return {
    success: compensationResult.success,
    granted: compensationResult.granted,
    messages: [`已拥有皮肤「${skin.name}」，已自动发放补偿奖励。`, ...compensationResult.messages]
  };
}

/**
 * 通用活动奖励发放器
 * reward.class 枚举：
 * - 称号：写入 player.all_titles
 * - 皮肤：写入 player['拥有皮肤']
 * - 资源：直接写玩家主属性（灵石/修为/血气）
 * - 其他值（如 道具/活动/丹药/材料...）：按纳戒物品处理
 *
 * options 枚举：
 * - allowDuplicateCompensation: 是否允许“重复奖励 -> 补偿奖励”
 */
export async function grantActivityReward(userId, reward, options = {}) {
  const allowDuplicateCompensation = options.allowDuplicateCompensation !== false;
  const rewardClass = reward?.class;
  const amount = normalizeAmount(reward?.amount);

  if (!reward || !rewardClass || !reward.name) {
    return {
      success: false,
      granted: [],
      messages: ['奖励配置缺失 name/class 字段']
    };
  }

  if (rewardClass === '称号') {
    return grantTitle(userId, reward.name);
  }

  if (rewardClass === '皮肤') {
    return grantSkin(userId, reward, allowDuplicateCompensation);
  }

  if (rewardClass === '资源') {
    return grantResource(userId, reward.name, amount);
  }

  let finalClass = rewardClass;
  let success = await DAL.updateNajieItem(userId, reward.name, finalClass, amount, reward.pinji || null);

  // 容错：配置把丹药误写成道具时，自动回退到丹药类再试一次。
  if (!success && finalClass === '道具' && existsInList(data?.danyao_list, reward.name)) {
    finalClass = '丹药';
    success = await DAL.updateNajieItem(userId, reward.name, finalClass, amount, reward.pinji || null);
  }

  if (!success) {
    return {
      success: false,
      granted: [],
      messages: [`物品奖励发放失败：${reward.name}（${rewardClass}）`]
    };
  }

  return {
    success: true,
    granted: [{ name: reward.name, class: finalClass, amount }],
    messages: []
  };
}
