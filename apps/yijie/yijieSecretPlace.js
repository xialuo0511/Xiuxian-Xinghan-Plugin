//插件加载
import plugin from '../../../../lib/plugins/plugin.js'
import data from '../../model/XiuxianData.js'
import config from "../../model/Config.js"
import { Read_player, yijie_existplayer, isNotNull, sleep, exist_najie_thing, Add_yijie_beibao_thing, Read_yijie_player, Add_星魂币 } from '../Xiuxian/xiuxian.js'
import { exist_yijie_beibao_thing } from '../Xiuxian/xiuxian.js'
import Show from "../../model/show.js";
import puppeteer from "../../../../lib/puppeteer/puppeteer.js";

/**
 * 秘境模块
 */
let allaction = false;
const versionData = config.getdefSet("version", "version");

export class yijieSecretPlace extends plugin {
    constructor() {
        super({
            name: 'Yunzai_Bot_yijie_SecretPlace',
            dsc: '修仙模块',
            event: 'message',
            /**
             * 优先级，数字越小等级越高，建议优先级600
             */
            priority: 600,
            rule: [
                {
                    reg: '^#异界秘境$',
                    fnc: 'Secretplace'
                },
                {
                    reg: '^#探寻异界秘境.*$',
                    fnc: 'Gosecretplace'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    //秘境地点
    async Secretplace(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let weizhi = data.yijie_mijing;
        await Goweizhi(e, weizhi);
    }

    //降临秘境
    async Gosecretplace(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id;
        await Go(e);
        if (allaction) {
        } else {
            return;
        }
        let player = await Read_yijie_player(usr_qq)
        allaction = false;
        let didian = e.msg.replace("#探寻异界秘境", '');
        didian = didian.trim();

        let weizhi = await data.yijie_mijing.find(item => item.name == didian);
        if (!isNotNull(weizhi)) {
            return;
        }
        if (didian.includes("仙鼎历练")) {
            if (player.xianding_level < weizhi.tuijian) {
                e.reply(`进入本历练秘境至少需要仙鼎等级：${weizhi.tuijian},您当前仙鼎等级为：${player.xianding_level},请提升后再来！`)
                return;
            } else {
                let shuliang = await exist_yijie_beibao_thing(usr_qq, "仙鼎历练券", "道具");
                if (!shuliang || shuliang < 1) {
                    e.reply("您的【仙鼎历练券】不足！")
                    return;
                } else {
                    await Add_yijie_beibao_thing(usr_qq, "仙鼎历练券", "道具", -1)
                }
            }

        }
        if (weizhi.xinghunbi) {
            if (player.星魂币 < Number(weizhi.xinghunbi)) {
                e.reply(`需要至少${weizhi.xinghunbi}星魂币才能进入，你只有${player.星魂币}`)
                return;
            }
            await Add_星魂币(usr_qq, -1 * Number(weizhi.xinghunbi))
        }

        //记录时间
        const time = this.xiuxianConfigData.CD.yijiesecretplace;//时间（分钟）
        let action_time = 60000 * time;//持续时间，单位毫秒
        let arr = {
            "action": "历练",//动作
            "end_time": new Date().getTime() + action_time,//结束时间
            "time": action_time,//持续时间
            "shutup": "1",//闭关
            "working": "1",//降妖
            "Place_action": "0",//秘境状态---开启
            "Place_actionplus": "1",//沉迷秘境状态---关闭
            "power_up": "1",//渡劫状态--关闭
            "mojie": "1",//魔界状态---关闭
            "xijie": "1", //洗劫状态开启
            "plant": "1",//采药-开启
            "mine": "1",//采矿-开启
            //这里要保存秘境特别需要留存的信息
            "Place_address": weizhi,
        };
        arr["action"] = "探寻异界秘境【" + didian + "】"
        if (e.isGroup) {
            arr.group_id = e.group_id
        }
        await redis.set("xiuxian:yijie:player:" + usr_qq + ":action", JSON.stringify(arr));
        if (weizhi.xinghunbi) {
            e.reply("消耗星魂币" + weizhi.xinghunbi + "，开始探寻异界秘境【" + didian + "】," + time + "分钟后归来!");
        } else {
            e.reply("开始探寻异界秘境【" + didian + "】," + time + "分钟后归来!");
        }
        return;
    }
}

/**
 * 地点查询
 */
export async function Goweizhi(e, weizhi) {
    let player = await Read_yijie_player(e.user_id)
    let lilianquan = await exist_yijie_beibao_thing(e.user_id, "仙鼎历练券", "道具");
    if (!lilianquan) {
        lilianquan = 0
    }
    let data = {
        user_id: e.user_id,
        lilianquan: lilianquan,
        weizhi,
        player,
        修仙版本: versionData,
    };
    const data1 = await new Show(e).get_yijiemijingData(data);
    let img = await puppeteer.screenshot('yijiemijing', {
        ...data1,
    });
    e.reply(img);
    return;
}

/**
 * 常用查询合集
 */
export async function Go(e) {
    let usr_qq = e.user_id;
    //不开放私聊
    if (!e.isGroup) {
        return;
    }
    //有无存档
    let ifexistplay = await yijie_existplayer(usr_qq);
    if (!ifexistplay) {
        return;
    }
    //获取游戏状态
    let game_action = await redis.get("xiuxian:yijie:player:" + usr_qq + ":game_action");
    //防止继续其他娱乐行为
    if (game_action == 0) {
        e.reply("修仙：游戏进行中...");
        return;
    }
    //查询redis中的人物动作
    let action = await redis.get("xiuxian:yijie:player:" + usr_qq + ":action");
    action = JSON.parse(action);
    if (action != null) {
        //人物有动作查询动作结束时间
        let action_end_time = action.end_time;
        let now_time = new Date().getTime();
        if (now_time <= action_end_time) {
            let m = parseInt((action_end_time - now_time) / 1000 / 60);
            let s = parseInt(((action_end_time - now_time) - m * 60 * 1000) / 1000);
            e.reply("正在" + action.action + "中,剩余时间:" + m + "分" + s + "秒");
            return;
        }
    }
    allaction = true;
    return;
}