import plugin from '../../../../lib/plugins/plugin.js'
import config from "../../model/Config.js"
import data from '../../model/XiuxianData.js'
import { get_yijie_player_img } from '../ShowImeg/showData.js'

import { __PATH } from "../Xiuxian/xiuxian.js"

/**
 * 全局
 */
let allaction = false;//全局状态判断
/**
 * 交易系统
 */
export class yijieUser extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'yijieUser',
            /** 功能描述 */
            dsc: '交易模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: '^#造访异界$',
                    fnc: 'add_yijie'
                },
                {
                    reg: '^#我的面板$',
                    fnc: 'Show_player'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    async add_yijie(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply("请在群聊内发送此信息")
            return;
        }
        let usr_qq = e.user_id;
        //判断是否为匿名创建存档
        if (usr_qq == 80000000) {
            return;
        }

        //调试
        if (usr_qq !== 2531606029) {
            e.reply("功能暂未开放，敬请期待")
            return;
        }

        //有无存档
        let ifexistplay = redis.get("xiuxian:yijie:player:" + usr_qq)
        if (!ifexistplay) {
            e.reply("您已身处异界")
            return;
        }
        //初始化玩家信息
        let new_player = {
            "id": e.user_id,
            "名号": e.user_id,
            "xianding_level": 1,//仙鼎等级
            "xianding_exp": 1,//仙鼎经验
            "xianding_jieduan": 1,//仙鼎阶段
            "血量上限": 200,
            "攻击": 0,
            "防御": 0,
            "暴击率": 0.05,
            "暴击伤害": 0.50,
            "饱食度": 0,
            "武器": data.yijie_wuqi_list.find(item => item.name == "新手短剑"),
            "护具": data.yijie_huju_list.find(item => item.name == "木盾"),
            "法宝": data.yijie_fabao_list.find(item => item.name == "葫芦")
        }
        let wuqi = new_player["武器"]
        let huju = new_player["护具"]
        let fabao = new_player["法宝"]
        let chushi = data.xiandingjieduan_list.find(item => item.level == new_player["xianding_jieduan"])
        // chushi = JSON.parse(chushi)
        // wuqi = JSON.parse(wuqi)
        // huju = JSON.parse(huju)
        // fabao = JSON.parse(fabao)
        new_player["攻击"] = chushi["初始攻击"] + wuqi["atk"]
        new_player["防御"] = chushi["初始防御"] + huju["def"]
        new_player["血量上限"] = chushi["初始生命"] + fabao["HP"]
        new_player["暴击率"] += fabao["bao"]
        await redis.set("xiuxian:yijie:player:" + usr_qq, JSON.stringify(new_player))
        //初始化背包
        let new_beibao = {
            "装备": [],
            "丹药": [],
            "道具": [],
            "功法": [],
            "草药": [],
            "材料": [],
            "食材": [],
        }
        await redis.set("xiuxian:yijie:playerbeibao:" + usr_qq, JSON.stringify(new_beibao))
        await this.Show_player(e);
        let i = 0
        let action = await redis.get("xiuxian:yijie:player:" + 10 + ":biguang");
        action = await JSON.parse(action);
        if (action == null) {
            action = [];
        }
        for (i = 0; i < action.length; i++) {
            if (action[i].qq == usr_qq) {
                break
            }
        }
        if (i == action.length) {
            let arr = {
                biguan: 0,//闭关状态1
                biguanxl: 0,//增加效率
                xingyun: 0,
                lianti: 0,//1
                ped: 0,//1
                modao: 0,
                beiyong1: 0,
                beiyong2: 0,//1
                beiyong3: 0,//2
                beiyong4: 0,
                beiyong5: 0,
                qq: usr_qq
            }
            action.push(arr)
            console.log(arr);
            await redis.set("xiuxian:yijie:player:" + 10 + ":biguang", JSON.stringify(action))
        }
        return;
    }
    //#我的练气
    async Show_player(e) {
        //不开放私聊功能
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await redis.get("xiuxian:yijie:player:" + usr_qq)
        if (!ifexistplay) {
            return;
        }
        //let img = await get_yijie_player_img(e);
        e.reply(ifexistplay);
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