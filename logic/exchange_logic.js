import * as DAL from '../api/data-access.js';
import data from '../model/XiuxianData.js';
import { Add_najie_thing } from '../apps/Xiuxian/xiuxian.js';

/**
 * 兑换码兑换逻辑
 * @param {string} userId 用户ID
 * @param {string} code 兑换码
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function exchangeRedemptionCode(userId, code) {
    // 查找兑换码
    const exchangeItem = data.duihuan.find(item => item.name === code);
    if (!exchangeItem) {
        return { success: false, message: '兑换码不存在!' };
    }

    // 检查是否已兑换
    const usedCodes = await redis.get(`xiuxian:player:${userId}:duihuan`);
    const usedCodesList = usedCodes ? JSON.parse(usedCodes) : [];

    if (usedCodesList.includes(code)) {
        return { success: false, message: '你已经兑换过该兑换码了' };
    }

    // 检查等级要求
    const playerData = await DAL.getAllPlayerData(userId);
    const player = playerData.player;

    if (player.level_id < exchangeItem.level_min || player.level_id > exchangeItem.level_max) {
        return {
            success: false,
            message: '您修炼等级不符合这个兑换码的领取要求，请详读布告后再来领取！'
        };
    }

    // 特殊兑换码检查
    if (exchangeItem.qq) {
        const isEligible = exchangeItem.qq.some(item => item.name === userId);
        if (!isEligible) {
            return { success: false, message: '您不符合此兑换码的兑换条件' };
        }
    }

    // 执行兑换
    usedCodesList.push(code);
    await redis.set(`xiuxian:player:${userId}:duihuan`, JSON.stringify(usedCodesList));

    const rewards = [];
    for (const item of exchangeItem.thing) {
        await Add_najie_thing(userId, item.name, item.class, item.数量);
        rewards.push(`[${item.name}]*${item.数量}`);
    }

    const message = exchangeItem.qq ?
        `感谢参与问卷调研！特此奉上:${rewards.join('\n')}` :
        `恭喜获得:${rewards.join('\n')}`;

    return { success: true, message };
}