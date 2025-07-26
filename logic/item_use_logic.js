import * as DAL from '../api/data-access.js';
import { transaction_update } from '../api/data-access.js';
import { foundthing, exist_najie_thing } from '../apps/Xiuxian/xiuxian.js';
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
 * 消耗物品逻辑
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @param {number} quantity 消耗数量
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function consumeItem(userId, itemName, quantity = 1) {
    try {
        const itemInfo = await foundthing(itemName);
        if (!itemInfo || itemInfo.class !== '消耗品') {
            return {
                success: false,
                message: `[${itemName}]不是消耗品或不存在`
            };
        }

        // 检查玩家是否拥有该物品
        const ownedQuantity = await exist_najie_thing(userId, itemName, '消耗品');
        if (!ownedQuantity || ownedQuantity < quantity) {
            return {
                success: false,
                message: `你没有足够的[${itemName}]，拥有${ownedQuantity || 0}个，需要${quantity}个`
            };
        }

        const playerData = await DAL.getAllPlayerData(userId);
        const player = playerData.player;
        const najie = playerData.najie;

        // 应用物品效果
        const updatedPlayer = { ...player };
        if (itemInfo.效果) {
            // 根据物品效果更新玩家属性
            for (const [attr, value] of Object.entries(itemInfo.效果)) {
                if (updatedPlayer[attr] !== undefined) {
                    updatedPlayer[attr] += value * quantity;
                }
            }
        }

        // 从纳戒中移除物品
        const updatedNajie = { ...najie };
        const itemKey = Object.keys(najie).find(key => 
            najie[key].name === itemName && najie[key].class === '消耗品'
        );
        
        if (updatedNajie[itemKey].数量 > quantity) {
            updatedNajie[itemKey].数量 -= quantity;
        } else {
            delete updatedNajie[itemKey];
        }

        // 更新数据
        const updates = {
            player: updatedPlayer,
            najie: updatedNajie
        };

        await transaction_update(userId, updates);

        return {
            success: true,
            message: `成功使用[${itemName}]*${quantity}`
        };
    } catch (error) {
        console.error('消耗物品失败:', error);
        return {
            success: false,
            message: '使用失败，请稍后重试'
        };
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