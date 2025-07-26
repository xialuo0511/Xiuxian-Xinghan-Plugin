import * as DAL from '../api/data-access.js';
import { transaction_update } from '../api/data-access.js';
import { exist_najie_thing, Add_najie_thing } from '../apps/Xiuxian/xiuxian.js';

/**
 * 供奉奇怪石头逻辑
 * @param {string} userId 用户ID
 * @returns {Promise<{success: boolean, message?: string, needSleep?: boolean, firstMessage?: string, secondMessage?: string, thirdMessage?: string}>}
 */
export async function offerStone(userId) {
    // 检查是否有奇怪的石头
    const hasStone = await exist_najie_thing(userId, '长相奇怪的小石头', '道具');
    if (!hasStone) {
        return {
            success: false,
            message: '你翻遍了家里的院子，也没有找到什么看起来奇怪的石头\n于是坐下来冷静思考了一下。\n等等，是不是该去一趟精神病院？\n自己为什么突然会有供奉石头的怪念头？'
        };
    }

    return await transaction_update(userId, async (playerData) => {
        const { player } = playerData;

        // 特殊情况：轮回点>=10且未轮回
        if (player.轮回点 >= 10 && player.lunhui === 0) {
            player.当前血量 = 1;
            player.血气 -= 500000;
            
            return {
                success: true,
                needSleep: true,
                firstMessage: '你梳洗完毕，将小石头摆在案上,点上香烛，拜上三拜！',
                secondMessage: '奇怪的小石头灵光一闪，你感受到胸口一阵刺痛，喷出一口鲜血：\n"不好，这玩意一定是个邪物！不能放在身上！\n是不是该把它卖了补贴家用？\n或者放拍卖行骗几个自认为识货的人回本？"'
            };
        }

        // 正常供奉流程
        await Add_najie_thing(userId, '长相奇怪的小石头', '道具', -1);
        
        player.当前血量 = Math.floor(player.当前血量 / 3);
        player.血气 = Math.floor(player.血气 / 3);
        player.轮回点++;

        return {
            success: true,
            needSleep: true,
            firstMessage: '你梳洗完毕，将小石头摆在案上,点上香烛，拜上三拜！',
            secondMessage: '小石头灵光一闪，化作一道精光融入你的体内。\n你喷出一口瘀血，顿时感受到天地束缚弱了几分，可用轮回点+1',
            thirdMessage: `轮回点+1，当前轮回点：${player.轮回点}`
        };
    });
}