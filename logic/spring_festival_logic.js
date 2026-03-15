/**
 * 2026马年春节活动逻辑模块
 * 提供活动相关的通用功能
 */

import * as DAL from '../api/data-access.js';
import { loadItemConfig } from '../model/ConfigLoader.js';

// 加载福袋/宝箱配置
let lootboxConfig = null;
try {
    lootboxConfig = loadItemConfig('spring_festival_lootbox.yaml');
} catch (err) {
    logger.warn('[春节活动] 福袋配置加载失败:', err.message);
}

// 活动时间配置
const ACTIVITY_CONFIG = {
    startTime: new Date('2026-02-02 00:00:00').getTime(),
    endTime: new Date('2026-03-08 23:59:59').getTime()
};

/**
 * 检查活动是否进行中
 * @returns {boolean}
 */
export function IsActivityActive() {
    const now = Date.now();
    return now >= ACTIVITY_CONFIG.startTime && now <= ACTIVITY_CONFIG.endTime;
}

/**
 * 根据权重随机抽取奖励
 * @param {Array} rewards 奖励池数组，每项包含 weight 属性
 * @returns {Object} 抽中的奖励项
 */
function WeightedRandom(rewards) {
    const totalWeight = rewards.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const reward of rewards) {
        random -= reward.weight;
        if (random <= 0) {
            return reward;
        }
    }
    // 兜底返回最后一项
    return rewards[rewards.length - 1];
}

/**
 * 打开福袋/宝箱
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称（如"马年福袋"）
 * @param {number} count 打开数量，默认1
 * @returns {Promise<{success: boolean, message: string, rewards?: Array}>}
 */
export async function OpenLootbox(userId, itemName, count = 1) {
    // 检查活动是否进行中
    if (!IsActivityActive()) {
        return { success: false, message: '新春活动已结束，无法打开福袋。' };
    }

    // 查找对应的宝箱配置
    if (!lootboxConfig) {
        return { success: false, message: '活动配置加载失败，请联系管理员。' };
    }

    // 根据物品名称查找配置
    let boxConfig = null;
    for (const key of Object.keys(lootboxConfig)) {
        if (lootboxConfig[key].name === itemName) {
            boxConfig = lootboxConfig[key];
            break;
        }
    }

    if (!boxConfig) {
        return { success: false, message: `未找到「${itemName}」的配置。` };
    }

    // 检查玩家是否拥有足够的福袋
    const ownedCount = await DAL.getNajieItemAmount(userId, itemName, boxConfig.class);


    if (ownedCount < count) {
        return { success: false, message: `你的「${itemName}」不足，当前拥有 ${ownedCount} 个。` };
    }

    // 扣除福袋
    await DAL.updateNajieItem(userId, itemName, boxConfig.class, -count);

    // 抽取奖励
    const obtainedRewards = [];
    for (let i = 0; i < count; i++) {
        const reward = WeightedRandom(boxConfig.rewards);
        obtainedRewards.push({
            name: reward.name,
            class: reward.class,
            amount: reward.amount,
            display: reward.display
        });
    }

    // 合并相同奖励
    const mergedRewards = {};
    for (const reward of obtainedRewards) {
        const key = `${reward.name}_${reward.class}`;
        if (mergedRewards[key]) {
            mergedRewards[key].amount += reward.amount;
        } else {
            mergedRewards[key] = { ...reward };
        }
    }

    // 发放奖励
    for (const reward of Object.values(mergedRewards)) {
        await DAL.updateNajieItem(userId, reward.name, reward.class, reward.amount);
    }

    // 构建结果消息
    const rewardList = Object.values(mergedRewards)
        .map(r => r.display || `${r.name}×${r.amount}`)
        .join('、');

    return {
        success: true,
        message: `🎊 打开「${itemName}」×${count}，获得：${rewardList}`,
        rewards: Object.values(mergedRewards)
    };
}

/**
 * 获取玩家活动签到数据
 * @param {string} userId 用户ID
 * @returns {Promise<Object>}
 */
export async function GetActivitySigninData(userId) {
    const activitySigninKey = `XinghanXiuxian:SpringFestival:2026:SignIn:${userId}`;

    const count = parseInt(await redis.hGet(activitySigninKey, 'count') || '0');
    const claimed = JSON.parse(await redis.hGet(activitySigninKey, 'claimed') || '[]');
    const lastDate = await redis.hGet(activitySigninKey, 'last_date');

    return {
        count,
        claimed,
        lastDate,
        isActive: IsActivityActive()
    };
}
