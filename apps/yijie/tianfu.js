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
    yijie_foundthing
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

}