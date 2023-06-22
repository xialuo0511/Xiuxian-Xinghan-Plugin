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
    yijie_foundthing
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
export class xianding extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'xianding',
            /** 功能描述 */
            dsc: '交易模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: '^#炼化.*$',
                    fnc: 'lianhua'
                },
                {
                    reg: '^#一键炼化$',
                    fnc: 'lianhua_all'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    async lianhua(e) {
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let beibao = await Read_yijie_beibao(usr_qq);
        let wupin = e.msg.replace("#炼化", '');
        wupin = wupin.trim();
        let x = await yijie_foundthing(wupin)
        if (!x) {
            e.reply("异界查无此物")
            return;
        }
        let shuliang = await exist_yijie_beibao_thing(usr_qq, wupin, "道具");
        if (wupin.includes("仙鼎遗书")) {
            if (!shuliang || shuliang < 1) {
                e.reply(`您的【${wupin}】不足！可前往【修仙签到】获取`)
                return;
            } else {
                let thing = beibao.道具.find(item => item.name == wupin);
                await Add_xianding_exp(usr_qq, thing.出售价)
                await Add_yijie_beibao_thing(usr_qq, wupin, "道具", -1)
                e.reply(`炼化【${wupin}】*1，获得仙鼎经验*${thing.出售价}`)
            }
        }
        return;
    }

    async lianhua_all(e) {
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let beibao = await Read_yijie_beibao(usr_qq);
        let yishu1 = 0
        let yishu2 = 0
        let yishu3 = 0
        let yishu4 = 0
        let yishu5 = 0
        let expshuliang = 0

        let msg

        let all_yishu = ["一级仙鼎遗书", "二级仙鼎遗书", "三级仙鼎遗书", "四级仙鼎遗书", "五级仙鼎遗书"]
        for (var i of all_yishu) {
            let shuliang = await exist_yijie_beibao_thing(usr_qq, i, "道具");
            if (!shuliang) {
                shuliang = 0
            }
            if (shuliang > 0) {
                let thing = beibao.道具.find(item => item.name == i);
                await Add_xianding_exp(usr_qq, thing.出售价 * shuliang)
                let lingshi = 0 - shuliang
                e.reply(lingshi)
                await Add_yijie_beibao_thing(usr_qq, i, "道具", lingshi)
                expshuliang = expshuliang + thing.出售价 * shuliang
                if (i.includes("一")) {
                    yishu1 = shuliang
                } else if (i.includes("二")) {
                    yishu2 = shuliang
                } else if (i.includes("三")) {
                    yishu3 = shuliang
                } else if (i.includes("四")) {
                    yishu4 = shuliang
                } else if (i.includes("五")) {
                    yishu5 = shuliang
                }
            }
        }
        if (yishu1 != 0) {
            msg = `消耗【一级仙鼎遗书】*${yishu1},`
        }
        if (yishu2 != 0) {
            msg = msg + `【二级仙鼎遗书】*${yishu2},`
        }
        if (yishu3 != 0) {
            msg = msg + `【三级仙鼎遗书】*${yishu3},`
        }
        if (yishu4 != 0) {
            msg = msg + `【四级仙鼎遗书】*${yishu4},`
        }
        if (yishu5 != 0) {
            msg = msg + `【五级仙鼎遗书】*${yishu5},`
        }
        if (yishu1 + yishu2 + yishu3 + yishu4 + yishu5 == 0) {
            e.reply("您的背包里没有一本仙鼎遗书，本次炼化提高的经验为0")
            return;
        } else {
            e.reply(`本次炼化${msg}共提升仙鼎经验*${expshuliang}`)
            return;
        }
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