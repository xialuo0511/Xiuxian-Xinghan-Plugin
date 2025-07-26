import * as DAL from '../api/data-access.js';
import { transaction_update } from '../api/data-access.js';
import { foundthing, exist_najie_thing, Add_najie_thing } from '../apps/Xiuxian/xiuxian.js';
import data from '../model/XiuxianData.js';

/**
 * 购买商品逻辑
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @param {number} quantity 购买数量
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function buyItem(userId, itemName, quantity = 1) {
    try {
        // 查找物品信息
        const itemInfo = await foundthing(itemName);
        if (!itemInfo) {
            return {
                success: false,
                message: `这方世界没有[${itemName}]`
            };
        }

        // 检查是否可购买
        if (!itemInfo.price || itemInfo.price <= 0) {
            return {
                success: false,
                message: `[${itemName}]不可购买`
            };
        }

        const totalPrice = itemInfo.price * quantity;
        const playerData = await DAL.getAllPlayerData(userId);
        const player = playerData.player;
        const najie = playerData.najie;

        // 检查灵石是否足够
        if (player.灵石 < totalPrice) {
            return {
                success: false,
                message: `灵石不足，需要${totalPrice}灵石，当前拥有${player.灵石}灵石`
            };
        }

        // 检查纳戒空间
        const currentSpace = Object.values(najie).reduce((sum, item) => sum + (item.数量 || 0), 0);
        if (currentSpace + quantity > player.纳戒空间) {
            return {
                success: false,
                message: '纳戒空间不足'
            };
        }

        // 执行购买
        const updates = {
            player: {
                ...player,
                灵石: player.灵石 - totalPrice
            },
            najie: {
                ...najie
            }
        };

        // 添加物品到纳戒
        await Add_najie_thing(userId, itemName, itemInfo.class, quantity);
        
        // 更新玩家数据
        await transaction_update(userId, updates);

        return {
            success: true,
            message: `成功购买${itemName}*${quantity}，消耗${totalPrice}灵石`
        };
    } catch (error) {
        console.error('购买物品失败:', error);
        return {
            success: false,
            message: '购买失败，请稍后重试'
        };
    }
}

/**
 * 仙石购买商品逻辑
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @param {number} quantity 购买数量
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function buyItemWithXianshi(userId, itemName, quantity = 1) {
    try {
        // 查找物品信息
        const itemInfo = await foundthing(itemName);
        if (!itemInfo) {
            return {
                success: false,
                message: `这方世界没有[${itemName}]`
            };
        }

        // 检查是否可用仙石购买
        if (!itemInfo.仙石价格 || itemInfo.仙石价格 <= 0) {
            return {
                success: false,
                message: `[${itemName}]不可用仙石购买`
            };
        }

        const totalPrice = itemInfo.仙石价格 * quantity;
        const playerData = await DAL.getAllPlayerData(userId);
        const player = playerData.player;
        const najie = playerData.najie;

        // 检查仙石是否足够
        if (player.仙石 < totalPrice) {
            return {
                success: false,
                message: `仙石不足，需要${totalPrice}仙石，当前拥有${player.仙石}仙石`
            };
        }

        // 检查纳戒空间
        const currentSpace = Object.values(najie).reduce((sum, item) => sum + (item.数量 || 0), 0);
        if (currentSpace + quantity > player.纳戒空间) {
            return {
                success: false,
                message: '纳戒空间不足'
            };
        }

        // 执行购买
        const updates = {
            player: {
                ...player,
                仙石: player.仙石 - totalPrice
            },
            najie: {
                ...najie
            }
        };

        // 添加物品到纳戒
        await Add_najie_thing(userId, itemName, itemInfo.class, quantity);
        
        // 更新玩家数据
        await transaction_update(userId, updates);

        return {
            success: true,
            message: `成功购买${itemName}*${quantity}，消耗${totalPrice}仙石`
        };
    } catch (error) {
        console.error('仙石购买物品失败:', error);
        return {
            success: false,
            message: '购买失败，请稍后重试'
        };
    }
}

/**
 * 出售商品逻辑
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @param {number} quantity 出售数量
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function sellItem(userId, itemName, quantity = 1) {
    try {
        // 查找物品信息
        const itemInfo = await foundthing(itemName);
        if (!itemInfo) {
            return {
                success: false,
                message: `这方世界没有[${itemName}]`
            };
        }

        // 检查玩家是否拥有该物品
        const ownedQuantity = await exist_najie_thing(userId, itemName, itemInfo.class);
        if (!ownedQuantity || ownedQuantity < quantity) {
            return {
                success: false,
                message: `你没有足够的[${itemName}]，拥有${ownedQuantity || 0}个，需要${quantity}个`
            };
        }

        // 计算出售价格（通常是购买价格的一半）
        const sellPrice = Math.floor((itemInfo.price || 0) * 0.5);
        if (sellPrice <= 0) {
            return {
                success: false,
                message: `[${itemName}]无法出售`
            };
        }

        const totalEarnings = sellPrice * quantity;
        const playerData = await DAL.getAllPlayerData(userId);
        const player = playerData.player;
        const najie = playerData.najie;

        // 移除物品
        const itemKey = Object.keys(najie).find(key => 
            najie[key].name === itemName && najie[key].class === itemInfo.class
        );
        
        if (!itemKey) {
            return {
                success: false,
                message: `纳戒中没有找到[${itemName}]`
            };
        }

        const updatedNajie = { ...najie };
        if (updatedNajie[itemKey].数量 > quantity) {
            updatedNajie[itemKey].数量 -= quantity;
        } else {
            delete updatedNajie[itemKey];
        }

        // 更新玩家数据
        const updates = {
            player: {
                ...player,
                灵石: player.灵石 + totalEarnings
            },
            najie: updatedNajie
        };

        await transaction_update(userId, updates);

        return {
            success: true,
            message: `成功出售${itemName}*${quantity}，获得${totalEarnings}灵石`
        };
    } catch (error) {
        console.error('出售物品失败:', error);
        return {
            success: false,
            message: '出售失败，请稍后重试'
        };
    }
}