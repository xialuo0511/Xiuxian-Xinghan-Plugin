import * as DAL from '../api/data-access.js';
import { transaction_update } from '../api/data-access.js';
import { exist_najie_thing, Add_najie_thing } from '../apps/Xiuxian/xiuxian.js';

/**
 * 召唤天理逻辑
 * @param {string} userId 用户ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function summonHeavenly(userId) {
    return await transaction_update(userId, async (playerData) => {
        const { player, najie } = playerData;

        // 检查是否有七颗神之心
        const godHeartCount = await exist_najie_thing(userId, '[无主的神之心]', '道具');
        if (godHeartCount < 7) {
            return {
                success: false,
                message: `召唤天理需要七颗[无主的神之心]，你目前拥有${godHeartCount || 0}颗`
            };
        }

        // 消耗七颗神之心
        await Add_najie_thing(userId, '[无主的神之心]', '道具', -7);

        // 天理降临效果
        const random = Math.random();
        let reward = '';

        if (random < 0.01) {
            // 1% 概率获得终极奖励
            player.境界 = '天理境';
            player.level_id = 99;
            reward = '天理亲自降临，赐予你天理境界！';
        } else if (random < 0.1) {
            // 9% 概率获得大量修为
            const xiuwei = 100000000;
            player.修为 += xiuwei;
            reward = `天理降下神光，你获得了${xiuwei}修为！`;
        } else if (random < 0.3) {
            // 20% 概率获得神器
            await Add_najie_thing(userId, '天理神剑', '装备', 1);
            reward = '天理赐予你神器[天理神剑]！';
        } else {
            // 70% 概率获得大量灵石
            const lingshi = 50000000;
            player.灵石 += lingshi;
            reward = `天理降下金光，你获得了${lingshi}灵石！`;
        }

        return {
            success: true,
            message: `七颗神之心化作光柱冲天而起！\n${reward}`
        };
    });
}