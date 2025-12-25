import * as DAL from '../api/data-access.js';
import { foundthing } from '../apps/Xiuxian/xiuxian.js';

/**
 * 购买商品逻辑
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @param {number} quantity 购买数量
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function buyItem(userId, itemName, quantity = 1) {
    try {
        const itemInfo = await foundthing(itemName);
        if (!itemInfo) {
            return { success: false, message: `这方世界没有[${itemName}]` };
        }

        if (!itemInfo.price || itemInfo.price <= 0) {
            return { success: false, message: `[${itemName}]不可购买` };
        }

        const totalPrice = itemInfo.price * quantity;
        let finalMessage = "";

        const transactionSuccess = await DAL.transaction_update(userId, (player, equipment, najie) => {
            if (player.灵石 < totalPrice) {
                finalMessage = `灵石不足，需要${totalPrice}灵石，当前拥有${player.灵石}灵石`;
                return false;
            }

            // 简单的空间检查 (总数量)
            // 注意：这里假设所有物品都占1个空间，或者不做严格体积检查
            // 现有逻辑通常是检查 najie 里数组的长度或者总数。
            // 暂时沿用旧逻辑：不做复杂空间检查，或者假设每种物品占一个格子(堆叠)
            // 如果需要检查纳戒空间限制:
            if (player.纳戒空间 <= 0) { // 简单防御
                 // player.纳戒空间 通常是上限
            }
            // 暂时省略空间检查，以免误判

            // 扣钱
            player.灵石 -= totalPrice;

            // 加物品
            const itemClass = itemInfo.class;
            // 使用 DAL 的同步辅助函数来确保一致性
            // 但这里我们是在回调里，所以不能直接调 async 函数，只能调普通函数
            // api/data-access.js 导出了 updateNajieSync
            
            const success = DAL.updateNajieSync(najie, itemName, itemClass, quantity, 0); // 默认为0品级(如果是装备)
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
 * 仙石购买商品逻辑
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @param {number} quantity 购买数量
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function buyItemWithXianshi(userId, itemName, quantity = 1) {
    try {
        const itemInfo = await foundthing(itemName);
        if (!itemInfo) {
            return { success: false, message: `这方世界没有[${itemName}]` };
        }

        if (!itemInfo.仙石价格 || itemInfo.仙石价格 <= 0) {
            return { success: false, message: `[${itemName}]不可用仙石购买` };
        }

        const totalPrice = itemInfo.仙石价格 * quantity;
        let finalMessage = "";

        const transactionSuccess = await DAL.transaction_update(userId, (player, equipment, najie) => {
            if (player.仙石 < totalPrice) {
                finalMessage = `仙石不足，需要${totalPrice}仙石，当前拥有${player.仙石}仙石`;
                return false;
            }

            player.仙石 -= totalPrice;

            const success = DAL.updateNajieSync(najie, itemName, itemInfo.class, quantity, 0);
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

        // 检查价格
        // 注意：某些物品可能没有 price 字段，或者 price 为 0
        const price = itemInfo.price || 0;
        if (price <= 0) {
             return { success: false, message: `[${itemName}]不可出售` };
        }
        
        const sellPrice = Math.floor(price * 0.5);
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

             // 查找物品
             // 优先查找非锁定的
             // 如果是装备，可能会有多个，这里简单起见，找第一个匹配名字的
             // 实际上应该优先找低品级或者非锁定的
             
             let itemIndex = -1;
             
             // 如果是装备，可能有多个同名但不同品级
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
                 // 非装备（堆叠物品），通常只有一个 entry
                 itemIndex = najie[najieKey].findIndex(item => item.name === itemName);
                 if (itemIndex === -1) {
                    finalMessage = `你没有[${itemName}]`;
                    return false;
                 }
                 // 检查锁定
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
