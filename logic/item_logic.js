import * as DAL from '../api/data-access.js';
import { transaction_update } from '../api/data-access.js';

/**
 * 存取灵石逻辑
 * @param {string} userId 用户ID
 * @param {string} type '存' 或 '取'
 * @param {number|string} amount 数量或'全部'
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function depositWithdrawLingshi(userId, type, amount) {
    return await transaction_update(userId, async (playerData) => {
        const { player, najie } = playerData;

        if (type === '存') {
            // 存灵石逻辑
            let depositAmount;
            if (amount === '全部') {
                depositAmount = player.灵石;
            } else {
                depositAmount = Number(amount);
            }

            if (depositAmount > player.灵石) {
                return {
                    success: false,
                    message: `你的灵石不足，当前拥有${player.灵石}灵石`
                };
            }

            if (najie.灵石 + depositAmount > najie.灵石上限) {
                return {
                    success: false,
                    message: `纳戒空间不足，当前容量${najie.灵石}/${najie.灵石上限}`
                };
            }

            player.灵石 -= depositAmount;
            najie.灵石 += depositAmount;

            return {
                success: true,
                message: `成功存入${depositAmount}灵石，纳戒灵石：${najie.灵石}/${najie.灵石上限}`
            };
        } else {
            // 取灵石逻辑
            let withdrawAmount;
            if (amount === '全部') {
                withdrawAmount = najie.灵石;
            } else {
                withdrawAmount = Number(amount);
            }

            if (withdrawAmount > najie.灵石) {
                return {
                    success: false,
                    message: `纳戒中灵石不足，当前拥有${najie.灵石}灵石`
                };
            }

            player.灵石 += withdrawAmount;
            najie.灵石 -= withdrawAmount;

            return {
                success: true,
                message: `成功取出${withdrawAmount}灵石，当前灵石：${player.灵石}`
            };
        }
    });
}