import plugin from '../../../../lib/plugins/plugin.js'
import config from "../../model/Config.js"
import data from '../../model/XiuxianData.js'
import {
    Write_yijie_player,
    Write_yijie_beibao,
    yijie_existplayer,
    yijie_zhanlijisuan,
    Read_yijie_beibao,
    Read_yijie_player,
    Add_yijie_beibao_thing,
    Add_xianding_exp,
    exist_yijie_beibao_thing,
    yijie_foundthing,
    Add_星魂币
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
                },
                {
                    reg: '^#仙鼎突破$',
                    fnc: 'xianding_up'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    async xianding_up(e) {
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let player = await Read_yijie_player(usr_qq);
        //先判断够不够经验
        let xianding_exp_max = data.yijie_xianding.find(
            item => item.level == player.xianding_level
        ).exp;
        if (player.xianding_exp < xianding_exp_max) {
            e.reply("您的仙鼎经验不足，请炼化更多遗书后再突破！")
            return;
        }
        let chushi = data.xiandingjieduan_list.find(item => item.level == player["xianding_level"] + 1)
        if (!chushi) {
            e.reply("您已达到当前仙鼎等级上限！请以后再来！")
            return;
        }
        let new_exp = player.xianding_exp - xianding_exp_max
        player["xianding_level"] += 1
        let a = player["xianding_level"]
        let msg = `突破成功！仙鼎升到了${player.xianding_level}级，为你提供的力量提高了！可前往【我的面板】查看`
        if (a == 10) {
            msg += `\n恭喜您仙鼎提升到了10级，获得奖励1500星魂币`
            player.星魂币 += 1500
        }
        if (a == 11) {
            msg += `\n恭喜您仙鼎提升到了11级，获得奖励2500星魂币、烤肉*20`
            player.星魂币 += 2500
            Add_yijie_beibao_thing(usr_qq, "烤肉", "食材", 20)
        }
        player["xianding_exp"] = new_exp
        await Write_yijie_player(usr_qq, player);
        e.reply(msg)
        return;
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
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        //检索方法
        let najie = await data.getData("yijie_beibao", usr_qq);
        let xiuwei = 0
        for (var l of najie.道具) {
            if (l.type == '仙鼎遗书') {
                //纳戒中的数量
                let quantity = await exist_yijie_beibao_thing(usr_qq, l.name, l.class);
                await Add_xianding_exp(usr_qq, quantity * l.出售价)
                await Add_yijie_beibao_thing(usr_qq, l.name, l.class, -quantity);
                xiuwei = xiuwei + l.出售价 * quantity;
            }
        }
        if (xiuwei == 0) {
            e.reply("您的背包里没有一本仙鼎遗书，本次炼化提高的经验为0")
            return;
        } else {
            e.reply(`已将背包全部仙鼎遗书炼化！本次炼化共提升仙鼎经验*${xiuwei}`)
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