import * as DAL from '../api/data-access.js';
import { loadItemConfig } from '../model/ConfigLoader.js';
import { foundthing } from '../apps/Xiuxian/xiuxian.js';

// 加载兑换码配置
const allRedeemCodes = loadItemConfig('redeem_codes.yaml');

/**
 * 【升级版】兑换码兑换逻辑，支持白名单
 * @param {string} userId 玩家ID
 * @param {string} code 玩家输入的兑换码
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function redeemCode(userId, code) {
  // 1. 查找兑换码是否存在
  const codeInfo = allRedeemCodes.find(c => c.code === code);
  if (!codeInfo) {
    return { success: false, message: '无效的兑换码。' };
  }

  // 2. 检查白名单
  if (codeInfo.whitelist && Array.isArray(codeInfo.whitelist)) {
    if (!codeInfo.whitelist.includes(Number(userId))) {
      return { success: false, message: '抱歉，你没有资格兑换这个专属兑换码。' };
    }
  }

  // 2.1 检查有效时间
  const now = new Date();
  if (codeInfo.startTime) {
    const startTime = new Date(codeInfo.startTime);
    if (now < startTime) {
      return { success: false, message: '该兑换码尚未生效。' };
    }
  }
  if (codeInfo.endTime) {
    const endTime = new Date(codeInfo.endTime);
    if (now > endTime) {
      return { success: false, message: '该兑换码已过期。' };
    }
  }


  // 3. 检查玩家是否已使用过此兑换码 (逻辑不变)
  const usedCodesKey = `XinghanXiuxian:used_redeem_codes:${userId}`;
  const hasUsed = await redis.sIsMember(usedCodesKey, code);
  if (hasUsed) {
    return { success: false, message: '你已经使用过这个兑换码了。' };
  }

  // 4. 发放奖励 (逻辑不变)
  let rewardMessages = [];
  for (const reward of codeInfo.rewards) {
    const itemTemplate = await foundthing(reward.name);
    if (itemTemplate) {
      await DAL.updateNajieItem(userId, reward.name, reward.class, reward.amount, itemTemplate);
      rewardMessages.push(`【${reward.name}】x${reward.amount}`);
    } else {
      logger.warn(`[兑换码] 找不到奖励物品 ${reward.name} 的定义，跳过发放。`);
    }
  }

  // 5. 标记为已使用 (逻辑不变)
  await redis.sAdd(usedCodesKey, code);

  return {
    success: true,
    message: `兑换成功！\n你获得了：${rewardMessages.join('，')}`
  };
}