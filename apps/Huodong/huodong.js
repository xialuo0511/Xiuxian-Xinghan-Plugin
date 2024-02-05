//#tag已适配
import plugin from '../../../../lib/plugins/plugin.js'
import data from '../../model/XiuxianData.js'
import config from "../../model/Config.js"
import { Read_player, existplayer, isNotNull, sleep, exist_najie_thing, Add_najie_thing, convert2integer } from '../Xiuxian/xiuxian.js'
import { Add_灵石, Add_修为 } from '../Xiuxian/xiuxian.js'
import Show from "../../model/show.js";
import puppeteer from "../../../../lib/puppeteer/puppeteer.js";

import { Gulid } from '../../api/api.js'



export class DSC extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'Yunzai_Bot_Xiuxian_Huodong',
            /** 功能描述 */
            dsc: '活动模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 500,
            rule: [
                {
                    reg: '^#活动商店$',
                    fnc: 'shop'
                }
            ]
        })
    }

    async shop(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let img = await get_huodongshop_img(e);
        e.reply(img);
        return;
    }

}

/**
 *活动商店
 */
export async function get_huodongshop_img(e) {
    let usr_qq = e.user_id.toString().replace('qg_', '')
    usr_qq = await Gulid(usr_qq);
    let ifexistplay = data.existData("player", usr_qq);
    if (!ifexistplay) {
        return;
    }
    let commodities_list = data.huodongshop_list;
    let ningmenghome_data = {
        user_id: usr_qq,
        commodities_list: commodities_list
    }
    const data1 = await new Show(e).get_huodongshopData(ningmenghome_data);
    let img = await puppeteer.screenshot("huodongshop", {
        ...data1,
    });
    return img;
}