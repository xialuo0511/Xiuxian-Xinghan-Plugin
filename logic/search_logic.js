import * as DAL from '../api/data-access.js';
import data from '../model/XiuxianData.js';
import { foundthing, exist_najie_thing } from '../apps/Xiuxian/xiuxian.js';

/**
 * 查找物品位置逻辑
 * @param {string} userId 用户ID
 * @param {string} thingName 物品名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function findItemLocation(userId, thingName) {
    // 检查物品是否存在
    const thingExist = await foundthing(thingName);
    if (!thingExist) {
        return {
            success: false,
            message: `你在瞎说啥呢?哪来的【${thingName}】?`
        };
    }

    // 检查是否有寻物纸
    const hasSearchPaper = await exist_najie_thing(userId, '寻物纸', '道具');
    if (!hasSearchPaper) {
        return {
            success: false,
            message: '查找物品需要【寻物纸】'
        };
    }

    const locations = [];

    // 搜索秘境
    locations.push('秘境：');
    for (const location of data.didian_list) {
        const found = [
            ...location.one || [],
            ...location.two || [],
            ...location.three || []
        ].some(item => item.name === thingName);

        if (found) {
            locations.push(location.name + ' ');
        }
    }

    // 搜索禁地
    locations.push('\n禁地：');
    for (const location of data.forbiddenarea_list) {
        const found = [
            ...location.one || [],
            ...location.two || [],
            ...location.three || []
        ].some(item => item.name === thingName);

        if (found) {
            locations.push(location.name + ' ');
        }
    }

    // 搜索宗门秘境
    locations.push('\n宗门秘境：');
    for (const location of data.guildSecrets_list) {
        const found = [
            ...location.one || [],
            ...location.two || [],
            ...location.three || []
        ].some(item => item.name === thingName);

        if (found) {
            locations.push(location.name + ' ');
        }
    }

    // 搜索仙境
    locations.push('\n仙境：');
    for (const location of data.Fairyrealm_list) {
        const found = [
            ...location.one || [],
            ...location.two || [],
            ...location.three || []
        ].some(item => item.name === thingName);

        if (found) {
            locations.push(location.name + ' ');
        }
    }

    // 搜索仙府
    locations.push('\n仙府：');
    for (const location of data.timeplace_list) {
        const found = [
            ...location.one || [],
            ...location.two || [],
            ...location.three || []
        ].some(item => item.name === thingName);

        if (found) {
            locations.push(location.name + ' ');
        }
    }

    return {
        success: true,
        message: locations.join('')
    };
}