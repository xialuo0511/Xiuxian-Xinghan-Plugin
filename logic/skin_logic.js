import * as DAL from '../api/data-access.js';
import { loadItemConfig } from '../model/ConfigLoader.js';

// 加载皮肤配置
const allSkins = loadItemConfig('skins.yaml');

// 默认皮肤ID
const DEFAULT_SKIN_ID = 'default';

/**
 * 获取所有皮肤配置
 * @returns {Array}
 */
export function GetAllSkins() {
    return allSkins;
}

/**
 * 获取指定皮肤配置
 * @param {string} skinId 皮肤ID
 * @returns {object|null}
 */
export function GetSkinConfig(skinId) {
    return allSkins.find(s => s.id === skinId) || null;
}

/**
 * 获取玩家当前使用的皮肤配置
 * @param {string} userId 玩家ID
 * @returns {Promise<object>}
 */
export async function GetPlayerCurrentSkin(userId) {
    const playerData = await DAL.getAllPlayerData(userId);
    if (!playerData || !playerData.player) {
        return GetSkinConfig(DEFAULT_SKIN_ID);
    }

    const skinId = playerData.player['当前皮肤'] || DEFAULT_SKIN_ID;
    return GetSkinConfig(skinId) || GetSkinConfig(DEFAULT_SKIN_ID);
}

/**
 * 获取玩家拥有的皮肤列表
 * @param {string} userId 玩家ID
 * @returns {Promise<{ownedSkins: Array, currentSkinId: string}>}
 */
export async function GetPlayerSkins(userId) {
    const playerData = await DAL.getAllPlayerData(userId);
    if (!playerData || !playerData.player) {
        return {
            ownedSkins: [GetSkinConfig(DEFAULT_SKIN_ID)],
            currentSkinId: DEFAULT_SKIN_ID
        };
    }

    const player = playerData.player;
    const ownedSkinIds = player['拥有皮肤'] || [DEFAULT_SKIN_ID];
    const currentSkinId = player['当前皮肤'] || DEFAULT_SKIN_ID;

    // 确保默认皮肤始终在列表中
    if (!ownedSkinIds.includes(DEFAULT_SKIN_ID)) {
        ownedSkinIds.unshift(DEFAULT_SKIN_ID);
    }

    const ownedSkins = ownedSkinIds
        .map(id => GetSkinConfig(id))
        .filter(s => s !== null);

    return {
        ownedSkins,
        currentSkinId
    };
}

/**
 * 装备皮肤
 * @param {string} userId 玩家ID
 * @param {string} skinId 皮肤ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function EquipSkin(userId, skinId) {
    const skinConfig = GetSkinConfig(skinId);
    if (!skinConfig) {
        return { success: false, message: `不存在名为该皮肤。` };
    }

    let result = { success: false, message: '操作失败' };

    await DAL.transaction_update(userId, (player, equipment, najie) => {
        const ownedSkins = player['拥有皮肤'] || [DEFAULT_SKIN_ID];

        // 检查是否拥有该皮肤（默认皮肤所有人都有）
        if (skinId !== DEFAULT_SKIN_ID && !ownedSkins.includes(skinId)) {
            result = { success: false, message: `你还没有获得【${skinConfig.name}】皮肤。` };
            return false;
        }

        player['当前皮肤'] = skinId;
        result = { success: true, message: `成功装备皮肤【${skinConfig.name}】！` };
        return true;
    });

    return result;
}

/**
 * 发放皮肤给玩家
 * @param {string} userId 玩家ID
 * @param {string} skinId 皮肤ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function GrantSkin(userId, skinId) {
    const skinConfig = GetSkinConfig(skinId);
    if (!skinConfig) {
        return { success: false, message: `不存在ID为 [${skinId}] 的皮肤。` };
    }

    let result = { success: false, message: '操作失败' };

    await DAL.transaction_update(userId, (player, equipment, najie) => {
        if (!player['拥有皮肤']) {
            player['拥有皮肤'] = [DEFAULT_SKIN_ID];
        }

        if (player['拥有皮肤'].includes(skinId)) {
            result = { success: false, message: `该玩家已拥有【${skinConfig.name}】皮肤。` };
            return false;
        }

        player['拥有皮肤'].push(skinId);
        result = { success: true, message: `成功发放皮肤【${skinConfig.name}】！` };
        return true;
    });

    return result;
}

/**
 * 根据皮肤名称查找皮肤
 * @param {string} skinName 皮肤名称
 * @returns {object|null}
 */
export function FindSkinByName(skinName) {
    return allSkins.find(s => s.name === skinName) || null;
}

/**
 * 生成皮肤CSS样式字符串
 * @param {object} skinConfig 皮肤配置
 * @returns {string}
 */
export function GenerateSkinCss(skinConfig) {
    if (!skinConfig) return '';

    const colors = skinConfig.colors || {};
    const styles = skinConfig.styles || {};

    return `
    :root {
      --skin-primary: ${colors.primary || '#6a3906'};
      --skin-secondary: ${colors.secondary || '#a88763'};
      --skin-background: ${colors.background || 'rgba(253, 250, 245, 0.88)'};
      --skin-text: ${colors.text || '#4a2c1a'};
      --skin-border: ${colors.border || '#d2b48c'};
      --skin-accent: ${colors.accent || '#7a5533'};
      --skin-progress-hp: ${colors.progressHp || 'linear-gradient(to right, #e57373, #d32f2f)'};
      --skin-progress-mana: ${colors.progressMana || 'linear-gradient(to right, #64B5F6, #1976D2)'};
    }
  `;
}
