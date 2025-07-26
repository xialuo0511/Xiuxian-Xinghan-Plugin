import * as DAL from '../api/data-access.js';
import { exist_najie_thing, Add_najie_thing, foundthing } from '../apps/Xiuxian/xiuxian.js';
import data from '../model/XiuxianData.js';

/**
 * 寻宝逻辑
 * @param {string} userId 用户ID
 * @param {string} mapName 地图名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function treasureHunt(userId, mapName) {
    return await DAL.transaction_update(userId, async (playerData) => {
        const { player, najie } = playerData;

        // 检查地图是否存在
        const mapItem = await foundthing(mapName);
        if (!mapItem || mapItem.type !== '地图') {
            return {
                success: false,
                message: `【${mapName}】不是有效的寻宝地图`
            };
        }

        // 检查是否拥有该地图
        const hasMap = await exist_najie_thing(userId, mapName, '道具');
        if (!hasMap) {
            return {
                success: false,
                message: `你的背包中没有【${mapName}】这样的地图`
            };
        }

        // 检查冷却时间
        const now = Date.now();
        const cooldownKey = `xiuxian:player:${userId}:treasure_hunt_cd`;
        const lastTime = await redis.get(cooldownKey);
        const cooldownTime = 7 * 60 * 1000; // 30分钟冷却

        if (lastTime && now < parseInt(lastTime) + cooldownTime) {
            const remaining = parseInt(lastTime) + cooldownTime - now;
            const m = Math.floor(remaining / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            return {
                success: false,
                message: `正在归来途中，还需要 ${m}分${s}秒`
            };
        }

        // 消耗地图
        await Add_najie_thing(userId, mapName, '道具', -1);

        // 计算奖励倍率
        let multiplier = 0.8;
        let bonusMessage = '';

        // 天赋加成
        const tianfuLevel = player.tianfu_level || 0;
        let tianfuBonus = 0;
        const tianfuRand = Math.random();

        if (tianfuLevel >= 2 && tianfuLevel <= 5 && tianfuRand < 0.01) {
            tianfuBonus = 1;
            bonusMessage += '您触发了天赋效果，本次寻宝收益+1\n';
        } else if (tianfuLevel >= 6 && tianfuLevel <= 10 && tianfuRand < 0.025) {
            tianfuBonus = 1;
            bonusMessage += '您触发了天赋效果，本次寻宝收益+1\n';
        }

        // 根据地图类型生成奖励
        const rewards = generateTreasureRewards(mapName, multiplier, tianfuBonus);

        // 应用奖励
        for (const reward of rewards.items) {
            if (reward.type === '灵石') {
                player.灵石 += reward.amount;
            } else {
                await Add_najie_thing(userId, reward.name, reward.class, reward.amount);
            }
        }

        // 设置冷却时间
        await redis.set(cooldownKey, now.toString());

        return {
            success: true,
            message: `${bonusMessage}${rewards.message}`
        };
    });
}

/**
 * 生成寻宝奖励
 * @param {string} mapName 地图名称
 * @param {number} multiplier 倍率
 * @param {number} bonus 额外奖励
 * @returns {object} 奖励信息
 */
function generateTreasureRewards(mapName, multiplier, bonus) {
    const rand = Math.random();
    let message = '';
    let items = [];

    // 根据不同地图类型生成不同奖励
    switch (mapName) {
        case '深渊':
            if (rand >= 0.95) {
                items.push({ type: '道具', name: '七星海棠丹', class: '丹药', amount: (1 * multiplier) + bonus });
                message = `你在【深渊】的最深处发现了传说中的【七星海棠丹】×${(1 * multiplier) + bonus}！`;
            } else if (rand >= 0.8) {
                items.push({ type: '材料', name: '岩浆', class: '材料', amount: (5 * multiplier) + bonus });
                message = `你在【深渊】中收集到了【岩浆】×${(5 * multiplier) + bonus}！`;
            } else if (rand >= 0.5) {
                items.push({ type: '灵石', amount: (500000 * multiplier) + (bonus * 100000) });
                message = `你在【深渊】中发现了${(500000 * multiplier) + (bonus * 100000)}颗灵石！`;
            } else {
                items.push({ type: '灵石', amount: (100000 * multiplier) + (bonus * 50000) });
                message = `你在【深渊】中只找到了${(100000 * multiplier) + (bonus * 50000)}颗灵石。`;
            }
            break;

        case '天衡山':
            if (rand >= 0.9) {
                items.push({ type: '道具', name: '魔山地图', class: '道具', amount: (1 * multiplier) + bonus });
                message = `你在【天衡山】发现了珍贵的【魔山地图】×${(1 * multiplier) + bonus}！`;
            } else if (rand >= 0.6) {
                items.push({ type: '材料', name: '铁矿', class: '材料', amount: (10 * multiplier) + bonus });
                message = `你在【天衡山】挖到了【铁矿】×${(10 * multiplier) + bonus}！`;
            } else {
                items.push({ type: '材料', name: '煤炭', class: '材料', amount: (15 * multiplier) + bonus });
                message = `你在【天衡山】挖到了【煤炭】×${(15 * multiplier) + bonus}！`;
            }
            break;

        case '低语森林':
            if (rand >= 0.85) {
                items.push({ type: '道具', name: '水天丛林地图', class: '道具', amount: (1 * multiplier) + bonus });
                message = `你在【低语森林】找到了【水天丛林地图】×${(1 * multiplier) + bonus}！`;
            } else if (rand >= 0.5) {
                items.push({ type: '材料', name: '泥土', class: '材料', amount: (20 * multiplier) + bonus });
                items.push({ type: '食材', name: '苹果', class: '食材', amount: (5 * multiplier) + bonus });
                message = `你在【低语森林】收集到了【泥土】×${(20 * multiplier) + bonus}和【苹果】×${(5 * multiplier) + bonus}！`;
            } else {
                items.push({ type: '食材', name: '树苗', class: '食材', amount: (8 * multiplier) + bonus });
                message = `你在【低语森林】找到了【树苗】×${(8 * multiplier) + bonus}！`;
            }
            break;

        default:
            // 通用奖励
            if (rand >= 0.8) {
                items.push({ type: '灵石', amount: (200000 * multiplier) + (bonus * 50000) });
                message = `你在【${mapName}】发现了${(200000 * multiplier) + (bonus * 50000)}颗灵石！`;
            } else {
                items.push({ type: '灵石', amount: (50000 * multiplier) + (bonus * 20000) });
                message = `你在【${mapName}】找到了${(50000 * multiplier) + (bonus * 20000)}颗灵石。`;
            }
    }

    return { items, message };
}

/**
 * 获取寻宝地图列表
 * @returns {Promise<{success: boolean, maps: array}>}
 */
export async function getTreasureMapList() {
    try {
        // 从寻宝列表.json获取地图信息
        const treasureList = data.xunbao_list;

        return {
            success: true,
            maps: treasureList
        };
    } catch (error) {
        return {
            success: false,
            maps: []
        };
    }
}