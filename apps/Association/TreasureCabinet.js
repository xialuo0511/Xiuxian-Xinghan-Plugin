import plugin from '../../../../lib/plugins/plugin.js';
import config from "../../model/Config.js";
import { existplayer, ForwardMsg } from '../Xiuxian/xiuxian.js';
import {
    getTreasureCabinetList,
    exchangeTreasureItem,
    putItemToTreasure,
    retrieveItemFromTreasure,
    getPlayerContribution,
    summonDivineBeast,
    feedDivineBeast,
    getDivineBeastBonus,
    formatTreasureCabinetList
} from '../../logic/treasure_cabinet_logic.js';

/**
 * 宗门藏宝阁
 */
export class TreasureCabinet extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'TreasureCabinet',
            /** 功能描述 */
            dsc: '宗门藏宝阁模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 9999,
            rule: [
                {
                    reg: '^#(宗门藏宝阁|藏宝阁)$',
                    fnc: 'List_treasureCabinet'
                },
                {
                    reg: '^#兑换.*$',
                    fnc: 'duihuan'
                },
                {
                    reg: '^#放入.*$',
                    fnc: 'fr'
                },
                {
                    reg: '^#收回.*$',
                    fnc: 'qh'
                },
                {
                    reg: '^#我的贡献$',
                    fnc: 'gonxian'
                },
                {
                    reg: '^#召唤神兽$',
                    fnc: 'Summon_Divine_Beast'
                },
                {
                    reg: '^#喂给神兽.*(\\*[\u4e00-\u9fa5])?\\*[1-9]\d*',
                    fnc: 'Feed_Beast'
                },
                {
                    reg: '^#神兽赐福$',
                    fnc: 'Beast_Bonus'
                }
            ]
        });
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    // 宗门藏宝阁列表
    async List_treasureCabinet(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }

        const userId = e.user_id;
        if (userId === 80000000) return;

        const ifexistplay = await existplayer(userId);
        if (!ifexistplay) return;

        try {
            const result = await getTreasureCabinetList(userId);
            if (!result.success) {
                e.reply(result.message);
                return;
            }

            const msg = formatTreasureCabinetList(result.data.items);
            await ForwardMsg(e, msg);
        } catch (error) {
            e.reply('获取藏宝阁列表失败，请稍后重试');
        }
    }

    // 兑换物品
    async duihuan(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }

        const userId = e.user_id;
        if (userId === 80000000) return;

        const ifexistplay = await existplayer(userId);
        if (!ifexistplay) return;

        try {
            let input = e.msg.replace('#', '').replace('兑换', '');
            if (!input) return;

            const code = input.split('*');
            const itemName = code[0];
            const quantity = parseInt(code[1]) || 1;
            const quality = code[2] || null;

            if (quantity < 1) {
                e.reply('兑换数量必须大于0');
                return;
            }

            const result = await exchangeTreasureItem(userId, itemName, quantity, quality);
            e.reply(result.message);
        } catch (error) {
            e.reply('兑换失败，请稍后重试');
        }
    }

    // 放入物品
    async fr(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }

        const userId = e.user_id;
        if (userId === 80000000) return;

        const ifexistplay = await existplayer(userId);
        if (!ifexistplay) return;

        try {
            let input = e.msg.replace('#', '').replace('放入', '');
            if (!input) return;

            const code = input.split('*');
            const itemName = code[0];
            const price = parseInt(code[1]);
            const quantity = parseInt(code[2]);
            const quality = code[3] || null;

            if (!itemName || isNaN(price) || isNaN(quantity)) {
                e.reply('格式错误，请使用：#放入+物品名*价格*数量(*品级)');
                return;
            }

            const result = await putItemToTreasure(userId, itemName, price, quantity, quality);
            e.reply(result.message);
        } catch (error) {
            e.reply('放入失败，请稍后重试');
        }
    }

    // 收回物品
    async qh(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }

        const userId = e.user_id;
        if (userId === 80000000) return;

        const ifexistplay = await existplayer(userId);
        if (!ifexistplay) return;

        try {
            let input = e.msg.replace('#', '').replace('收回', '');
            if (!input) return;

            const code = input.split('*');
            const itemName = code[0];
            const quality = code[1] || null;

            const result = await retrieveItemFromTreasure(userId, itemName, quality);
            e.reply(result.message);
        } catch (error) {
            e.reply('收回失败，请稍后重试');
        }
    }

    // 我的贡献
    async gonxian(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }

        const userId = e.user_id;
        if (userId === 80000000) return;

        const ifexistplay = await existplayer(userId);
        if (!ifexistplay) return;

        try {
            const result = await getPlayerContribution(userId);
            e.reply(result.message);
        } catch (error) {
            e.reply('获取贡献值失败，请稍后重试');
        }
    }

    // 召唤神兽
    async Summon_Divine_Beast(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }

        const userId = e.user_id;
        if (userId === 80000000) return;

        const ifexistplay = await existplayer(userId);
        if (!ifexistplay) return;

        try {
            const result = await summonDivineBeast(userId);
            e.reply(result.message);
        } catch (error) {
            e.reply('召唤神兽失败，请稍后重试');
        }
    }

    // 喂养神兽
    async Feed_Beast(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }

        const userId = e.user_id;
        if (userId === 80000000) return;

        const ifexistplay = await existplayer(userId);
        if (!ifexistplay) return;

        try {
            let input = e.msg.replace('#', '').replace('喂给神兽', '');
            if (!input) return;

            const code = input.split('*');
            let itemName, quantity, quality;

            if (code.length === 2) {
                itemName = code[0];
                quantity = parseInt(code[1]);
            } else if (code.length === 3) {
                itemName = code[0];
                quality = code[1];
                quantity = parseInt(code[2]);
            } else {
                e.reply('格式错误，请使用：#喂给神兽+物品名*数量 或 #喂给神兽+物品名*品级*数量');
                return;
            }

            if (isNaN(quantity) || quantity < 1) {
                e.reply('数量必须是大于0的数字');
                return;
            }

            const result = await feedDivineBeast(userId, itemName, quantity, quality);
            e.reply(result.message);
        } catch (error) {
            e.reply('喂养神兽失败，请稍后重试');
        }
    }

    // 神兽赐福
    async Beast_Bonus(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }

        const userId = e.user_id;
        if (userId === 80000000) return;

        const ifexistplay = await existplayer(userId);
        if (!ifexistplay) return;

        try {
            const result = await getDivineBeastBonus(userId);
            e.reply(result.message);
        } catch (error) {
            e.reply('神兽赐福失败，请稍后重试');
        }
    }
}

// 保留原有的同步函数，但移到文件末尾
export async function Synchronization_ASS(e) {
    if (!e.isMaster) {
        return;
    }
    e.reply("宗门开始同步");
    let assList = [];
    let files = fs
        .readdirSync("./plugins/xiuxian-emulator-plugin/resources/data/association")
        .filter((file) => file.endsWith(".json"));
    for (let file of files) {
        file = file.replace(".json", "");
        assList.push(file);
    }
    for (let ass_name of assList) {
        let ass = await data.getAssociation(ass_name);
        let player = data.getData("player", ass.宗主);
        let now_level_id = data.Level_list.find(item => item.level_id == player.level_id).level_id;
        //补
        if (!isNotNull(ass.power)) {
            ass.power = 0;
        }
        if (now_level_id < 42) {
            ass.power = 0; // 凡界
        } else {
            ass.power = 1;//  仙界
        }
        if (ass.power == 1) {
            if (ass.大阵血量 == 114514) {
                ass.大阵血量 = 1145140;
            }
            let level = ass.最低加入境界;
            if (level < 42) {
                ass.最低加入境界 = 42;
            }
        }
        if (ass.power == 0 && ass.最低加入境界 > 41) {
            ass.最低加入境界 = 41;
        }
        if (!isNotNull(ass.宗门驻地)) {
            ass.宗门驻地 = 0;
        }
        if (!isNotNull(ass.宗门建设等级)) {
            ass.宗门建设等级 = 0;
        }
        if (!isNotNull(ass.宗门神兽)) {
            ass.宗门神兽 = 0;
        }
        if (!isNotNull(ass.副宗主)) {
            ass.副宗主 = [];
        }
        await data.setAssociation(ass_name, ass);
    }

    e.reply("宗门同步结束");
    return;
}