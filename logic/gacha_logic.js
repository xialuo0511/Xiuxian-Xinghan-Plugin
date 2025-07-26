import * as DAL from '../api/data-access.js';
import data from '../model/XiuxianData.js';
import { exist_najie_thing, Add_najie_thing } from '../apps/Xiuxian/xiuxian.js';

/**
 * 抽卡池逻辑
 * @param {string} userId 用户ID
 * @param {string} poolType 卡池类型
 * @returns {Promise<{success: boolean, message?: string, name?: string, grade?: string}>}
 */
export async function drawFromPool(userId, poolType) {
    let requiredItem;
    let poolRange;

    switch (poolType) {
        case '天地卡池':
            requiredItem = '天罗地网';
            poolRange = data.changzhuxianchon.length;
            break;
        case '灵界卡池':
            requiredItem = '金丝仙网';
            poolRange = data.changzhuxianchon.length;
            break;
        case '凡界卡池':
            requiredItem = '银丝仙网';
            poolRange = data.changzhuxianchon.length - 10;
            break;
        default:
            return { success: false, message: '未知的卡池类型' };
    }

    // 检查是否有抽卡道具
    const hasItem = await exist_najie_thing(userId, requiredItem, '道具');
    if (!hasItem) {
        return {
            success: false,
            message: `你没有【${requiredItem}】`
        };
    }

    // 消耗道具
    await Add_najie_thing(userId, requiredItem, '道具', -1);

    // 随机抽取
    let randomIndex = Math.floor(Math.random() * poolRange);
    randomIndex = (Math.ceil((randomIndex + 1) / 5) - 1) * 5;

    const result = data.changzhuxianchon[randomIndex];

    return {
        success: true,
        name: result.name,
        grade: result.品级
    };
}