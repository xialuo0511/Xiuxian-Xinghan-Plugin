import * as DAL from '../api/data-access.js';
import data from '../model/XiuxianData.js';

/**
 * 寻宝逻辑
 * @param {string} userId 用户ID
 * @param {string} mapName 地图名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function treasureHunt(userId, mapName) {
    if (!mapName || !mapName.trim()) {
        return {
            success: false,
            message: '请指定要寻宝的地图名称，如：#寻宝天衡山'
        };
    }

    mapName = mapName.trim();

    // 加载寻宝地图配置
    const treasureMaps = data.xunbao_list || [];
    const mapConfig = treasureMaps.find(m => m.name === mapName);

    if (!mapConfig) {
        const availableMaps = treasureMaps.map(m => m.name).join('、');
        return {
            success: false,
            message: `【${mapName}】不是有效的寻宝地图。\n可用地图：${availableMaps}`
        };
    }

    // 检查是否拥有该地图（地图在纳戒中，类别是"道具"）
    const hasMap = await DAL.getNajieItemAmount(userId, mapName + '地图', '道具');
    if (!hasMap || hasMap < 1) {
        return {
            success: false,
            message: `你的纳戒中没有【${mapName}地图】。`
        };
    }

    // 寻宝时间配置（3-7分钟随机）
    const huntDuration = (3 + Math.floor(Math.random() * 5)) * 60 * 1000;

    // 解析可能的奖励
    let possibleRewards = [];
    if (mapConfig.Best && mapConfig.Best.length > 0) {
        // Best 格式是数组，每个元素是逗号分隔的字符串
        const rewardString = mapConfig.Best[0];
        possibleRewards = rewardString.split(',').map(r => r.trim()).filter(r => r);
    }

    if (possibleRewards.length === 0) {
        possibleRewards = ['灵石'];
    }

    // 随机选择一个奖励
    const selectedReward = possibleRewards[Math.floor(Math.random() * possibleRewards.length)];

    // 执行事务：消耗地图、发放奖励、设置状态
    try {
        // 消耗地图
        await DAL.updateNajieItem(userId, mapName + '地图', '道具', -1);

        // 发放奖励
        let rewardMessage = '';
        if (selectedReward === '灵石') {
            // 灵石奖励
            const lingshiAmount = 50000 + Math.floor(Math.random() * 150000);
            await DAL.transaction_update(userId, (player) => {
                player.lingshi = (player.lingshi || 0) + lingshiAmount;
            });
            rewardMessage = `${lingshiAmount}颗灵石`;
        } else if (selectedReward.includes('地图')) {
            // 地图奖励
            await DAL.updateNajieItem(userId, selectedReward, '道具', 1);
            rewardMessage = `【${selectedReward}】×1`;
        } else {
            // 其他物品奖励（材料、丹药等）
            const rewardAmount = 1 + Math.floor(Math.random() * 3);
            // 尝试判断物品类别
            let itemClass = '材料';
            if (selectedReward.includes('丹') || selectedReward.includes('药')) {
                itemClass = '丹药';
            } else if (selectedReward.includes('瓶') || selectedReward.includes('球')) {
                itemClass = '道具';
            }
            await DAL.updateNajieItem(userId, selectedReward, itemClass, rewardAmount);
            rewardMessage = `【${selectedReward}】×${rewardAmount}`;
        }

        // 设置玩家状态为"寻宝中"
        const endTime = Date.now() + huntDuration;
        await DAL.setPlayerAction(userId, '寻宝', endTime);

        const minutes = Math.ceil(huntDuration / 60000);

        return {
            success: true,
            message: `你踏入了【${mapName}】开始寻宝...\n\n` +
                `🎁 发现了 ${rewardMessage}！\n\n` +
                `📍 正在返回中，需要约 ${minutes} 分钟。`
        };
    } catch (error) {
        console.error('[TreasureHunt] Error:', error);
        return {
            success: false,
            message: '寻宝过程中发生错误：' + error.message
        };
    }
}

/**
 * 获取寻宝地图列表
 * @returns {Promise<{success: boolean, maps: array}>}
 */
export async function getTreasureMapList() {
    try {
        const treasureList = data.xunbao_list || [];
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