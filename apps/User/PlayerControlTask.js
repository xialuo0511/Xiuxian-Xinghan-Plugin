import plugin from '../../../../lib/plugins/plugin.js'
import common from "../../../../lib/common/common.js"
import data from '../../model/XiuxianData.js'
import config from "../../model/Config.js"
import fs from "node:fs"

import { isNotNull, exist_najie_thing, Add_najie_thing, Add_血气, Add_修为 } from "../Xiuxian/xiuxian.js"

import { createRequire } from "module"
const require = createRequire(import.meta.url)
var mysql = require('mysql');
let databaseConfigData = config.getConfig("database", "database");
//创建连接
const db1 = mysql.createPool({
    host: 'localhost',
    user: databaseConfigData.Database.username,
    password: databaseConfigData.Database.password,
    database: 'xiuxiandatabase'
})
/**
 * 定时任务
 */
export class PlayerControlTask extends plugin {
    constructor() {
        super({
            name: 'PlayerControlTask',
            dsc: '定时任务',
            event: 'message',
            priority: 300,
            rule: []
        });
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
        this.set = config.getdefSet('task', 'task')
        this.task = {
            cron: this.set.action_task,
            name: 'PlayerControlTask',
            fnc: () => this.Playercontroltask()
        }
    }

    async Playercontroltask() {
        let sql1 = `select * from action where action_zhiye=0;`
        db1.query(sql1, async (err, result) => {
            if (err) {
                console.log(err)
                return
            }

            let action_list0 = result
            if (!action_list0) { return }
            var datas = JSON.stringify(action_list0)
            let action_list;
            try {
                action_list = JSON.parse(datas)
            } catch (error) {
                console.log(error);
            }
            for (var i = 0; i < action_list.length; i++) {
                let player_action = action_list[i]
                let push_address;//消息推送地址
                let is_group = false;//是否推送到群
                if (player_action.group_id != 0) {
                    is_group = true;
                    push_address = player_action.group_id;
                }
                //动作结束时间
                let end_time = player_action.end_time;
                //现在的时间
                let now_time = new Date().getTime();
                //闭关状态
                if (player_action.action_biguan == "1") {
                    if (now_time < end_time) {
                        return;
                    }

                    let time = (parseInt(player_action.time) / 1000 / 60) * 2;//分钟
                    if (time > 7200) {
                        time = 7200
                    }
                    let usr_qq = player_action.usr_id;
                    let player = data.getData("player", usr_qq);
                    let msg = [`【${player.名号}】`];
                    let now_level_id;
                    if (!isNotNull(player.level_id)) {
                        return;
                    }
                    now_level_id = data.Level_list.find(item => item.level_id == player.level_id).level_id;
                    //闭关收益倍率计算 倍率*境界id*天赋*时间
                    var size = this.xiuxianConfigData.biguan.size;
                    //增加的修为
                    let xiuwei = parseInt((size * now_level_id) * (player.修炼效率提升 + 1));
                    //恢复的血量
                    let blood = parseInt(player.血量上限 * 0.02);
                    //额外修为
                    let other_xiuwei = 0;
                    //炼丹师丹药修正
                    let transformation = "修为"
                    let xueqi = 0
                    let rand = Math.random();
                    //顿悟
                    if (rand < 0.2) {
                        rand = Math.trunc(rand * 10) + 45;
                        other_xiuwei = rand * time;
                        xueqi = Math.trunc(rand * time);
                        msg.push("\n本次闭关顿悟,额外增加修为:" + rand * time);
                    }
                    //走火入魔
                    else if (rand > 0.8) {
                        rand = Math.trunc(rand * 10) + 5;
                        other_xiuwei = -1 * rand * time;
                        xueqi = Math.trunc(rand * time);
                        msg.push("\n由于你闭关时隔壁装修,导致你差点走火入魔,修为下降" + rand * time);

                    }
                    let other_x = 0;
                    let qixue = 0;
                    if (await exist_najie_thing(usr_qq, "魔界秘宝", "道具") && player.魔道值 > 999) {
                        other_x = Math.trunc(xiuwei * 0.15 * time);
                        await Add_najie_thing(usr_qq, "魔界秘宝", "道具", -1);
                        msg.push("\n消耗了道具[魔界秘宝],额外增加" + other_x + "修为");
                        await Add_修为(usr_qq, other_x);
                    }
                    if (await exist_najie_thing(usr_qq, "神界秘宝", "道具") && player.魔道值 < 1 && (player.灵根.type == "转生" || player.level_id > 41)) {
                        qixue = Math.trunc(xiuwei * 0.1 * time);
                        await Add_najie_thing(usr_qq, "神界秘宝", "道具", -1);
                        msg.push("\n消耗了道具[神界秘宝],额外增加" + qixue + "血气");
                        await Add_血气(usr_qq, qixue);
                    }
                    //设置修为，设置血量

                    await this.setFileValue(usr_qq, blood * time, "当前血量");

                    //给出消息提示
                    await this.setFileValue(usr_qq, xiuwei * time + other_xiuwei, transformation);
                    msg.push("\n增加气血:" + xiuwei * time, "\n获得治疗,血量增加:" + blood * time + "炼神之力消散了");

                    let lianshen_action = await redis.get('xiuxian:player:' + usr_qq + ':lianshen');
                    try {
                        lianshen_action = JSON.parse(lianshen_action);
                    } catch (error) {
                        console.log(error);
                    }

                    if (lianshen_action) {
                        if (lianshen_action.lianti > 0) {
                            await this.setFileValue(usr_qq, (xiuwei * time + other_xiuwei) * lianshen_action.lianshen, transformation);
                            msg.push("本次闭关消耗一次炼神之力,获得额外血气" + (xiuwei * time + other_xiuwei) * lianshen_action.lianshen)
                            lianshen_action.lianti -= 1
                        }
                    }
                    await redis.set(
                        'xiuxian:player:' + usr_qq + ':lianshen',
                        JSON.stringify(lianshen_action)
                    );

                    let biguan_action = await redis.get("xiuxian:player:" + usr_qq + ":biguan")
                    try {
                        biguan_action = JSON.parse(biguan_action)
                    } catch (error) {
                        console.log(error);
                    }

                    if (biguan_action) {
                        if (biguan_action.biguan > 0) {
                            biguan_action.biguan -= 1
                            if (biguan_action.biguan == 0) {
                                msg.push("本次闭关后，辟谷丹丹药药效已过。")
                                let type = "修炼效率提升"
                                await this.setFileValue(usr_qq, player.修炼效率提升 - biguan_action.biguanxl, type);
                            }
                        }
                        await redis.set("xiuxian:player:" + usr_qq + ":biguang", JSON.stringify(arr));
                    }
                    const sql2 = `delete from action where usr_id=${player_action.usr_id};`
                    db1.query(sql2, async (err, result) => {
                        await this.pushInfo(push_address, true, msg)
                    })
                    return;

                }
                //降妖
                if (player_action.action_xiangyao == "1") {
                    //这里改一改,要在结束时间的前一分钟提前结算
                    end_time = end_time - 60000 * 2;
                    //时间过了
                    if (now_time > end_time) {
                        let usr_qq = player_action.usr_id;
                        let player = data.getData("player", usr_qq);
                        let msg = [`【${player.名号}】`]
                        let now_level_id;
                        if (!isNotNull(player.level_id)) {
                            return;
                        }
                        now_level_id = data.Level_list.find(item => item.level_id == player.level_id).level_id;
                        var size = this.xiuxianConfigData.work.size;
                        let lingshi = size * now_level_id;
                        let time = (parseInt(player_action.time) / 1000 / 60) * 2;//分钟
                        let other_lingshi = 0;
                        let other_xueqi = 0;
                        let rand = Math.random();
                        if (rand < 0.2) {
                            rand = Math.trunc(rand * 10) + 40;
                            other_lingshi = rand * time;
                            msg.push("\n降妖路上途径金银坊，一时手痒入场一掷：6 6 6，额外获得灵石" + rand * time);
                        } else if (rand > 0.8) {
                            rand = Math.trunc(rand * 10) + 5;
                            other_lingshi = -1 * rand * time;
                            msg.push("\n途径盗宝团营地，由于你的疏忽,货物被人顺手牵羊,老板大发雷霆,灵石减少" + rand * time);
                        } else if (rand > 0.5 && rand < 0.6) {
                            rand = Math.trunc(rand * 10) + 20;
                            other_lingshi = -1 * rand * time;
                            other_xueqi = -2 * rand * time;
                            msg.push("\n归来途中经过怡红院，你抵挡不住诱惑，进去大肆消费了" + rand * time + "灵石，" +
                                "早上醒来，气血消耗了" + 2 * rand * time);
                        }
                        //
                        player.血气 += other_xueqi;
                        data.setData("player", usr_qq, player);
                        let get_lingshi = lingshi * time + other_lingshi;//最后获取到的灵石
                        //
                        await this.setFileValue(usr_qq, get_lingshi, "灵石");//添加灵石
                        const sql2 = `delete from action where usr_id=${player_action.usr_id};`
                        db1.query(sql2, async (err, result) => {
                            msg.push("\n降妖得到" + get_lingshi + "灵石");
                            if (is_group) {
                                await this.pushInfo(push_address, is_group, msg)
                            } else {
                                await this.pushInfo(usr_qq, is_group, msg);
                            }
                        })
                    }
                }
            }
        })
    }


    /**
     * 增加player文件某属性的值（在原本的基础上增加）
     * @param user_qq
     * @param num 属性的value
     * @param type 修改的属性
     * @returns {Promise<void>}
     */
    async setFileValue(user_qq, num, type) {
        let user_data = data.getData("player", user_qq);
        let current_num = user_data[type];//当前灵石数量
        let new_num = current_num + num;
        if (type == "当前血量" && new_num > user_data.血量上限) {
            new_num = user_data.血量上限;//治疗血量需要判读上限
        }
        user_data[type] = new_num;
        data.setData("player", user_qq, user_data);
        return;
    }

    /**
     * 推送消息，群消息推送群，或者推送私人
     * @param id
     * @param is_group
     * @returns {Promise<void>}
     */
    async pushInfo(id, is_group, msg) {
        if (is_group) {
            await Bot.pickGroup(id)
                .sendMsg(msg)
                .catch((err) => {
                    logger.mark(err);
                });
        } else {
            await common.relpyPrivate(id, msg);
        }
    }
}