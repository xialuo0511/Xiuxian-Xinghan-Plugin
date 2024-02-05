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
                },
                {
                    reg: '^#愿力兑换(.*)*(.*)$',
                    fnc: 'duihuan'
                },
                {
                    reg: '^#许愿.*$',
                    fnc: 'xuyuan'
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

    /**
     * 兑换
     */
    async duihuan(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id.toString().replace('qg_', '')
        usr_qq = await Gulid(usr_qq);
        await Go(e);
        let msg = e.msg.replace("#愿力兑换", "");
        var bool = msg.indexOf("*");
        //返回大于等于0的整数值，若不包含"Text"则返回"-1。
        //分割文本变数组
        let code = [];
        if (bool > 0) {
            code = msg.split("*");
        } else {
            code.push(msg);
            code.push(1);
        }
        //获取物品名和数量
        let thing_name = code[0];
        let shuliang = code[1];
        //获取活动商店数据
        let commodities_list = data.huodongshop_list;
        commodities_list = commodities_list.filter(function (commodities_list) {
            return commodities_list.name === thing_name;
        });
        commodities_list = commodities_list.filter(name => thing_name);
        //搜索纳戒物品
        let shu = await exist_najie_thing(usr_qq, "愿力", "道具");
        //转为整数
        let quantity = commodities_list[0].出售价 * shuliang
        quantity = await convert2integer(quantity);
        shuliang = await convert2integer(shuliang);

        if (!shu) {//没有
            e.reply(`您的愿力不足，还请多多放飞霄灯！`);
            return;
        }

        if (shu >= quantity) {
            await Add_najie_thing(usr_qq, "愿力", "道具", -quantity);
            await Add_najie_thing(usr_qq, commodities_list[0].name, commodities_list[0].class, shuliang)
            e.reply(`兑换${commodities_list[0].name}*${shuliang}成功，消耗${quantity}愿力`)
            return;
        } else {
            e.reply("购买需要" + quantity + "愿力，你只有" + shu + "，多多放飞霄灯吧！")
            return;
        }

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