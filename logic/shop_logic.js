import * as DAL from '../api/data-access.js';
import { foundthing, Check_thing } from '../apps/Xiuxian/xiuxian.js';
import data from '../model/XiuxianData.js';

/**
 * 购买商品逻辑 (普通灵石商店)
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @param {number} quantity 购买数量
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function buyItem(userId, itemName, quantity = 1) {
    try {
        // 1. 在普通商品列表里查找
        const shopItem = data.commodities_list.find(i => i.name === itemName);
        if (!shopItem) {
            return { success: false, message: `商店里没有卖[${itemName}]` };
        }

        // 2. 获取物品完整信息 (用于获取class等)
        const itemInfo = await foundthing(itemName);
        if (!itemInfo) {
            return { success: false, message: `数据异常：[${itemName}]不存在于世` };
        }

        // 3. 确定价格 (优先使用商店列表里的价格)
        const price = shopItem.出售价 || shopItem.price || 0;
        if (price <= 0) {
            return { success: false, message: `[${itemName}]价格异常，无法购买` };
        }

        const totalPrice = price * quantity;
        let finalMessage = "";

        const transactionSuccess = await DAL.transaction_update(userId, (player, equipment, najie) => {
            if (player.灵石 < totalPrice) {
                finalMessage = `灵石不足，需要${totalPrice}灵石，当前拥有${player.灵石}灵石`;
                return false;
            }

            // 扣钱
            player.灵石 -= totalPrice;

            // 加物品
            const itemClass = itemInfo.class;
            // updateNajieSync 会自动处理堆叠和添加
            // 默认为0品级
            const success = DAL.updateNajieSync(najie, itemName, itemClass, quantity, 0); 
            if (!success) {
                finalMessage = "纳戒空间不足或物品添加失败";
                return false;
            }

            finalMessage = `成功购买${itemName}*${quantity}，消耗${totalPrice}灵石`;
            return true;
        });

        return { success: transactionSuccess, message: finalMessage || "购买失败" };
    } catch (error) {
        console.error('购买物品失败:', error);
        return { success: false, message: '系统繁忙' };
    }
}

/**
 * 仙石购买商品逻辑 (仙石商店)
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @param {number} quantity 购买数量
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function buyItemWithXianshi(userId, itemName, quantity = 1) {
    try {
        // 1. 在仙石商品列表里查找
        const shopItem = data.xianshi_list.find(i => i.name === itemName);
        if (!shopItem) {
            return { success: false, message: `仙石商店里没有卖[${itemName}]` };
        }

        const itemInfo = await foundthing(itemName);
        if (!itemInfo) {
             return { success: false, message: `数据异常：[${itemName}]不存在于世` };
        }

        const price = shopItem.出售价 || shopItem.price || 0;
        if (price <= 0) {
            return { success: false, message: `[${itemName}]价格异常，无法购买` };
        }

        const totalPrice = price * quantity;
        let finalMessage = "";

        const transactionSuccess = await DAL.transaction_update(userId, (player, equipment, najie) => {
            if (player.仙石 < totalPrice) {
                finalMessage = `仙石不足，需要${totalPrice}仙石，当前拥有${player.仙石}仙石`;
                return false;
            }

            player.仙石 -= totalPrice;

            const itemClass = itemInfo.class;
            const success = DAL.updateNajieSync(najie, itemName, itemClass, quantity, 0);
            if (!success) {
                finalMessage = "纳戒空间不足或物品添加失败";
                return false;
            }

            finalMessage = `成功购买${itemName}*${quantity}，消耗${totalPrice}仙石`;
            return true;
        });

        return { success: transactionSuccess, message: finalMessage || "购买失败" };
    } catch (error) {
        console.error('仙石购买物品失败:', error);
        return { success: false, message: '系统繁忙' };
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
        const itemInfo = await foundthing(itemName);
        if (!itemInfo) {
            return { success: false, message: `这方世界没有[${itemName}]` };
        }

        // 检查特殊限制 (活动物品等)
        const isRestricted = await Check_thing(itemInfo);
        if (isRestricted === 1) {
             return { success: false, message: `[${itemName}]特殊物品/活动物品，无法出售` };
        }

        // 检查价格
        // 兼容 '出售价' 字段
        const basePrice = itemInfo.出售价 || itemInfo.price || 0;
        if (basePrice <= 0) {
             return { success: false, message: `[${itemName}]不可出售` };
        }
        
        let sellPrice;
        // 特殊处理：钞票类物品原价回收
        if (itemInfo.type === '钞票') {
            sellPrice = basePrice;
        } else {
            // 其他物品出售价格为原价的一半
            sellPrice = Math.floor(basePrice * 0.5);
        }

        if (sellPrice <= 0) {
             return { success: false, message: `[${itemName}]太廉价了，卖不出去` };
        }

        let finalMessage = "";
        const transactionSuccess = await DAL.transaction_update(userId, (player, equipment, najie) => {
             const itemClass = itemInfo.class;
             const categoryMap = { '仙米': '仙宠口粮' };
             const najieKey = categoryMap[itemClass] || itemClass;

             if (!najie[najieKey] || !Array.isArray(najie[najieKey])) {
                 finalMessage = `你没有[${itemName}]`;
                 return false;
             }

             let itemIndex = -1;
             
             if (itemClass === '装备') {
                 // 找到所有同名的
                 const candidates = najie[najieKey]
                    .map((item, index) => ({ ...item, index }))
                    .filter(item => item.name === itemName);
                 
                 if (candidates.length === 0) {
                     finalMessage = `你没有[${itemName}]`;
                     return false;
                 }
                 
                 // 优先找没锁定的
                 const unlocked = candidates.find(item => !item.islockd);
                 if (unlocked) {
                     itemIndex = unlocked.index;
                 } else {
                     finalMessage = `[${itemName}]都被锁定了，请先解锁`;
                     return false;
                 }
             } else {
                 itemIndex = najie[najieKey].findIndex(item => item.name === itemName);
                 if (itemIndex === -1) {
                    finalMessage = `你没有[${itemName}]`;
                    return false;
                 }
                 if (najie[najieKey][itemIndex].islockd) {
                    finalMessage = `[${itemName}]已被锁定，请先解锁`;
                    return false;
                 }
             }

             const targetItem = najie[najieKey][itemIndex];

             if (targetItem.数量 < quantity) {
                 finalMessage = `你只有 ${targetItem.数量} 个 [${itemName}]`;
                 return false;
             }

             // 扣除物品
             targetItem.数量 -= quantity;
             if (targetItem.数量 <= 0) {
                 najie[najieKey].splice(itemIndex, 1);
             }

             // 加钱
             const totalEarnings = sellPrice * quantity;
             player.灵石 += totalEarnings;
             
             finalMessage = `成功出售 ${itemName} * ${quantity}，获得 ${totalEarnings} 灵石`;
             return true;
        });

        return { success: transactionSuccess, message: finalMessage || "出售失败，请稍后重试" };

    } catch (error) {
        console.error('出售物品失败:', error);
        return { success: false, message: '系统繁忙' };
    }
}