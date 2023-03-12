//插件加载
import plugin from '../../../../lib/plugins/plugin.js'
import data from '../../model/XiuxianData.js'
import config from "../../model/Config.js"
import { Read_player, existplayer, ForwardMsg, isNotNull, sleep, exist_najie_thing, Add_najie_thing } from '../Xiuxian/xiuxian.js'
import { Add_灵石, Add_修为 } from '../Xiuxian/xiuxian.js'
import { add_mingdang, add_time } from "../jiance/jiance.js"

/**
 * 遗迹模块
 */
let allaction = false;

export class YijiPlace extends plugin {
    constructor() {
        super({
            name: 'Yunzai_Bot_YijiPlace',
            dsc: '修仙模块',
            event: 'message',
            /**
             * 优先级，数字越小等级越高，建议优先级600
             */
            priority: 600,
            rule: [
                {
                    reg: '^#遗迹$',
                    fnc: 'Yijiplace'
                },
                {
                    reg: '^#探寻遗迹.*$',
                    fnc: 'Goyijiplace'
                },
                {
                    reg: '^#逃离',
                    fnc: 'Giveup'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    //遗迹列表
    async Yijiplace(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            return;
        }
        let addres = "遗迹";
        let weizhi = data.yiji_list;
        await Goweizhi(e, weizhi, addres);
    }

    //探寻遗迹
    async Goyijiplace(e) {
        if (!e.isGroup) {
            return;
        }
        let usr_qq = e.user_id;
        await Go(e);
        if (allaction) {
        } else {
            return;
        }
        allaction = false;
        let player = await Read_player(usr_qq);
        let didian = e.msg.replace("#探寻遗迹", '');
        didian = didian.trim();
        let weizhi = await data.yiji_list.find(item => item.name == didian);
        if (!isNotNull(weizhi)) {
            return;
        }
        if (player.灵石 < weizhi.Price) {
            e.reply("需要" + weizhi.Price + "灵石才能探索噢~");
            return true;
        }
        let now_level_id;
        if (!isNotNull(player.level_id)) {
            e.reply("请先#同步信息");
            return;
        }
        now_level_id = data.Level_list.find(item => item.level_id == player.level_id).level_id;
        //记录时间
        await add_mingdang(usr_qq);
        await add_time(usr_qq);
        let Price = weizhi.Price;
        await Add_灵石(usr_qq, -Price);
        const time = this.xiuxianConfigData.CD.yijiplace;//时间（分钟）
        let action_time = 60000 * time;//持续时间，单位毫秒
        let arr = {
            "action": "探寻遗迹",//动作
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
        await redis.set("xiuxian:player:" + usr_qq + ":action", JSON.stringify(arr));
        e.reply("开始探寻遗迹" + didian + "," + time + "分钟后归来!");
        return;
    }

    //放弃
    async Giveup(e) {
        if (!e.isGroup) {
            return;
        }
        let usr_qq = e.user_id;
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            e.reply("没存档你逃个锤子!");
            return;
        }
        //获取游戏状态
        let game_action = await redis.get("xiuxian:player:" + usr_qq + ":game_action");
        //防止继续其他娱乐行为
        if (game_action == 0) {
            e.reply("修仙：游戏进行中...");
            return;
        }
        //查询redis中的人物动作
        let action = await redis.get("xiuxian:player:" + usr_qq + ":action");
        action = JSON.parse(action);
        //不为空，有状态
        if (action != null) {
            //是在秘境状态
            if (action.Place_action == "0" || action.Place_actionplus == "0" || action.mojie == "0") {
                //把状态都关了
                let arr = action;
                arr.is_jiesuan = 1;//结算状态
                arr.shutup = 1;//闭关状态
                arr.working = 1;//降妖状态
                arr.power_up = 1;//渡劫状态
                arr.Place_action = 1;//秘境
                arr.Place_actionplus = 1;//沉迷状态
                arr.mojie = 1;
                arr.end_time = new Date().getTime();//结束的时间也修改为当前时间
                delete arr.group_id;//结算完去除group_id
                await redis.set("xiuxian:player:" + usr_qq + ":action", JSON.stringify(arr));
                e.reply("你已逃离！");
                return;
            }
        }
        return;
    }
}

/**
 * 地点查询
 */
export async function Goweizhi(e, weizhi, addres) {
    let adr = addres;
    let msg = [
        "===" + adr + "列表==="
    ];
    for (let i = 0; i < weizhi.length; i++) {
        "遗迹:" + msg.push(weizhi[i].name + "\n"  + "所需：" + weizhi[i].Price + "灵石")
    }
    await ForwardMsg(e, msg);
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
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
        return;
    }
    //获取游戏状态
    let game_action = await redis.get("xiuxian:player:" + usr_qq + ":game_action");
    //防止继续其他娱乐行为
    if (game_action == 0) {
        e.reply("修仙：游戏进行中...");
        return;
    }
    //查询redis中的人物动作
    let action = await redis.get("xiuxian:player:" + usr_qq + ":action");
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
    let player = await Read_player(usr_qq);
    if (player.当前血量 < 200) {
        e.reply("你都伤成这样了,就不要出去浪了");
        return;
    }
    allaction = true;
    return;
}