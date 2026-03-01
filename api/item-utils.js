/**
 * item-utils.js
 * 纯物品查找工具模块，不依赖 Yunzai 框架任何内容，可安全在 Worker 子进程中使用。
 */
import data from '../model/XiuxianData.js';

/**
 * 遍历所有已知的物品列表来查找物品
 * @param {string} thing_name 物品名
 * @returns {object|false} 找到则返回物品对象，否则返回false
 */
export async function foundthing(thing_name) {
    // 将所有需要搜索的物品列表统一放入一个数组
    const itemListsToSearch = [
        data.daoju_list,
        data.danyao_list,
        data.newdanyao_list,
        data.equipment_list,
        data.gongfa_list,
        data.homegongfa_list,
        data.timegongfa_list,
        data.timeequipmen_list,
        data.timedanyao_list,
        data.caoyao_list,
        data.cailiao_list,
        data.hezi_list,
        data.xianchon,
        data.xianchonkouliang,
        data.necklace_list,
        data.shicai_list,
        data.gift_list,
        data.fishing_rods_list,
        data.fishing_baits_list,
        data.fishing_items_list,
        data.start_souls_list
    ];

    for (const list of itemListsToSearch) {
        if (Array.isArray(list)) {
            const item = list.find(i => i && i.name === thing_name);
            if (item) {
                return item;
            }
        }
    }

    return false;
}
