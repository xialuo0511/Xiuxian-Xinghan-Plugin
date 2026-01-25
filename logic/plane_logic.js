/**
 * 位面系统业务逻辑
 * @module logic/plane_logic
 */

import * as DAL from '../api/data-access.js';
import { loadItemConfig } from '../model/ConfigLoader.js';

// 加载位面配置
const planesConfig = loadItemConfig('planes.yaml');

// 传送冷却时间（毫秒）
const TELEPORT_COOLDOWN = 60 * 60 * 1000; // 1小时

/**
 * 获取位面配置
 * @param {string} planeId 位面ID
 * @returns {object|null}
 */
export function getPlaneConfig(planeId) {
    return planesConfig.find(p => p.id === planeId) || null;
}

/**
 * 通过名称获取位面配置
 * @param {string} planeName 位面名称
 * @returns {object|null}
 */
export function getPlaneConfigByName(planeName) {
    return planesConfig.find(p => p.name === planeName) || null;
}

/**
 * 获取所有位面配置
 * @returns {Array}
 */
export function getAllPlanes() {
    return planesConfig;
}

/**
 * 获取位面展示数据
 * @param {string} userId 玩家ID
 * @returns {Promise<object>}
 */
export async function getPlaneDisplayData(userId) {
    const planeData = await DAL.getPlayerPlaneData(userId);
    const playerData = await DAL.getAllPlayerData(userId);
    const playerLevel = playerData?.player?.mijinglevel_id || 1;

    const currentPlane = getPlaneConfig(planeData.currentPlane);

    const planesDisplay = planesConfig.map(plane => {
        const isUnlocked = planeData.unlockedPlanes.includes(plane.id);
        const isCurrent = planeData.currentPlane === plane.id;
        const progress = planeData.planeProgress[plane.id] || { stage: 0, currency: 0 };

        // 获取当前阶段名称
        let currentStageName = '未进入';
        if (progress.stage > 0 && plane.stages && plane.stages.length > 0) {
            const stage = plane.stages.find(s => s.id === progress.stage);
            currentStageName = stage ? stage.name : '未知';
        }

        // 检查解锁条件
        let canUnlock = false;
        let unlockHint = '';
        if (!isUnlocked && plane.unlockCondition) {
            if (plane.unlockCondition.type === 'default') {
                canUnlock = true;
            } else if (plane.unlockCondition.type === 'level_and_item') {
                const meetsLevel = playerLevel >= plane.unlockCondition.minLevel;
                unlockHint = `需要境界≥${plane.unlockCondition.minLevel}级 + ${plane.unlockCondition.item}×1`;
                canUnlock = meetsLevel; // 物品检查在实际传送时进行
            }
        }

        return {
            ...plane,
            isUnlocked,
            isCurrent,
            progress,
            currentStageName,
            canUnlock,
            unlockHint
        };
    });

    return {
        currentPlane: currentPlane ? {
            ...currentPlane,
            progress: planeData.planeProgress[currentPlane.id] || { stage: 1, currency: 0 }
        } : null,
        planes: planesDisplay,
        lastTeleport: planeData.lastTeleport,
        canTeleport: Date.now() - planeData.lastTeleport >= TELEPORT_COOLDOWN,
        cooldownRemaining: Math.max(0, TELEPORT_COOLDOWN - (Date.now() - planeData.lastTeleport)),
        playerName: playerData?.player?.名号 || '道友'
    };
}

/**
 * 尝试传送到指定位面
 * @param {string} userId 玩家ID
 * @param {string} planeName 位面名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function tryTeleport(userId, planeName) {
    const plane = getPlaneConfigByName(planeName);
    if (!plane) {
        return { success: false, message: `未找到名为【${planeName}】的位面。` };
    }

    const planeData = await DAL.getPlayerPlaneData(userId);
    const playerData = await DAL.getAllPlayerData(userId);

    // 检查是否在当前位面
    if (planeData.currentPlane === plane.id) {
        return { success: false, message: `你已经在【${planeName}】了。` };
    }

    // 检查冷却
    const cooldownRemaining = TELEPORT_COOLDOWN - (Date.now() - planeData.lastTeleport);
    if (cooldownRemaining > 0) {
        const minutes = Math.ceil(cooldownRemaining / 60000);
        return { success: false, message: `传送阵尚在冷却中，还需等待${minutes}分钟。` };
    }

    // 检查是否已解锁
    if (!planeData.unlockedPlanes.includes(plane.id)) {
        // 尝试解锁
        const unlockResult = await tryUnlockPlane(userId, plane.id);
        if (!unlockResult.success) {
            return unlockResult;
        }
    }

    // 执行传送
    await DAL.teleportToPlane(userId, plane.id);

    return {
        success: true,
        message: `传送成功！你已抵达【${plane.icon} ${plane.name}】\n${plane.desc}`
    };
}

/**
 * 尝试解锁位面
 * @param {string} userId 玩家ID
 * @param {string} planeId 位面ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function tryUnlockPlane(userId, planeId) {
    const plane = getPlaneConfig(planeId);
    if (!plane) {
        return { success: false, message: '未知的位面。' };
    }

    const playerData = await DAL.getAllPlayerData(userId);
    const playerLevel = playerData?.player?.mijinglevel_id || 1;

    // 检查解锁条件
    if (plane.unlockCondition.type === 'default') {
        await DAL.unlockPlane(userId, planeId);
        return { success: true, message: '' };
    }

    if (plane.unlockCondition.type === 'level_and_item') {
        // 检查境界
        if (playerLevel < plane.unlockCondition.minLevel) {
            return {
                success: false,
                message: `境界不足！需要达到${plane.unlockCondition.minLevel}级才能进入【${plane.name}】。`
            };
        }

        // 检查道具（星瀚镜）
        const itemName = plane.unlockCondition.item;
        const itemAmount = await DAL.getNajieItemAmount(userId, itemName, '道具');
        if (!itemAmount || itemAmount <= 0) {
            return {
                success: false,
                message: `缺少道具【${itemName}】！需要消耗1个【${itemName}】才能首次进入【${plane.name}】。`
            };
        }

        // 消耗道具并解锁
        await DAL.updateNajieItem(userId, itemName, '道具', -1);
        await DAL.unlockPlane(userId, planeId);
        return { success: true, message: `消耗【${itemName}】×1，成功解锁【${plane.name}】！` };
    }

    return { success: false, message: '未知的解锁条件。' };
}

/**
 * 格式化冷却时间
 * @param {number} ms 毫秒
 * @returns {string}
 */
export function formatCooldown(ms) {
    if (ms <= 0) return '可传送';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    if (minutes > 0) {
        return `${minutes}分${seconds}秒`;
    }
    return `${seconds}秒`;
}
