import * as DAL from '../api/data-access.js';
import data from '../model/XiuxianData.js';
import config from '../model/Config.js';
import fs from 'fs';
import { timestampToTime, shijianc, get_random_fromARR, Getmsg_battle, get_random_talent, player_efficiency } from '../apps/Xiuxian/xiuxian.js';
import { Add_灵石, Add_HP, Add_血气, Add_修为, Add_najie_thing, isNotNull, Read_player, exist_najie_thing } from '../apps/Xiuxian/xiuxian.js';
import { createRequire } from "module";

// 配置常量
const 宗门灵石池上限 = [2000000, 5000000, 8000000, 11000000, 15000000, 20000000, 25000000, 30000000];
const 宗门人数上限 = [6, 9, 12, 15, 18, 21, 24, 27];

/**
 * 获取洞天福地列表
 * @returns {Promise<{success: boolean, data?: object}>}
 */
export async function getBlessPlaceList() {
    try {
        const blessList = data.bless_list;
        return {
            success: true,
            data: {
                places: blessList,
                title: "洞天福地"
            }
        };
    } catch (error) {
        return { success: false, message: '获取洞天福地列表失败' };
    }
}

/**
 * 获取宗门秘境列表
 * @returns {Promise<{success: boolean, data?: object}>}
 */
export async function getSecretPlaceList() {
    try {
        const secretsList = data.guildSecrets_list;
        return {
            success: true,
            data: {
                places: secretsList,
                title: "宗门秘境"
            }
        };
    } catch (error) {
        return { success: false, message: '获取宗门秘境列表失败' };
    }
}

/**
 * 入驻洞天逻辑
 * @param {string} userId 玩家ID
 * @param {string} placeName 洞天名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function enterBlessPlace(userId, placeName) {
    const allData = await DAL.getAllPlayerData(userId);
    if (!allData) {
        return { success: false, message: '玩家数据不存在' };
    }

    const { player } = allData;
    if (!isNotNull(player.宗门)) {
        return { success: false, message: '你尚未加入宗门' };
    }

    if (player.宗门.职位 !== "宗主") {
        return { success: false, message: '只有宗主可以操作' };
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    if (!ass) {
        return { success: false, message: '宗门数据不存在' };
    }

    // 检查洞天是否存在
    const dongTan = data.bless_list.find(item => item.name === placeName);
    if (!dongTan) {
        return { success: false, message: '该洞天不存在' };
    }

    if (ass.宗门驻地 === placeName) {
        return { success: false, message: '咋的，要给自己宗门拆了重建啊' };
    }

    // 检查洞天是否被其他宗门占据
    const contestResult = await contestBlessPlace(ass, dongTan);
    if (!contestResult.success) {
        return contestResult;
    }

    // 更新宗门驻地
    ass.宗门驻地 = placeName;
    await DAL.saveAssociation(ass.宗门名称, ass);

    // 更新所有成员效率
    for (const memberId of ass.所有成员) {
        await player_efficiency(memberId);
    }

    return { success: true, message: contestResult.message };
}

/**
 * 宗门驻地争夺逻辑
 * @param {object} attackingAssociation 进攻宗门
 * @param {object} targetPlace 目标洞天
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function contestBlessPlace(attackingAssociation, targetPlace) {
    try {
        // 查找占据该洞天的宗门
        const keys = await redis.keys('XinghanXiuxian:Data:Association:*');
        let defendingAssociation = null;

        for (const key of keys) {
            const associationName = key.replace('XinghanXiuxian:Data:Association:', '');
            const ass = await DAL.getAssociation(associationName);
            if (ass && ass.宗门驻地 === targetPlace.name) {
                defendingAssociation = ass;
                break;
            }
        }

        if (!defendingAssociation) {
            // 洞天无人占据，直接入驻
            return {
                success: true,
                message: `${attackingAssociation.宗门名称}成功入驻${targetPlace.name}`
            };
        }

        // 计算双方战力
        const attackPower = await calculateAssociationPower(attackingAssociation, 'attack');
        const defendPower = await calculateAssociationPower(defendingAssociation, 'defend');

        // 添加随机因素
        const finalAttackPower = Math.trunc(attackPower * (0.9 + Math.random() * 0.2));
        const finalDefendPower = Math.trunc(defendPower * (0.9 + Math.random() * 0.2));

        if (finalAttackPower > finalDefendPower) {
            // 进攻方胜利
            defendingAssociation.宗门驻地 = 0;
            defendingAssociation.宗门建设等级 = Math.max(0, defendingAssociation.宗门建设等级 - 10);
            await DAL.saveAssociation(defendingAssociation.宗门名称, defendingAssociation);

            // 更新防守方成员效率
            for (const memberId of defendingAssociation.所有成员) {
                await player_efficiency(memberId);
            }

            return {
                success: true,
                message: `${attackingAssociation.宗门名称}击败了${defendingAssociation.宗门名称},成功夺取${targetPlace.name}`
            };
        } else {
            // 防守方胜利
            return {
                success: false,
                message: `${attackingAssociation.宗门名称}挑战${defendingAssociation.宗门名称}失败,${targetPlace.name}争夺战败北`
            };
        }
    } catch (error) {
        return { success: false, message: '驻地争夺过程中发生错误' };
    }
}

/**
 * 计算宗门战力
 * @param {object} association 宗门数据
 * @param {string} type 计算类型 ('attack' | 'defend')
 * @returns {Promise<number>}
 */
async function calculateAssociationPower(association, type) {
    let totalPower = 0;

    for (const memberId of association.所有成员) {
        const memberData = await Read_player(memberId);
        if (!memberData) continue;

        let power;
        if (type === 'attack') {
            power = memberData.攻击 + memberData.血量上限 * 0.5;
        } else {
            power = memberData.防御 + memberData.血量上限 * 0.5;
        }

        totalPower += Math.trunc(power);
    }

    return totalPower;
}

/**
 * 灵脉开采逻辑
 * @param {string} userId 玩家ID
 * @returns {Promise<{success: boolean, message: string, data?: object}>}
 */
export async function exploreLingmai(userId) {
    const allData = await DAL.getAllPlayerData(userId);
    if (!allData) {
        return { success: false, message: '玩家数据不存在' };
    }

    const { player } = allData;
    if (!isNotNull(player.宗门)) {
        return { success: false, message: '你尚未加入宗门' };
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    if (!ass) {
        return { success: false, message: '宗门数据不存在' };
    }

    if (ass.宗门驻地 === 0) {
        return { success: false, message: '你的宗门还没有驻地，无法开采灵脉' };
    }

    // 检查开采时间间隔
    const lastExploreTime = await checkLastExploreTime(userId);
    if (lastExploreTime) {
        return { success: false, message: `距离上次开采灵脉不足2小时，还需等待${lastExploreTime}` };
    }

    // 计算开采收益
    const dongTan = data.bless_list.find(item => item.name === ass.宗门驻地);
    if (!dongTan) {
        return { success: false, message: '驻地数据异常' };
    }

    const baseReward = dongTan.level * 1000;
    const levelBonus = Math.trunc(player.level_id * 100);
    const totalReward = baseReward + levelBonus;

    // 使用事务更新数据
    const updateSuccess = await DAL.transaction_update(userId, (playerData) => {
        playerData.灵石 += totalReward;
        return true;
    });

    if (!updateSuccess) {
        return { success: false, message: '开采灵脉失败，请重试' };
    }

    // 更新宗门灵石池
    const poolReward = Math.trunc(totalReward * 0.1);
    ass.灵石池 += poolReward;
    await DAL.saveAssociation(ass.宗门名称, ass);

    // 设置开采时间
    const now = new Date().getTime();
    await redis.set(`xiuxian:player:${userId}:getLastsign_Explor`, now, 'EX', 7200); // 2小时

    return {
        success: true,
        message: `开采灵脉成功，获得${totalReward}灵石，宗门灵石池增加${poolReward}灵石`,
        data: { reward: totalReward, poolReward }
    };
}

/**
 * 检查上次开采时间
 * @param {string} userId 玩家ID
 * @returns {Promise<string|null>} 返回剩余等待时间或null
 */
export async function checkLastExploreTime(userId) {
    const time = await redis.get(`xiuxian:player:${userId}:getLastsign_Explor`);
    if (!time) return null;

    const lastTime = parseInt(time);
    const now = new Date().getTime();
    const timeDiff = now - lastTime;
    const requiredInterval = 2 * 60 * 60 * 1000; // 2小时

    if (timeDiff < requiredInterval) {
        const remainingTime = requiredInterval - timeDiff;
        const hours = Math.floor(remainingTime / (60 * 60 * 1000));
        const minutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));
        return `${hours}小时${minutes}分钟`;
    }

    return null;
}

/**
 * 宗门建设逻辑
 * @param {string} userId 玩家ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function buildGuild(userId) {
    const allData = await DAL.getAllPlayerData(userId);
    if (!allData) {
        return { success: false, message: '玩家数据不存在' };
    }

    const { player } = allData;
    if (!isNotNull(player.宗门)) {
        return { success: false, message: '你尚未加入宗门' };
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    if (!ass) {
        return { success: false, message: '宗门数据不存在' };
    }

    if (ass.宗门驻地 === 0) {
        return { success: false, message: '你的宗门还没有驻地，无法建设宗门' };
    }

    // 确保数据完整性
    if (!ass.宗门建设等级 || ass.宗门建设等级 < 0) {
        ass.宗门建设等级 = 0;
    }
    if (!ass.灵石池 || ass.灵石池 < 0) {
        ass.灵石池 = 0;
    }

    const currentLevel = Number(ass.宗门建设等级);
    const requiredCost = Math.trunc(currentLevel * 10000);

    if (ass.灵石池 < requiredCost) {
        return { success: false, message: `宗门灵石池不足，还需[${requiredCost}]灵石` };
    }

    // 计算建设增加值
    const buildIncrease = Math.trunc(player.level_id / 7);

    // 更新宗门数据
    ass.灵石池 -= requiredCost;
    ass.宗门建设等级 += buildIncrease;
    await DAL.saveAssociation(ass.宗门名称, ass);

    return {
        success: true,
        message: `成功消耗宗门${requiredCost}灵石建设宗门，增加了${buildIncrease}点建设度，当前宗门建设等级为${ass.宗门建设等级}`
    };
}

/**
 * 探索宗门秘境逻辑
 * @param {string} userId 玩家ID
 * @param {string} secretPlace 秘境名称
 * @param {number} times 探索次数
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function exploreSecretPlace(userId, secretPlace, times = 1) {
    const allData = await DAL.getAllPlayerData(userId);
    if (!allData) {
        return { success: false, message: '玩家数据不存在' };
    }

    const { player } = allData;
    if (!isNotNull(player.宗门)) {
        return { success: false, message: '你尚未加入宗门' };
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    if (!ass) {
        return { success: false, message: '宗门数据不存在' };
    }

    // 检查秘境是否存在
    const weizhi = data.guildSecrets_list.find(item => item.name === secretPlace);
    if (!weizhi) {
        return { success: false, message: '该秘境不存在' };
    }

    // 检查宗门驻地等级要求
    if (ass.宗门驻地 === 0) {
        return { success: false, message: '你的宗门还没有驻地，无法探索秘境' };
    }

    const dongTan = data.bless_list.find(item => item.name === ass.宗门驻地);
    if (!dongTan || dongTan.level < weizhi.Grade) {
        return { success: false, message: `你的宗门驻地等级不足，需要${weizhi.Grade}级驻地` };
    }

    // 检查秘境之匙
    const keyCount = await exist_najie_thing(userId, "秘境之匙", "道具");
    if (!isNotNull(keyCount) || keyCount < times) {
        return { success: false, message: '你没有足够数量的秘境之匙' };
    }

    // 检查玩家状态
    const action = await redis.get(`xiuxian:player:${userId}:action`);
    if (action) {
        const actionData = JSON.parse(action);
        const now = new Date().getTime();
        if (actionData && actionData.end_time > now) {
            const remainingTime = actionData.end_time - now;
            const minutes = Math.floor(remainingTime / (60 * 1000));
            const seconds = Math.floor((remainingTime % (60 * 1000)) / 1000);
            return { success: false, message: `正在${actionData.action}中，剩余时间:${minutes}分${seconds}秒` };
        }
    }

    // 消耗秘境之匙
    await Add_najie_thing(userId, "秘境之匙", "道具", -times);

    // 计算消耗和收益
    const totalCost = weizhi.Price * times * 10;
    const poolIncome = totalCost * 0.05;
    const exploreTime = times * 10 * 5 + 10; // 分钟

    // 使用事务更新玩家数据
    const updateSuccess = await DAL.transaction_update(userId, (playerData) => {
        if (playerData.灵石 < totalCost) {
            return false;
        }
        playerData.灵石 -= totalCost;
        return true;
    });

    if (!updateSuccess) {
        // 回退秘境之匙
        await Add_najie_thing(userId, "秘境之匙", "道具", times);
        return { success: false, message: '灵石不足' };
    }

    // 更新宗门灵石池
    ass.灵石池 += poolIncome;
    await DAL.saveAssociation(ass.宗门名称, ass);

    // 设置玩家动作状态
    const actionTime = exploreTime * 60 * 1000; // 毫秒
    const now = new Date().getTime();
    const actionData = {
        action: '沉迷宗门秘境',
        start_time: now,
        end_time: now + actionTime,
        location: `${secretPlace}-${ass.power}`,
        times: times * 10
    };

    await redis.set(`xiuxian:player:${userId}:action`, JSON.stringify(actionData), 'EX', Math.ceil(actionTime / 1000));

    return {
        success: true,
        message: `开始沉迷宗门秘境${secretPlace}，${exploreTime}分钟后归来!`
    };
}

/**
 * 处理秘境战斗结算
 * @param {string} userId 玩家ID
 * @param {object} secretPlace 秘境数据
 * @returns {Promise<{success: boolean, message: string, data?: object}>}
 */
export async function handleSecretPlaceBattle(userId, secretPlace) {
    const player = await Read_player(userId);
    if (!player) {
        return { success: false, message: '玩家数据不存在' };
    }

    // 确保玩家有灵根
    if (!player.灵根) {
        player.灵根 = await get_random_talent();
        player.修炼效率提升 += player.灵根.eff;
        await DAL.setPlayerData(userId, player);
    }

    // 构建玩家战斗数据
    const playerBattle = {
        名号: player.名号,
        攻击: player.攻击,
        防御: player.防御,
        当前血量: player.当前血量,
        暴击率: player.暴击率,
        法球倍率: player.灵根.法球倍率
    };

    // 随机生成怪物
    const monsterList = data.monster_list;
    const randomIndex = Math.floor(Math.random() * monsterList.length);
    const monster = monsterList[randomIndex];

    const monsterBattle = {
        名号: monster.名号,
        攻击: parseInt(player.攻击 * monster.攻击),
        防御: parseInt(player.防御 * monster.防御),
        当前血量: parseInt(player.血量上限 * monster.当前血量),
        暴击率: monster.暴击率,
        法球倍率: 0
    };

    // 进行战斗
    const battleResult = await Getmsg_battle(playerBattle, monsterBattle);
    const isPlayerWin = battleResult.msg.includes(`${playerBattle.名号}击败了${monsterBattle.名号}`);

    let xiuwei = 0;
    let reward = null;
    let resultMessage = '';

    if (isPlayerWin) {
        // 玩家胜利
        const levelData = data.Level_list.find(item => item.level_id === player.level_id);
        xiuwei = parseInt(2000 + levelData.level_id * levelData.level_id);

        // 随机奖励
        const rewardData = generateSecretPlaceReward(secretPlace);
        reward = rewardData.reward;

        // 添加奖励到纳戒
        if (reward.class === "装备") {
            const qualities = ['劣', '普', '优', '精', '极', '绝', '顶'];
            const randomQuality = qualities[Math.floor(Math.random() * 6)];
            await Add_najie_thing(userId, reward.name, reward.class, 1, randomQuality);
        } else {
            await Add_najie_thing(userId, reward.name, reward.class, 1);
        }

        resultMessage = `${rewardData.message}在历练的过程中,遇到[${monsterBattle.名号}],经过一番战斗,击败对手,获得修为[${xiuwei}]并且在他身后的密室发现了[${reward.name}]`;
    } else {
        // 玩家失败
        xiuwei = 1000;
        resultMessage = `在历练的过程中,遇到[${monsterBattle.名号}],经过一番战斗,败下阵来,还好跑得快,只获得了修为[${xiuwei}]`;
    }

    // 更新玩家数据
    await Add_修为(userId, xiuwei);
    await Add_HP(userId, battleResult.A_xue);

    return {
        success: true,
        message: resultMessage,
        data: {
            xiuwei,
            reward,
            battleResult: battleResult.msg
        }
    };
}

/**
 * 生成秘境奖励
 * @param {object} secretPlace 秘境数据
 * @returns {object} 奖励数据
 */
function generateSecretPlaceReward(secretPlace) {
    const random1 = Math.random();
    const random2 = Math.random();
    const random3 = Math.random();

    let reward;
    let message;

    if (random1 < 1.0) {
        if (random2 < 0.5) {
            if (random3 < 0.12) {
                // 三级奖励
                const randomIndex = Math.floor(Math.random() * secretPlace.three.length);
                reward = secretPlace.three[randomIndex];
                message = "天地大变，金光一闪！[" + reward.name + "]从天而降";
            } else {
                // 二级奖励
                const randomIndex = Math.floor(Math.random() * secretPlace.two.length);
                reward = secretPlace.two[randomIndex];
                message = "在洞穴中拿到[" + reward.name + "]";
            }
        } else {
            // 一级奖励
            const randomIndex = Math.floor(Math.random() * secretPlace.one.length);
            reward = secretPlace.one[randomIndex];
            message = "捡到了[" + reward.name + "] ";
        }
    } else {
        // 默认二级奖励
        const randomIndex = Math.floor(Math.random() * secretPlace.two.length);
        reward = secretPlace.two[randomIndex];
        message = "遇到了[" + reward.name + "]";
    }

    return { reward, message };
}

// 辅助函数
function isNotNull(obj) {
    return obj !== undefined && obj !== null;
}