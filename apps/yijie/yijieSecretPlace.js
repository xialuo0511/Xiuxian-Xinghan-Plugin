//插件加载
import plugin from '../../../../lib/plugins/plugin.js'
import data from '../../model/XiuxianData.js'
import config from "../../model/Config.js"
import { Read_player, yijie_existplayer, isNotNull, sleep, exist_najie_thing, Add_najie_thing, convert2integer } from '../Xiuxian/xiuxian.js'
import { Add_灵石, Add_修为 } from '../Xiuxian/xiuxian.js'
import Show from "../../model/show.js";
import puppeteer from "../../../../lib/puppeteer/puppeteer.js";

/**
 * 秘境模块
 */
let allaction = false;

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
        let addres = "秘境";
        let weizhi = data.yijie_mijing;
        await Goweizhi(e, weizhi, addres);
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
        allaction = false;
        let didian = e.msg.replace("#探寻异界秘境", '');
        didian = didian.trim();
        let weizhi = await data.yijie_mijing.find(item => item.name == didian);
        if (!isNotNull(weizhi)) {
            return;
        }
        //记录时间
        let Price = weizhi.Price;
        await Add_灵石(usr_qq, -Price);
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
        if (e.isGroup) {
            arr.group_id = e.group_id
        }
        await redis.set("xiuxian:yijie:player:" + usr_qq + ":action", JSON.stringify(arr));
        e.reply("开始探寻异界秘境【" + didian + "】," + time + "分钟后归来!");
        return;
    }
}

/**
 * 地点查询
 */
export async function Goweizhi(e, weizhi, addres) {
    let adr = addres;
    let msg = [
        "***" + adr + "***"
    ];
    for (let i = 0; i < weizhi.length; i++) {
        msg.push("***" + weizhi[i].name + "***")
        msg.push("信息：" + weizhi[i].Grade)
    }
    let log_data = {
        log: msg,
    };
    const data1 = await new Show(e).get_logData(log_data);
    let img = await puppeteer.screenshot('log', {
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