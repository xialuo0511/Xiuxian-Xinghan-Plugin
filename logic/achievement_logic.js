/**
 * 成就系统业务逻辑
 * @module logic/achievement_logic
 */

import * as DAL from '../api/data-access.js';
import { loadItemConfig } from '../model/ConfigLoader.js';

// 加载成就配置
const achievementsConfig = loadItemConfig('achievements.yaml');

// 稀有度名称和颜色映射
const RARITY_INFO = {
    1: { name: '普通', color: '#9e9e9e' },
    2: { name: '稀有', color: '#4caf50' },
    3: { name: '精良', color: '#2196f3' },
    4: { name: '史诗', color: '#9c27b0' },
    5: { name: '传说', color: '#ff9800' }
};

// 类别图标映射
const CATEGORY_ICONS = {
    '修炼': '🧘',
    '探索': '🗺️',
    '签到': '📅',
    '战斗': '⚔️',
    '财富': '💰'
};

/**
 * 获取成就配置
 * @param {string} achievementId 成就ID
 * @returns {object|null}
 */
export function getAchievementConfig(achievementId) {
    return achievementsConfig.find(a => a.id === achievementId) || null;
}

/**
 * 获取成就图鉴展示数据
 * @param {string} userId 玩家ID
 * @returns {Promise<object>}
 */
export async function getAchievementCodexData(userId) {
    const playerAchievements = await DAL.getPlayerAchievements(userId);
    const playerData = await DAL.getAllPlayerData(userId);

    // 按类别分组成就
    const categorizedAchievements = {};
    const categories = ['修炼', '探索', '签到', '战斗', '财富'];

    categories.forEach(cat => {
        categorizedAchievements[cat] = {
            name: cat,
            icon: CATEGORY_ICONS[cat],
            achievements: []
        };
    });

    achievementsConfig.forEach(achievement => {
        const isUnlocked = playerAchievements.unlocked.includes(achievement.id);
        const isClaimed = playerAchievements.claimedRewards.includes(achievement.id);
        const currentProgress = playerAchievements.progress[achievement.condition.type] || 0;
        const targetProgress = achievement.condition.value;

        const achievementData = {
            ...achievement,
            isUnlocked,
            isClaimed,
            currentProgress,
            targetProgress,
            progressPercent: Math.min(100, Math.floor((currentProgress / targetProgress) * 100)),
            rarityInfo: RARITY_INFO[achievement.rarity] || RARITY_INFO[1],
            canClaim: isUnlocked && !isClaimed
        };

        if (categorizedAchievements[achievement.category]) {
            categorizedAchievements[achievement.category].achievements.push(achievementData);
        }
    });

    // 统计信息
    const totalCount = achievementsConfig.length;
    const unlockedCount = playerAchievements.unlocked.length;
    const claimedCount = playerAchievements.claimedRewards.length;
    const canClaimCount = unlockedCount - claimedCount;

    return {
        categories: Object.values(categorizedAchievements),
        stats: {
            total: totalCount,
            unlocked: unlockedCount,
            claimed: claimedCount,
            canClaim: canClaimCount,
            progressPercent: Math.floor((unlockedCount / totalCount) * 100)
        },
        playerName: playerData?.player?.name || '道友'
    };
}

/**
 * 检查并解锁成就（核心触发函数）
 * @param {string} userId 玩家ID
 * @param {string} eventType 事件类型（如 signin_count, explore_count）
 * @param {number} eventValue 事件值（累计值或当前值）
 * @returns {Promise<Array>} 新解锁的成就列表
 */
export async function checkAndUnlockAchievements(userId, eventType, eventValue) {
    const playerAchievements = await DAL.getPlayerAchievements(userId);
    const newlyUnlocked = [];

    // 更新进度
    await DAL.setAchievementProgress(userId, eventType, eventValue);

    // 检查所有匹配该事件类型的成就
    for (const achievement of achievementsConfig) {
        if (achievement.condition.type !== eventType) continue;
        if (playerAchievements.unlocked.includes(achievement.id)) continue;

        // 检查是否达成条件
        if (eventValue >= achievement.condition.value) {
            const unlocked = await DAL.unlockAchievement(userId, achievement.id);
            if (unlocked) {
                newlyUnlocked.push(achievement);
            }
        }
    }

    return newlyUnlocked;
}

/**
 * 增量更新进度并检查成就
 * @param {string} userId 玩家ID
 * @param {string} progressKey 进度键
 * @param {number} increment 增加的值
 * @returns {Promise<Array>} 新解锁的成就列表
 */
export async function incrementProgressAndCheck(userId, progressKey, increment = 1) {
    const newValue = await DAL.updateAchievementProgress(userId, progressKey, increment);
    return await checkAndUnlockAchievements(userId, progressKey, newValue);
}

/**
 * 领取成就奖励
 * @param {string} userId 玩家ID
 * @param {string} achievementId 成就ID
 * @returns {Promise<{success: boolean, message: string, rewards?: object}>}
 */
export async function claimReward(userId, achievementId) {
    const achievement = getAchievementConfig(achievementId);
    if (!achievement) {
        return { success: false, message: '未知的成就ID。' };
    }

    const claimed = await DAL.claimAchievementReward(userId, achievementId);
    if (!claimed) {
        const playerAchievements = await DAL.getPlayerAchievements(userId);
        if (!playerAchievements.unlocked.includes(achievementId)) {
            return { success: false, message: '该成就尚未解锁。' };
        }
        return { success: false, message: '该成就奖励已领取。' };
    }

    // 发放奖励
    const rewards = achievement.rewards || {};
    await DAL.transaction_update(userId, (player, equipment, najie) => {
        if (rewards.灵石) {
            player.灵石 = (player.灵石 || 0) + rewards.灵石;
        }
        if (rewards.秘境之匙) {
            DAL.updateNajieSync(najie, '秘境之匙', '道具', rewards.秘境之匙);
        }
        // 可扩展更多奖励类型
        return true;
    });

    return {
        success: true,
        message: `成功领取【${achievement.name}】奖励！`,
        rewards: rewards
    };
}

/**
 * 一键领取所有可领取的成就奖励
 * @param {string} userId 玩家ID
 * @returns {Promise<{success: boolean, message: string, count: number, totalRewards: object}>}
 */
export async function claimAllRewards(userId) {
    const playerAchievements = await DAL.getPlayerAchievements(userId);
    const canClaimIds = playerAchievements.unlocked.filter(
        id => !playerAchievements.claimedRewards.includes(id)
    );

    if (canClaimIds.length === 0) {
        return { success: false, message: '暂无可领取的成就奖励。', count: 0, totalRewards: {} };
    }

    const totalRewards = { 灵石: 0, 秘境之匙: 0 };
    let claimedCount = 0;

    for (const achievementId of canClaimIds) {
        const result = await claimReward(userId, achievementId);
        if (result.success) {
            claimedCount++;
            if (result.rewards) {
                totalRewards.灵石 += (result.rewards.灵石 || 0);
                totalRewards.秘境之匙 += (result.rewards.秘境之匙 || 0);
            }
        }
    }

    return {
        success: true,
        message: `成功领取 ${claimedCount} 个成就奖励！`,
        count: claimedCount,
        totalRewards
    };
}

/**
 * 格式化新解锁成就的通知消息
 * @param {Array} achievements 新解锁的成就列表
 * @returns {string}
 */
export function formatUnlockNotification(achievements) {
    if (!achievements || achievements.length === 0) return '';

    const lines = achievements.map(a =>
        `🎉 成就解锁：【${a.name}】${a.icon}`
    );

    return lines.join('\n');
}
