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
import { get_liulishop_img } from '../ShowImeg/Showningmeng.js'
import { __PATH } from "../Xiuxian/xiuxian.js"

/**
 * 全局
 */
let allaction = false;//全局状态判断
/**
 * 交易系统
 */
export class yijieshop extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'yijieshop',
            /** 功能描述 */
            dsc: '交易模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: "^#琉璃堂(装备|道具|武器|护具|法宝|箱子|地图)?$",
                    fnc: "yijie_liuli",
                },
                {
                    reg: '^#琉璃堂购买((.*)|(.*)*(.*))$',
                    fnc: 'Buy_comodities'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    //琉璃堂
    async yijie_liuli(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let thing_type = e.msg.replace("#琉璃堂", "");
        let img = await get_liulishop_img(e, thing_type);
        e.reply(img);
        return;
    }

    //购买商品
    async Buy_comodities(e) {
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
        await Go(e);
        if (allaction) {
            console.log(allaction);
        } else {
            return;
        }
        allaction = false;
        let thing = e.msg.replace("#", '');
        thing = thing.replace("琉璃堂购买", '');
        let code = thing.split("\*");
        let thing_name = code[0];
        //默认没有数量
        let quantity = 0;
        if (parseInt(code[1]) != parseInt(code[1])) {
            quantity = 1;
        } else if (parseInt(code[1]) < 1) {
            e.reply(`输入物品数量小于1,现在默认为1`);
            quantity = 1;
        } else {
            quantity = parseInt(code[1]);
        }
        if (!quantity) {
            quantity = 1
        }
        //e.reply(`thing_name:${thing_name},   quantity:${quantity}`);
        let ifexist = data.yijie_liuli.find(item => item.name == thing_name);
        if (!ifexist) {
            e.reply(`琉璃堂还没有这样的东西:${thing_name}`);
            return;
        }
        let player = await Read_yijie_player(usr_qq);
        let lingshi = player.星魂币;
        //如果没钱，或者为负数
        if (lingshi <= 0) {
            e.reply(`琉璃苣：星魂币不足，请下次再来！`);
            return;
        }
        // 价格倍率
        //价格
        let commodities_price = ifexist.售价 * quantity;
        commodities_price = Math.trunc(commodities_price);
        //判断金额
        if (lingshi < commodities_price) {
            e.reply(`星魂币不足以支付${thing_name},还需要${commodities_price - lingshi}星魂币`);
            return;
        }
        Add_yijie_beibao_thing(usr_qq, thing_name, ifexist.class, quantity);
        await Add_星魂币(usr_qq, -commodities_price);
        //发送消息
        e.reply([`购买成功!  获得【${thing_name}】*${quantity},花费了【${commodities_price}】星魂币,剩余【${lingshi - commodities_price}】星魂币  `, '\n可以在【#我的面板】中查看']);
        return;
    }

}

/**
 * 状态
 */
export async function Go(e) {
    let usr_qq = e.user_id;
    //有无存档
    let ifexistplay = await yijie_existplayer(usr_qq);
    if (!ifexistplay) {
        return;
    }
    //获取游戏状态
    let game_action = await redis.get("xiuxian:yijie:player:" + usr_qq + ":game_action");
    //防止继续其他娱乐行为
    if (game_action == 0) {
        e.reply("修仙：游戏进行中...");
        return;
    }
    //查询redis中的人物动作
    let action = await redis.get("xiuxian:yijie:player:" + usr_qq + ":action");
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