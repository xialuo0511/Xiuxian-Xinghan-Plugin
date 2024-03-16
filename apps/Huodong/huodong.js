//#tag已适配
import plugin from '../../../../lib/plugins/plugin.js'
import data from '../../model/XiuxianData.js'
import config from "../../model/Config.js"
import { Read_player, existplayer, isNotNull, sleep, exist_najie_thing, Add_najie_thing, convert2integer } from '../Xiuxian/xiuxian.js'
import { Add_灵石, Add_修为 } from '../Xiuxian/xiuxian.js'
import Show from "../../model/show.js";
import puppeteer from "../../../../lib/puppeteer/puppeteer.js";

import { Gulid } from '../../api/api.js'

let allaction = false;

export class huodong extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'Yunzai_Bot_Xiuxian_Huodong',
            /** 功能描述 */
            dsc: '活动模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                // {
                //     reg: '^#活动商店$',
                //     fnc: 'shop'
                // },
                // {
                //     reg: '^#愿力兑换(.*)*(.*)$',
                //     fnc: 'duihuan'
                // },
                // {
                //     reg: '^#许愿.*$',
                //     fnc: 'xuyuan'
                // },
                // {
                //     reg: '^#制作霄灯.*$',
                //     fnc: 'hecheng'
                // }
            ]
        })
    }

    async hecheng(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        //有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        await Go(e);
        if (allaction) {
        } else {
            return;
        }
        allaction = false;
        let player = await Read_player(usr_qq);
        let msg = e.msg.toString()
        let shu = 1
        if (msg.includes("*")) {
            let code = msg.split("\*");
            shu = code[1];
            shu = await convert2integer(shu)
        }
        let shu1 = await exist_najie_thing(usr_qq, "浮空石", "材料");
        let shu2 = await exist_najie_thing(usr_qq, "灵木", "材料");
        let shu3 = await exist_najie_thing(usr_qq, "木浆纸", "材料");
        if (shu1 < shu || shu2 < shu || shu3 < shu) {
            e.reply(`材料不足，请查看纳戒相应材料数量后再合成！`)
            return;
        }
        await Add_najie_thing(usr_qq, "浮空石", "材料", -shu);
        await Add_najie_thing(usr_qq, "灵木", "材料", -shu);
        await Add_najie_thing(usr_qq, "木浆纸", "材料", -shu);
        await Add_najie_thing(usr_qq, "霄灯", "道具", shu);
        e.reply(`制作成功，获得【霄灯】*${shu}`);
        return;
    }

    async xuyuan(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id.toString().replace('qg_', '')
        usr_qq = await Gulid(usr_qq);
        //有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        await Go(e);
        if (allaction) {
        } else {
            return;
        }
        allaction = false;
        let msg = e.msg.replace("#许愿", "");
        //搜索纳戒物品
        let shu = await exist_najie_thing(usr_qq, "霄灯", "道具");
        if (!shu || shu < 1) {
            e.reply("霄灯数量不足，请合成后再来!")
            return;
        }
        await Add_najie_thing(usr_qq, "霄灯", "道具", -shu);
        await Add_najie_thing(usr_qq, "愿力", "道具", shu);
        await redis.set("xiuxian:yuanwang", `/n【${usr_qq}】${msg}`)
        e.reply(`你许愿之后放飞了背包中全部的霄灯\n新的一年愿望一定会实现！`)
        return;
    }

    async shop(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id.toString().replace('qg_', '')
        usr_qq = await Gulid(usr_qq);
        //有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        await Go(e);
        if (allaction) {
        } else {
            return;
        }
        allaction = false;
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
        //有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        await Go(e);
        if (allaction) {
        } else {
            return;
        }
        allaction = false;
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
        let quantity = commodities_list[0].售价 * shuliang
        quantity = await convert2integer(quantity);
        shuliang = await convert2integer(shuliang);

        if (!shu) {//没有
            e.reply(`您没有愿力，还请多多放飞霄灯！`);
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
    let shu = await exist_najie_thing(usr_qq, "愿力", "道具");
    if (!shu) {
        shu = 0
    }
    if (!ifexistplay) {
        return;
    }
    let commodities_list = data.huodongshop_list;
    let ningmenghome_data = {
        yuanli: shu,
        user_id: usr_qq,
        commodities_list: commodities_list
    }
    const data1 = await new Show(e).get_huodongshopData(ningmenghome_data);
    let img = await puppeteer.screenshot("huodongshop", {
        ...data1,
    });
    return img;
}

export async function Go(e) {
    let usr_qq = e.user_id.toString().replace('qg_', '')
    usr_qq = await Gulid(usr_qq);
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
        e.reply("你都伤成这样了,先恢复一下再来吧！");
        return;
    }
    allaction = true;
    return;
}