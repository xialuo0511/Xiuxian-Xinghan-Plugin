import * as DAL from '../api/data-access.js';
import * as SkinLogic from './skin_logic.js';

function normalizeAmount(amount) {
  const parsed = Number(amount);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : 1;
}

function resolveDuplicateCompensation(reward) {
  return reward?.duplicate_compensation || reward?.duplicateCompensation || null;
}

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
 * 支持：物品、称号、皮肤、资源（灵石/修为/血气）
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

  const success = await DAL.updateNajieItem(userId, reward.name, rewardClass, amount, reward.pinji || null);
  if (!success) {
    return {
      success: false,
      granted: [],
      messages: [`物品奖励发放失败：${reward.name}`]
    };
  }

  return {
    success: true,
    granted: [{ name: reward.name, class: rewardClass, amount }],
    messages: []
  };
}
