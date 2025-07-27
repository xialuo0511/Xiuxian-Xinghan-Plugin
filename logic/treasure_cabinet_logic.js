import * as DAL from '../api/data-access.js';
import data from '../model/XiuxianData.js';
import {
    isNotNull,
    Add_najie_thing,
    exist_najie_thing,
    Locked_najie_thing,
    foundthing,
    Check_thing,
    convert2integer,
    Read_najie,
    shijianc
} from '../apps/Xiuxian/xiuxian.js';

/**
 * 获取宗门藏宝阁列表
 * @param {string} userId 用户ID
 * @returns {Promise<{success: boolean, data?: object, message?: string}>}
 */
export async function getTreasureCabinetList(userId) {
    try {
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

        // 初始化藏宝阁字段
        if (!isNotNull(ass.藏宝阁)) {
            ass.藏宝阁 = [];
            await DAL.saveAssociation(ass.宗门名称, ass);
        }

        if (ass.宗门建设等级 < 10) {
            return { success: false, message: '藏宝阁尚未完工(建设等级至少10级哦)' };
        }

        return {
            success: true,
            data: {
                items: ass.藏宝阁,
                guildName: ass.宗门名称
            }
        };
    } catch (error) {
        return { success: false, message: '获取藏宝阁列表失败' };
    }
}

/**
 * 兑换藏宝阁物品
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @param {number} quantity 数量
 * @param {string} quality 品级（装备用）
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function exchangeTreasureItem(userId, itemName, quantity = 1, quality = null) {
    try {
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

        if (!isNotNull(ass.藏宝阁)) {
            return { success: false, message: '藏宝阁为空' };
        }

        if (ass.宗门建设等级 < 10) {
            return { success: false, message: '藏宝阁尚未完工(建设等级至少10级哦)' };
        }

        // 查找物品
        const pinji = ['劣', '普', '优', '精', '极', '绝', '顶'];
        let itemIndex = -1;

        for (let i = 0; i < ass.藏宝阁.length; i++) {
            if (quality && ass.藏宝阁[i].name === itemName && pinji[ass.藏宝阁[i].pinji] === quality) {
                itemIndex = i;
                break;
            } else if (!quality && ass.藏宝阁[i].name === itemName) {
                itemIndex = i;
                break;
            }
        }

        if (itemIndex === -1) {
            return { success: false, message: '藏宝阁没有这种东西！' };
        }

        const item = ass.藏宝阁[itemIndex];
        if (item.aconut < quantity) {
            return { success: false, message: '就这么点东西,还想要更多？' };
        }

        // 计算贡献值
        const totalCost = item.price * quantity;
        const contribution = Math.trunc(player.宗门.lingshi_donate / 10000);

        if (contribution < totalCost) {
            return { success: false, message: '醒醒，你没有为宗门做那么多贡献！' };
        }

        // 执行兑换
        const updateSuccess = await DAL.transaction_update(userId, (playerData) => {
            playerData.宗门.lingshi_donate = Math.trunc((contribution - totalCost) * 10000);
            return true;
        });

        if (!updateSuccess) {
            return { success: false, message: '兑换失败，请重试' };
        }

        // 添加物品到纳戒
        let qualityMsg = '';
        if (item.class === '装备') {
            qualityMsg = `【${pinji[item.pinji]}】`;
            await Add_najie_thing(userId, item.name, item.class, quantity, item.pinji);
        } else {
            await Add_najie_thing(userId, item.name, item.class, quantity);
        }

        // 更新藏宝阁库存
        if (item.aconut - quantity > 0) {
            ass.藏宝阁[itemIndex].aconut -= quantity;
        } else {
            ass.藏宝阁.splice(itemIndex, 1);
        }
        await DAL.saveAssociation(ass.宗门名称, ass);

        return {
            success: true,
            message: `兑换成功! 获得[${item.name}${qualityMsg}]x${quantity},消耗了[${totalCost}]贡献值,剩余[${contribution - totalCost}]贡献值\n可以在【我的纳戒】中查看`
        };
    } catch (error) {
        return { success: false, message: '兑换物品失败' };
    }
}

/**
 * 放入物品到藏宝阁
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @param {number} price 价格
 * @param {number} quantity 数量
 * @param {string} quality 品级（装备用）
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function putItemToTreasure(userId, itemName, price, quantity, quality = null) {
    try {
        const allData = await DAL.getAllPlayerData(userId);
        if (!allData) {
            return { success: false, message: '玩家数据不存在' };
        }

        const { player, najie } = allData;
        if (!isNotNull(player.宗门)) {
            return { success: false, message: '你尚未加入宗门' };
        }

        if (player.宗门.职位 !== '宗主' && player.宗门.职位 !== '副宗主') {
            return { success: false, message: '只有宗主、副宗主可以放入' };
        }

        const ass = await DAL.getAssociation(player.宗门.宗门名称);
        if (!ass) {
            return { success: false, message: '宗门数据不存在' };
        }

        if (!isNotNull(ass.藏宝阁)) {
            ass.藏宝阁 = [];
            await DAL.saveAssociation(ass.宗门名称, ass);
        }

        if (ass.宗门建设等级 < 10) {
            return { success: false, message: '藏宝阁尚未完工(建设等级至少10级哦)' };
        }

        if (quantity > 99) {
            return { success: false, message: '阁主:你想把藏宝阁淹了吗？' };
        }

        // 验证物品存在
        const itemData = await foundthing(itemName);
        if (!itemData) {
            return { success: false, message: `这方世界没有[${itemName}]` };
        }

        if (await Check_thing(itemData) === 1) {
            return { success: false, message: `${itemData.name}特殊！` };
        }

        // 检查纳戒中的物品
        const pinji = ['劣', '普', '优', '精', '极', '绝', '顶'];
        let hasEnough = false;
        let qualityIndex = -1;

        if (itemData.class === '装备') {
            if (!quality) {
                return { success: false, message: '未输入品级' };
            }
            qualityIndex = pinji.indexOf(quality);
            if (qualityIndex === -1) {
                return { success: false, message: '品级输入错误' };
            }

            const equipItem = najie.装备.find(item => item.name === itemName && item.pinji === qualityIndex);
            if (!equipItem || equipItem.数量 < quantity) {
                return { success: false, message: `你目前只有[${itemName}【${quality}】]*${equipItem?.数量 || 0}` };
            }
        } else {
            const itemQuantity = await exist_najie_thing(userId, itemName, itemData.class);
            if (!itemQuantity || itemQuantity < quantity) {
                return { success: false, message: `你目前只有[${itemName}]*${itemQuantity || 0}` };
            }
        }

        // 扣除纳戒中的物品
        if (itemData.class === '装备') {
            await Add_najie_thing(userId, itemName, itemData.class, -quantity, qualityIndex);
        } else {
            await Add_najie_thing(userId, itemName, itemData.class, -quantity);
        }

        // 检查是否可以堆叠
        let existingIndex = -1;
        for (let i = 0; i < ass.藏宝阁.length; i++) {
            if (ass.藏宝阁[i].name === itemName) {
                if (itemData.class === '装备') {
                    if (pinji[ass.藏宝阁[i].pinji] === quality) {
                        existingIndex = i;
                        break;
                    }
                } else {
                    existingIndex = i;
                    break;
                }
            }
        }

        if (existingIndex === -1) {
            // 新增物品
            let newItem;
            if (itemData.class === '装备') {
                const equipData = najie.装备.find(item => item.name === itemName && item.pinji === qualityIndex);
                newItem = {
                    name: itemName,
                    class: itemData.class,
                    price: Math.trunc(price),
                    aconut: Math.trunc(quantity),
                    atk: equipData?.atk || 0,
                    def: equipData?.def || 0,
                    HP: equipData?.HP || 0,
                    bao: equipData?.bao || 0,
                    pinji: qualityIndex
                };
            } else {
                newItem = {
                    name: itemName,
                    class: itemData.class,
                    price: Math.trunc(price),
                    aconut: Math.trunc(quantity)
                };
            }
            ass.藏宝阁.push(newItem);
            await DAL.saveAssociation(ass.宗门名称, ass);
            return { success: true, message: '放入成功！' };
        } else {
            // 堆叠物品
            ass.藏宝阁[existingIndex].aconut += Math.trunc(quantity);
            await DAL.saveAssociation(ass.宗门名称, ass);
            return {
                success: true,
                message: `放入了${quantity}个,当前数量为${ass.藏宝阁[existingIndex].aconut}`
            };
        }
    } catch (error) {
        return { success: false, message: '放入物品失败' };
    }
}

/**
 * 收回藏宝阁物品
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @param {string} quality 品级（装备用）
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function retrieveItemFromTreasure(userId, itemName, quality = null) {
    try {
        const allData = await DAL.getAllPlayerData(userId);
        if (!allData) {
            return { success: false, message: '玩家数据不存在' };
        }

        const { player } = allData;
        if (!isNotNull(player.宗门)) {
            return { success: false, message: '你尚未加入宗门' };
        }

        if (player.宗门.职位 !== '宗主') {
            return { success: false, message: '只有宗主可以取回' };
        }

        const ass = await DAL.getAssociation(player.宗门.宗门名称);
        if (!ass) {
            return { success: false, message: '宗门数据不存在' };
        }

        if (!isNotNull(ass.藏宝阁)) {
            return { success: false, message: '藏宝阁为空' };
        }

        if (ass.宗门建设等级 < 10) {
            return { success: false, message: '藏宝阁尚未完工(建设等级至少10级哦)' };
        }

        // 查找物品
        const pinji = ['劣', '普', '优', '精', '极', '绝', '顶'];
        let itemIndex = -1;

        for (let i = 0; i < ass.藏宝阁.length; i++) {
            if (quality && ass.藏宝阁[i].name === itemName && pinji[ass.藏宝阁[i].pinji] === quality) {
                itemIndex = i;
                break;
            } else if (!quality && ass.藏宝阁[i].name === itemName) {
                itemIndex = i;
                break;
            }
        }

        if (itemIndex === -1) {
            return { success: false, message: '藏宝阁没有这种东西！' };
        }

        const item = ass.藏宝阁[itemIndex];

        // 添加到纳戒
        if (item.class === '装备') {
            await Add_najie_thing(userId, item.name, item.class, item.aconut, item.pinji);
        } else {
            await Add_najie_thing(userId, item.name, item.class, item.aconut);
        }

        // 从藏宝阁移除
        ass.藏宝阁.splice(itemIndex, 1);
        await DAL.saveAssociation(ass.宗门名称, ass);

        return { success: true, message: '取回成功' };
    } catch (error) {
        return { success: false, message: '取回物品失败' };
    }
}

/**
 * 获取玩家贡献值
 * @param {string} userId 用户ID
 * @returns {Promise<{success: boolean, contribution?: number, message?: string}>}
 */
export async function getPlayerContribution(userId) {
    try {
        const allData = await DAL.getAllPlayerData(userId);
        if (!allData) {
            return { success: false, message: '玩家数据不存在' };
        }

        const { player } = allData;
        if (!isNotNull(player.宗门)) {
            return { success: false, message: '你尚未加入宗门' };
        }

        if (!isNotNull(player.宗门.lingshi_donate)) {
            player.宗门.lingshi_donate = 0;
        }
        if (player.宗门.lingshi_donate < 0) {
            player.宗门.lingshi_donate = 0;
        }

        const contribution = Math.trunc(player.宗门.lingshi_donate / 10000);
        return {
            success: true,
            contribution,
            message: `你为宗门的贡献值为[${contribution}],可以在#宗门藏宝阁 使用贡献值兑换宗门物品,感谢您对宗门做出的贡献`
        };
    } catch (error) {
        return { success: false, message: '获取贡献值失败' };
    }
}

/**
 * 召唤宗门神兽
 * @param {string} userId 用户ID
 * @returns {Promise<{success: boolean, message: string, beast?: string}>}
 */
export async function summonDivineBeast(userId) {
    try {
        const allData = await DAL.getAllPlayerData(userId);
        if (!allData) {
            return { success: false, message: '玩家数据不存在' };
        }

        const { player } = allData;
        if (!isNotNull(player.宗门)) {
            return { success: false, message: '你尚未加入宗门' };
        }

        if (player.宗门.职位 !== '宗主') {
            return { success: false, message: '只有宗主可以操作' };
        }

        const ass = await DAL.getAssociation(player.宗门.宗门名称);
        if (!ass) {
            return { success: false, message: '宗门数据不存在' };
        }

        if (ass.宗门等级 < 8) {
            return { success: false, message: '宗门等级不足，尚不具备召唤神兽的资格' };
        }

        if (ass.宗门建设等级 < 50) {
            return { success: false, message: '宗门建设等级不足,木头墙木头地板的不怕神兽把宗门拆了？' };
        }

        if (ass.宗门驻地 === 0) {
            return { success: false, message: '驻地都没有，让神兽跟你流浪啊？' };
        }

        if (ass.灵石池 < 2000000) {
            return { success: false, message: '宗门就这点钱，还想神兽跟着你干活？' };
        }

        if (ass.宗门神兽 !== 0) {
            return { success: false, message: '你的宗门已经有神兽了' };
        }

        // 随机选择神兽
        const random = Math.random();
        let beast;
        if (random > 0.92) {
            beast = '麒麟';
        } else if (random > 0.69) {
            beast = '青龙';
        } else if (random > 0.46) {
            beast = '玄武';
        } else if (random > 0.23) {
            beast = '朱雀';
        } else {
            beast = '白虎';
        }

        // 更新宗门数据
        ass.宗门神兽 = beast;
        ass.灵石池 -= 2000000;
        await DAL.saveAssociation(ass.宗门名称, ass);

        return {
            success: true,
            beast,
            message: `召唤成功，神兽${beast}投下一道分身，开始守护你的宗门，绑定神兽后不可更换哦`
        };
    } catch (error) {
        return { success: false, message: '召唤神兽失败' };
    }
}

/**
 * 喂养神兽
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @param {number} quantity 数量
 * @param {string} quality 品级（装备用）
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function feedDivineBeast(userId, itemName, quantity, quality = null) {
    try {
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

        if (ass.宗门神兽 === 0) {
            return { success: false, message: '你的宗门还没有神兽的护佑，快去召唤神兽吧' };
        }

        // 验证物品
        const itemData = await foundthing(itemName);
        if (!itemData) {
            return { success: false, message: `神兽不吃这样的东西:${itemName}` };
        }

        // 检查冷却时间
        const now = new Date().getTime();
        const feedTimeout = 120 * 60 * 1000; // 2小时
        const lastFeedTime = await redis.get(`xiuxian:player:${userId}:last_Feed_time`);

        if (lastFeedTime && now < parseInt(lastFeedTime) + feedTimeout) {
            const remaining = parseInt(lastFeedTime) + feedTimeout - now;
            const minutes = Math.trunc(remaining / 60 / 1000);
            const seconds = Math.trunc((remaining % 60000) / 1000);
            return { success: false, message: `喂养冷却: ${minutes}分 ${seconds}秒` };
        }

        // 检查物品数量
        const pj = { '劣': 0, '普': 1, '优': 2, '精': 3, '极': 4, '绝': 5, '顶': 6 };
        const qualityIndex = quality ? pj[quality] : null;
        const hasQuantity = await exist_najie_thing(userId, itemName, itemData.class, qualityIndex);

        if (!hasQuantity || hasQuantity < quantity) {
            return { success: false, message: `【${itemName}】数量不足` };
        }

        if (await Locked_najie_thing(userId, itemName, itemData.class, qualityIndex) === 1) {
            return { success: false, message: `${itemData.class}:${itemName}已锁定，请解锁后再出售。` };
        }

        // 扣除物品并增加亲密度
        await Add_najie_thing(userId, itemName, itemData.class, -quantity);

        const favorabilityIncrease = Math.trunc(itemData.出售价 / 10000 * quantity);
        const updateSuccess = await DAL.transaction_update(userId, (playerData) => {
            playerData.favorability = (playerData.favorability || 0) + favorabilityIncrease;
            return true;
        });

        if (!updateSuccess) {
            return { success: false, message: '喂养失败，请重试' };
        }

        // 设置冷却时间
        await redis.set(`xiuxian:player:${userId}:last_Feed_time`, now);

        const newPlayer = await DAL.getAllPlayerData(userId);
        return {
            success: true,
            message: `喂养成功，你和神兽的亲密度增加了${favorabilityIncrease},当前为${newPlayer.player.favorability || 0}`
        };
    } catch (error) {
        return { success: false, message: '喂养神兽失败' };
    }
}

/**
 * 神兽赐福
 * @param {string} userId 用户ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function getDivineBeastBonus(userId) {
    try {
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

        if (ass.宗门神兽 === 0) {
            return { success: false, message: '你的宗门还没有神兽的护佑，快去召唤神兽吧' };
        }

        // 检查今日是否已经获得赐福
        const now = new Date();
        const nowTime = now.getTime();
        const today = await shijianc(nowTime);
        const lastBonusTime = await getLastBonusTime(userId);

        if (lastBonusTime && today.Y === lastBonusTime.Y && today.M === lastBonusTime.M && today.D === lastBonusTime.D) {
            return { success: false, message: '今日已经接受过神兽赐福了，明天再来吧' };
        }

        // 设置赐福时间
        await redis.set(`xiuxian:player:${userId}:getLastsign_Bonus`, nowTime);

        // 计算赐福概率
        let successRate = 0.5;
        const favorability = player.favorability || 0;

        if (favorability > 1000) {
            successRate = 0.9;
        } else if (favorability > 500) {
            successRate = 0.7;
        } else if (favorability > 200) {
            successRate = 0.5;
        }

        const random = Math.random();
        if (random > (1 - successRate)) {
            // 赐福成功，根据神兽类型给予奖励
            const result = await giveRandomReward(userId, ass.宗门神兽, favorability);
            return result;
        } else {
            return {
                success: true,
                message: `${ass.宗门神兽}闭上了眼睛，表示今天不想理你`
            };
        }
    } catch (error) {
        return { success: false, message: '神兽赐福失败' };
    }
}

/**
 * 获取上次赐福时间
 * @param {string} userId 用户ID
 * @returns {Promise<object|false>}
 */
async function getLastBonusTime(userId) {
    try {
        const time = await redis.get(`xiuxian:player:${userId}:getLastsign_Bonus`);
        if (time) {
            return await shijianc(parseInt(time));
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * 根据神兽类型给予随机奖励
 * @param {string} userId 用户ID
 * @param {string} beastType 神兽类型
 * @param {number} favorability 亲密度
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function giveRandomReward(userId, beastType, favorability) {
    try {
        const allData = await DAL.getAllPlayerData(userId);
        const { player } = allData;

        const nowLevelId = data.Level_list.find(item => item.level_id === player.level_id).level_id;
        const bodyLevelId = data.Level_list.find(item => item.level_id === player.Physique_id).level_id;

        let itemName = '';
        let itemClass = '';
        let bloodBonus = 0;
        let cultivationBonus = 0;

        // 根据神兽类型确定奖励
        const randomA = Math.random();
        let rarity = 1;
        if (randomA > 0.85) rarity = 1;
        else if (randomA > 0.5) rarity = 2;
        else rarity = 3;

        const isSpecialReward = favorability > 1000 && rarity === 1 && Math.random() > 0.8;

        switch (beastType) {
            case '麒麟':
                if (isSpecialReward) {
                    const location = Math.floor(Math.random() * (data.qilin.length / rarity));
                    itemName = data.qilin[location].name;
                    itemClass = data.qilin[location].class;
                } else {
                    const location = Math.floor(Math.random() * (data.danyao_list.length / rarity));
                    itemName = data.danyao_list[location].name;
                    itemClass = data.danyao_list[location].class;
                }
                bloodBonus = 500 * bodyLevelId;
                cultivationBonus = 500 * nowLevelId;
                break;

            case '青龙':
                if (isSpecialReward) {
                    const location = Math.floor(Math.random() * (data.qinlong.length / rarity));
                    itemName = data.qinlong[location].name;
                    itemClass = data.qinlong[location].class;
                } else {
                    const location = Math.floor(Math.random() * (data.gongfa_list.length / rarity));
                    itemName = data.gongfa_list[location].name;
                    itemClass = data.gongfa_list[location].class;
                }
                cultivationBonus = 300 * nowLevelId;
                break;

            case '玄武':
                if (isSpecialReward) {
                    const location = Math.floor(Math.random() * (data.xuanwu.length / rarity));
                    itemName = data.xuanwu[location].name;
                    itemClass = data.xuanwu[location].class;
                } else {
                    const location = Math.floor(Math.random() * (data.huju_list.length / rarity));
                    itemName = data.huju_list[location].name;
                    itemClass = data.huju_list[location].class;
                }
                bloodBonus = 300 * bodyLevelId;
                break;

            case '朱雀':
                if (isSpecialReward) {
                    const location = Math.floor(Math.random() * (data.zhuque.length / rarity));
                    itemName = data.zhuque[location].name;
                    itemClass = data.zhuque[location].class;
                } else {
                    const location = Math.floor(Math.random() * (data.fabao_list.length / rarity));
                    itemName = data.fabao_list[location].name;
                    itemClass = data.fabao_list[location].class;
                }
                cultivationBonus = 300 * nowLevelId;
                break;

            case '白虎':
                if (isSpecialReward) {
                    const location = Math.floor(Math.random() * (data.baihu.length / rarity));
                    itemName = data.baihu[location].name;
                    itemClass = data.baihu[location].class;
                } else {
                    const location = Math.floor(Math.random() * (data.wuqi_list.length / rarity));
                    itemName = data.wuqi_list[location].name;
                    itemClass = data.wuqi_list[location].class;
                }
                bloodBonus = 300 * bodyLevelId;
                break;
        }

        // 应用奖励
        const updateSuccess = await DAL.transaction_update(userId, (playerData) => {
            if (bloodBonus > 0) {
                playerData.血气 = (playerData.血气 || 0) + bloodBonus;
            }
            if (cultivationBonus > 0) {
                playerData.修为 = (playerData.修为 || 0) + cultivationBonus;
            }
            playerData.血量 = parseInt(playerData.血量上限);
            return true;
        });

        if (!updateSuccess) {
            return { success: false, message: '赐福失败，请重试' };
        }

        // 添加物品
        await Add_najie_thing(userId, itemName, itemClass, 1);

        const specialMsg = isSpecialReward ?
            `看见你来了,${beastType}很高兴，仔细挑选了${itemName}给你` :
            `${beastType}今天心情不错，随手丢给了你${itemName}`;

        return {
            success: true,
            message: `${specialMsg}\n经过神兽的赐福，你的血量回满了，同时修为或气血得到了一定的提升`
        };
    } catch (error) {
        return { success: false, message: '赐福奖励发放失败' };
    }
}

/**
 * 格式化藏宝阁列表显示
 * @param {Array} items 物品列表
 * @returns {Array} 格式化后的消息数组
 */
export function formatTreasureCabinetList(items) {
    const msg = ['***宗门藏宝阁***'];
    const pinji = ['劣', '普', '优', '精', '极', '绝', '顶'];

    if (items.length === 0) {
        msg.push('需要宗主放入物品！格式:\n#放入+物品名*所需贡献值*数量\n如果有是武器则需要加*品级');
        return msg;
    }

    for (const item of items) {
        if (item.class === '装备') {
            msg.push(
                `${item.name}【${pinji[item.pinji]}】\n` +
                `类型：${item.class}\n` +
                `攻击力：${item.atk}\n` +
                `防御：${item.def}\n` +
                `血量：${item.HP}\n` +
                `暴击加成：${item.bao * 100}%\n` +
                `所需贡献值：${item.price}\n` +
                `余量:${item.aconut}`
            );
        } else {
            msg.push(
                `${item.name}\n` +
                `类型：${item.class}\n` +
                `所需贡献值：${item.price}\n` +
                `余量:${item.aconut}`
            );
        }
    }

    return msg;
}