import plugin from '../../../../lib/plugins/plugin.js'
import config from "../../model/Config.js"
import data from '../../model/XiuxianData.js'
import {
    Write_yijie_player,
    yijie_existplayer,
    Read_yijie_player,
} from '../Xiuxian/xiuxian.js'
import { get_tianfu_level_img } from '../ShowImeg/showData.js'
import { __PATH } from "../Xiuxian/xiuxian.js"

/**
 * 全局
 */
let allaction = false;//全局状态判断
/**
 * 交易系统
 */
export class tianfu extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'tianfu',
            /** 功能描述 */
            dsc: '交易模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: '^#天赋等级$',
                    fnc: 'tianfu_list'
                },
                {
                    reg: '^#天赋突破$',
                    fnc: 'tianfu_up'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    async tianfu_list(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let img = await get_tianfu_level_img(e);
        e.reply(img);
        return;
    }

    async tianfu_up(e) {
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let player = await Read_yijie_player(usr_qq);
        //先判断够不够经验
        let tianfu_exp_max = data.tianfujieduan_list.find(
            item => item.level == player.tianfu_level
        ).exp;
        if (player.tianfu_exp < tianfu_exp_max) {
            e.reply("您的天赋经验不足，请再度修行后再突破！")
            return;
        }
        let chushi = data.tianfujieduan_list.find(item => item.level == player["tianfu_level"] + 1)
        if (!chushi) {
            e.reply("您已达到当前天赋等级上限！请以后再来！")
            return;
        }
        let new_exp = player.tianfu_exp - tianfu_exp_max
        player["tianfu_level"] += 1
        player["tianfu_exp"] = new_exp
        await Write_yijie_player(usr_qq, player);
        e.reply(`突破成功！天赋升到了${player.tianfu_level}级！\n获得效果：【${chushi.name}*LV${chushi.tianfu_level}】${chushi.list}`)
        return;
    }

}