import plugin from '../../../../lib/plugins/plugin.js'
import config from "../../model/Config.js"
import data from '../../model/XiuxianData.js'
import {
    Write_yijie_player,
    Write_yijie_beibao,
    yijie_existplayer,
    yijie_zhanlijisuan,
    Read_yijie_beibao,
    Add_yijie_beibao_thing,
    Add_xianding_exp,
    exist_yijie_beibao_thing,
    yijie_foundthing,
    Read_yijie_player
} from '../Xiuxian/xiuxian.js'
import { get_yijie_player_img, get_beibao_img } from '../ShowImeg/showData.js'
import { __PATH } from "../Xiuxian/xiuxian.js"

/**
 * 全局
 */
let allaction = false;//全局状态判断
/**
 * 交易系统
 */
export class yijiebeibao extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'yijiebeibao',
            /** 功能描述 */
            dsc: '交易模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: '^#我的背包$',
                    fnc: 'mybeibao'
                },
                {
                    reg: '^#开启箱子.*$',
                    fnc: 'open_box'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    async open_box(e) {
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let thing_name = e.msg.replace("#开启箱子", '');
        thing_name = thing_name.trim();
        let x = await exist_yijie_beibao_thing(usr_qq, thing_name, "箱子");
        if (!x) {
            e.reply(`你没有【${thing_name}】这样的箱子`);
            return;
        }
        let thing = data.yijie_box.find(item => item.name == thing_name);
        await Add_yijie_beibao_thing(usr_qq, thing_name, "箱子", -1);
        let contents = thing.contents;
        let rand = Math.random();
        let rate = 0;
        let cishu = await redis.get("xiuxian:box:player:" + usr_qq)
        if (!cishu) {
            cishu = 0
        }
        cishu = Number(cishu)
        if (cishu < thing.baodi) {
            for (let i in contents) {
                rate += contents[i].rate;
                if (rand < rate) {
                    let item = contents[i].items[Math.floor(Math.random() * contents[i].items.length)];
                    await Add_yijie_beibao_thing(usr_qq, item.name, item.class, item.amount);
                    e.reply(`您打开了【${thing_name}】，获得了【${item.name}】*${item.amount}`);
                    if (item.name == thing.best) {
                        cishu = 0
                    } else {
                        cishu += 1
                    }
                    break;
                }
            }
        } else {
            for (let i in contents) {
                let item = contents[i].items.find(item => item.name == thing.best);
                if (item) {
                    await Add_yijie_beibao_thing(usr_qq, item.name, item.class, item.amount);
                    e.reply(`您打开了【${thing_name}】，本次为保底，获得了【${item.name}】*${item.amount}`);
                    break;
                }
            }
            cishu = 0
        }
        await redis.set("xiuxian:box:player:" + usr_qq, cishu)
        return;
    }

    async mybeibao(e) {
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let img = await get_beibao_img(e);
        e.reply(img);
        return;
    }
}

/**
 * 状态
 */
export async function Go(e) {
    let usr_qq = e.user_id;
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
    allaction = true;
    return;
}