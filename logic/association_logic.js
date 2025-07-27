import * as DAL from '../api/data-access.js';
import data from '../model/XiuxianData.js';
import config from '../model/Config.js';
import fs from 'fs';
import { timestampToTime, shijianc, get_random_fromARR, player_efficiency } from '../apps/Xiuxian/xiuxian.js';

// 宗门配置常量
const 宗门人数上限 = [6, 9, 12, 15, 18, 21, 24, 27];
const 宗门灵石池上限 = [2000000, 5000000, 8000000, 11000000, 15000000, 20000000, 25000000, 30000000];

/**
 * 宗门俸禄领取逻辑
 * @param {string} userId 玩家ID
 * @returns {Promise<{success: boolean, message: string, data?: object}>}
 */
export async function handleAssociationSalary(userId) {
    const allData = await DAL.getAllPlayerData(userId);
    if (!allData) {
        return { success: false, message: '玩家数据不存在' };
    }

    const { player } = allData;
    if (!isNotNull(player.宗门)) {
        return { success: false, message: '你还没有加入宗门' };
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    if (!ass) {
        return { success: false, message: '宗门数据不存在' };
    }

    const ismt = isNotMaintenance(ass);
    if (ismt) {
        return { success: false, message: '宗门尚未维护，快找宗主维护宗门' };
    }

    const now = new Date();
    const nowTime = now.getTime();
    const Today = await shijianc(nowTime);
    const lastsign_time = await getLastsign_Asso(userId);

    if (Today.Y == lastsign_time.Y && Today.M == lastsign_time.M && Today.D == lastsign_time.D) {
        return { success: false, message: '今日已经领取过了' };
    }

    const temp = player.宗门.职位;
    let n = 1;
    if (temp == "外门弟子" || temp == "内门弟子") {
        return { success: false, message: '没有资格领取俸禄' };
    }
    if (temp == "长老") n = 3;
    if (temp == "副宗主") n = 4;
    if (temp == "宗主") n = 5;

    const fuli = Number(Math.trunc(ass.宗门建设等级 * 2000));
    let gift_lingshi = Math.trunc(ass.宗门等级 * 1200 * n + fuli);
    gift_lingshi = gift_lingshi / 2;

    if ((ass.灵石池 - gift_lingshi) < 0) {
        return { success: false, message: '宗门灵石池不够发放俸禄啦，快去为宗门做贡献吧' };
    }

    // 使用事务更新玩家和宗门数据
    const updateSuccess = await DAL.transaction_update(userId, (playerData) => {
        playerData.灵石 += gift_lingshi;
        return true;
    });

    if (!updateSuccess) {
        return { success: false, message: '领取俸禄失败，请重试' };
    }

    // 更新宗门灵石池
    ass.灵石池 -= gift_lingshi;
    await DAL.saveAssociation(ass.宗门名称, ass);

    // 设置签到时间
    await redis.set("xiuxian:player:" + userId + ":lastsign_Asso_time", nowTime);

    return {
        success: true,
        message: `宗门俸禄领取成功,获得了${gift_lingshi}灵石`,
        data: { gift_lingshi }
    };
}

/**
 * 加入宗门逻辑
 * @param {string} userId 玩家ID
 * @param {string} associationName 宗门名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function handleJoinAssociation(userId, associationName) {
    const allData = await DAL.getAllPlayerData(userId);
    if (!allData) {
        return { success: false, message: '玩家数据不存在' };
    }

    const { player } = allData;
    if (isNotNull(player.宗门)) {
        return { success: false, message: '你已经加入了宗门' };
    }

    const ass = await DAL.getAssociation(associationName);
    if (!ass) {
        return { success: false, message: `这方天地不存在${associationName}` };
    }

    const now_level_id = data.Level_list.find(item => item.level_id == player.level_id).level_id;

    // 检查仙界/凡界限制
    if (now_level_id >= 42 && ass.power == 0) {
        return { success: false, message: '仙人不可下界！' };
    }
    if (now_level_id < 42 && ass.power == 1) {
        return { success: false, message: '你在仙界吗？就去仙界宗门' };
    }

    // 检查境界要求
    if (ass.最低加入境界 > now_level_id) {
        const level = data.Level_list.find(item => item.level_id === ass.最低加入境界).level;
        return { success: false, message: `${associationName}招收弟子的最低境界要求为:${level},当前未达到要求` };
    }

    // 检查人数限制
    const mostmem = 宗门人数上限[ass.宗门等级 - 1];
    const nowmem = ass.所有成员.length;
    if (mostmem <= nowmem) {
        return { success: false, message: `${associationName}的弟子人数已经达到目前等级最大,无法加入` };
    }

    const now = new Date();
    const nowTime = now.getTime();
    const date = timestampToTime(nowTime);

    // 使用事务更新玩家数据
    const updateSuccess = await DAL.transaction_update(userId, (playerData) => {
        playerData.宗门 = {
            "宗门名称": associationName,
            "职位": "外门弟子",
            "time": [date, nowTime]
        };
        return true;
    });

    if (!updateSuccess) {
        return { success: false, message: '加入宗门失败，请重试' };
    }

    // 更新宗门成员列表
    ass.所有成员.push(userId);
    ass.外门弟子.push(userId);
    await DAL.saveAssociation(associationName, ass);

    // 更新玩家效率
    await player_efficiency(userId);

    return { success: true, message: `恭喜你成功加入${associationName}` };
}

/**
 * 退出宗门逻辑
 * @param {string} userId 玩家ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function handleExitAssociation(userId) {
    const xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    const allData = await DAL.getAllPlayerData(userId);
    if (!allData) {
        return { success: false, message: '玩家数据不存在' };
    }

    const { player } = allData;
    if (!isNotNull(player.宗门)) {
        return { success: false, message: '你还没有加入宗门' };
    }

    const now = new Date();
    const nowTime = now.getTime();
    let addTime;
    const time = xiuxianConfigData.CD.joinassociation;

    if (typeof player.宗门.time == 'undefined') {
        addTime = player.宗门.加入时间[1] + 60000 * time;
    } else {
        addTime = player.宗门.time[1] + 60000 * time;
    }

    if (addTime > nowTime) {
        return { success: false, message: `加入宗门不满${time}分钟,无法退出` };
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    if (!ass) {
        return { success: false, message: '宗门数据不存在' };
    }

    let resultMessage = '';

    if (player.宗门.职位 != "宗主") {
        // 普通成员退出
        ass[player.宗门.职位] = ass[player.宗门.职位].filter(item => item != userId);
        ass["所有成员"] = ass["所有成员"].filter(item => item != userId);
        await DAL.saveAssociation(ass.宗门名称, ass);

        const updateSuccess = await DAL.transaction_update(userId, (playerData) => {
            delete playerData.宗门;
            playerData.favorability = 0;
            return true;
        });

        if (!updateSuccess) {
            return { success: false, message: '退出宗门失败，请重试' };
        }

        await player_efficiency(userId);
        resultMessage = "退出宗门成功";
    } else {
        // 宗主退出
        if (ass.所有成员.length < 2) {
            // 宗门解散
            await redis.del(`XinghanXiuxian:Data:Association:${player.宗门.宗门名称}`);

            const updateSuccess = await DAL.transaction_update(userId, (playerData) => {
                delete playerData.宗门;
                playerData.favorability = 0;
                return true;
            });

            if (!updateSuccess) {
                return { success: false, message: '退出宗门失败，请重试' };
            }

            await player_efficiency(userId);
            resultMessage = "退出宗门成功,退出后宗门空无一人。\n一声巨响,原本的宗门轰然倒塌,随着流沙沉没,世间再无半分痕迹";
        } else {
            // 宗主禅让
            ass["所有成员"] = ass["所有成员"].filter(item => item != userId);

            // 选择新宗主
            let randmember_qq;
            if (ass.副宗主.length > 0) {
                randmember_qq = await get_random_fromARR(ass.副宗主);
            } else if (ass.长老.length > 0) {
                randmember_qq = await get_random_fromARR(ass.长老);
            } else if (ass.内门弟子.length > 0) {
                randmember_qq = await get_random_fromARR(ass.内门弟子);
            } else {
                randmember_qq = await get_random_fromARR(ass.所有成员);
            }

            const randmemberData = await DAL.getAllPlayerData(randmember_qq);
            if (!randmemberData) {
                return { success: false, message: '无法找到合适的继任者' };
            }

            const randmember = randmemberData.player;
            ass[randmember.宗门.职位] = ass[randmember.宗门.职位].filter((item) => item != randmember_qq);
            ass["宗主"] = randmember_qq;

            // 更新新宗主数据
            await DAL.transaction_update(randmember_qq, (playerData) => {
                playerData.宗门.职位 = "宗主";
                return true;
            });

            // 更新原宗主数据
            const updateSuccess = await DAL.transaction_update(userId, (playerData) => {
                delete playerData.宗门;
                playerData.favorability = 0;
                return true;
            });

            if (!updateSuccess) {
                return { success: false, message: '退出宗门失败，请重试' };
            }

            await DAL.saveAssociation(ass.宗门名称, ass);
            await player_efficiency(userId);
            resultMessage = `退出宗门成功,退出后,宗主职位由${randmember.名号}接管`;
        }
    }

    return { success: true, message: resultMessage };
}

/**
 * 宗门捐赠灵石逻辑
 * @param {string} userId 玩家ID
 * @param {number} lingshi 捐赠数量
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function handleDonateAssociation(userId, lingshi) {
    const allData = await DAL.getAllPlayerData(userId);
    if (!allData) {
        return { success: false, message: '玩家数据不存在' };
    }

    const { player } = allData;
    if (!isNotNull(player.宗门)) {
        return { success: false, message: '你还没有加入宗门' };
    }

    if (player.灵石 < lingshi) {
        return { success: false, message: `你身上只有${player.灵石}灵石,数量不足` };
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    if (!ass) {
        return { success: false, message: '宗门数据不存在' };
    }

    let xf = 1;
    if (ass.power == 1) {
        xf = 10;
    }

    const maxCapacity = (宗门灵石池上限[ass.宗门等级 - 1]) * xf;
    if (ass.灵石池 + lingshi > maxCapacity) {
        return { success: false, message: `${ass.宗门名称}的灵石池最多还能容纳${maxCapacity - ass.灵石池}灵石,请重新捐赠` };
    }

    // 使用事务更新玩家数据
    const updateSuccess = await DAL.transaction_update(userId, (playerData) => {
        playerData.灵石 -= lingshi;
        if (!isNotNull(playerData.宗门.lingshi_donate)) {
            playerData.宗门.lingshi_donate = 0;
        }
        playerData.宗门.lingshi_donate += lingshi;
        return true;
    });

    if (!updateSuccess) {
        return { success: false, message: '捐赠失败，请重试' };
    }

    // 更新宗门灵石池
    ass.灵石池 += lingshi;
    await DAL.saveAssociation(ass.宗门名称, ass);

    return {
        success: true,
        message: `捐赠成功,你身上还有${player.灵石 - lingshi}灵石,宗门灵石池目前有${ass.灵石池}灵石`
    };
}

/**
 * 获取宗门捐献记录
 * @param {string} userId 玩家ID
 * @returns {Promise<{success: boolean, message?: string, data?: object}>}
 */
export async function getAssociationDonateLog(userId) {
    const allData = await DAL.getAllPlayerData(userId);
    if (!allData) {
        return { success: false, message: '玩家数据不存在' };
    }

    const { player } = allData;
    if (!isNotNull(player.宗门)) {
        return { success: false, message: '你还没有加入宗门' };
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    if (!ass) {
        return { success: false, message: '宗门数据不存在' };
    }

    const donate_list = [];
    for (let i in ass.所有成员) {
        const member_qq = ass.所有成员[i];
        const member_data_all = await DAL.getAllPlayerData(member_qq);
        if (!member_data_all) continue;

        const member_data = member_data_all.player;
        if (!isNotNull(member_data.宗门.lingshi_donate)) {
            member_data.宗门.lingshi_donate = 0;
        }
        donate_list[i] = {
            "name": member_data.名号,
            "lingshi_donate": member_data.宗门.lingshi_donate,
        };
    }

    donate_list.sort(sortBy("lingshi_donate"));

    return {
        success: true,
        data: {
            associationName: ass.宗门名称,
            donateList: donate_list
        }
    };
}

/**
 * 获取宗门列表
 * @returns {Promise<{success: boolean, data?: object}>}
 */
export async function getAssociationList() {
    // 通过 Redis 扫描获取所有宗门
    const keys = await redis.keys('XinghanXiuxian:Data:Association:*');
    const associations = [];

    for (const key of keys) {
        const associationName = key.replace('XinghanXiuxian:Data:Association:', '');
        const ass = await DAL.getAssociation(associationName);
        if (!ass) continue;

        // 处理宗门效率
        let this_ass_xiuxian = 0;
        if (ass.宗门驻地 == 0) {
            this_ass_xiuxian = ass.宗门等级 * 0.05 * 100;
        } else {
            const dongTan = await data.bless_list.find(item => item.name == ass.宗门驻地);
            this_ass_xiuxian = ass.宗门等级 * 0.05 * 100 + dongTan.level * 10;
        }
        this_ass_xiuxian = Math.trunc(this_ass_xiuxian);

        const shenshou = ass.宗门神兽 == 0 ? "暂无" : ass.宗门神兽;
        const zhudi = ass.宗门驻地 == 0 ? "暂无" : ass.宗门驻地;
        const power = ass.power == 0 ? "凡界" : "仙界";
        const level = data.Level_list.find(item => item.level_id == ass.最低加入境界).level;

        associations.push({
            序号: associations.length + 1,
            宗门名称: ass.宗门名称,
            人数: `${ass.所有成员.length}/${宗门人数上限[ass.宗门等级 - 1]}`,
            位置: power,
            等级: ass.宗门等级,
            天赋加成: `${this_ass_xiuxian}%`,
            宗门建设等级: ass.宗门建设等级,
            镇宗神兽: shenshou,
            宗门驻地: zhudi,
            最低加入境界: level,
            宗主: ass.宗主
        });
    }

    return {
        success: true,
        data: { associations }
    };
}

// 辅助函数
function isNotMaintenance(ass) {
    const now = new Date();
    const nowTime = now.getTime();
    if (ass.维护时间 > nowTime - 1000 * 60 * 60 * 24 * 7) {
        return false;
    }
    return true;
}

function isNotNull(obj) {
    if (obj == undefined || obj == null)
        return false;
    return true;
}

function sortBy(field) {
    return function (b, a) {
        return a[field] - b[field];
    };
}

async function getLastsign_Asso(usr_qq) {
    const time = await redis.get("xiuxian:player:" + usr_qq + ":lastsign_Asso_time");
    if (time != null) {
        const data = await shijianc(parseInt(time));
        return data;
    }
    return false;
}