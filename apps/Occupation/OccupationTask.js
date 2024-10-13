import common from "../../../../lib/common/common.js"
import plugin from '../../../../lib/plugins/plugin.js'
import config from "../../model/Config.js"
import data from '../../model/XiuxianData.js'
import { Add_najie_thing, Add_职业经验, isNotNull } from "../Xiuxian/xiuxian.js"

//创建连接
import { createRequire } from "module"
const require = createRequire(import.meta.url)
var mysql = require('mysql');
let databaseConfigData = config.getConfig("database", "database");
const db1 = mysql.createPool({
    host: 'localhost',
    user: databaseConfigData.Database.username,
    password: databaseConfigData.Database.password,
    database: 'xiuxiandatabase'
})
/**
 * 定时任务
 */

export class OccupationTask extends plugin {
    constructor() {
        super({
            name: 'OccupationTask',
            dsc: '定时任务',
            event: 'message',
            priority: 300,
            rule: [
            ]
        });
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
        this.set = config.getdefSet('task', 'task')
        this.task = {
            cron: this.set.action_task,
            name: 'OccupationTask',
            fnc: () => this.OccupationTask()
        }


    }

    async OccupationTask() {
        let sql1 = `select * from action where action_zhiye=1;`
        db1.query(sql1, async (err, result) => {
            if (err) {
                console.log(err)
                return
            }

            let action_list0 = result
            if (!action_list0) { return }
            var datas = JSON.stringify(action_list0)
            let action_list
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
                //最后发送的消息
                let msg = [];
                //动作结束时间
                let end_time = player_action.end_time;
                //现在的时间
                let now_time = new Date().getTime();



                //采药
                if (player_action.action_zhiye_1 == "1") {
                    //这里改一改,要在结束时间的前一分钟提前结算
                    //时间过了
                    end_time = end_time - 60000 * 2;
                    if (now_time > end_time) {
                        let player = data.getData("player", player_action.usr_id);

                        if (!isNotNull(player.level_id)) {
                            return;
                        }
                        msg.push(`【${player.名号}】`)


                        let time = parseInt(player_action.time) / 1000 / 60;
                        if (time > 720) {
                            time = 720
                        }
                        let exp = 0;
                        let ext = "";
                        let rate = 0;
                        if (player.occupation == "采药师") {
                            exp = time * 10;
                            rate = data.occupation_exp_list.find(item => item.id == player.occupation_level).rate * 10;
                            ext = `你是采药师，获得采药经验${exp}`;
                        }
                        Add_职业经验(player_action.usr_id, exp);


                        /*凝血草 甜甜花 何首乌 清心草 血精草*/
                        let res = [
                            [0, 0, 0, 0, 0],
                            [0, 0, 0, 0, 0],
                            [0, 0, 0, 0, 0],
                            [0, 0, 0, 0, 0],
                            [0, 0, 0, 0, 0]
                        ]
                        let names = ["凝血草", "甜甜花", "何首乌", "清心草", "血精草"];//可以获得的药材
                        let years = ["一年", "十年", "百年", "千年", "万年"];//可以获得的品级
                        if (player.level_id <= 21) {
                            time = time * player.level_id / 40
                            msg.push("由于你境界不足化神,在琥牢山爬上爬下总被石珀困住，挣脱花了很多时间，收入降低" + (1 - player.level_id / 40) * 50 + "%\n")
                        } else {
                            time = time * player.level_id / 40
                        }

                        while (time > 0) {//time=职业等级X采药时间(分钟)
                            let plant_year = Math.random();//0到1随机一个数字
                            if (plant_year < 0.001 * (1 + rate)) {//最高品质
                                plant_year = 4;
                            }
                            else if (plant_year < 0.01 * (1 + rate)) {
                                plant_year = 3;
                            }
                            else if (plant_year < 0.05 * (1 + rate)) {
                                plant_year = 2;
                            }
                            else if (plant_year < 0.5 * (1 + rate)) {
                                plant_year = 1;
                            }
                            else {
                                plant_year = 0;
                            }
                            time -= 1;//一分钟加一次
                            res[plant_year][Math.floor(Math.random() * 5)] += 1;//数量=1到4随机数
                        }
                        let res_msg = "";
                        for (let i = 0; i < 5; i++) {
                            for (let j = 0; j < 5; j++) {
                                if (res[i][j] > 0) {
                                    res_msg += `\n[${years[i]}${names[j]}]×${res[i][j]}，`;
                                }
                                await Add_najie_thing(player.id, years[i] + names[j], "草药", res[i][j]);
                            }
                        }
                        Add_职业经验(player_action.usr_id, exp);
                        msg.push(`\n采药归来，${ext}${res_msg}`);

                        const sql2 = `delete from action where usr_id=${player_action.usr_id};`
                        db1.query(sql2, () => {
                            if (is_group) {
                                this.pushInfo(push_address, is_group, msg)
                            } else {
                                this.pushInfo(player_action.usr_id, is_group, msg);
                            }
                        })

                    }
                }
                if (player_action.action_zhiye_2 == "1") {
                    //这里改一改,要在结束时间的前一分钟提前结算
                    //时间过了
                    end_time = end_time - 60000 * 2;
                    if (now_time > end_time) {
                        let player = data.getData("player", player_action.usr_id);
                        if (!isNotNull(player.level_id)) {
                            return;
                        }

                        let time = parseInt(player_action.time) / 1000 / 60;//最高720分钟
                        if (time > 720) {
                            time = 720
                        }
                        let mine_amount1 = Math.floor((1.8 + Math.random() * 0.4) * time);//(1.8+随机0到0.4)x时间(分钟)
                        let mine_amount3 = Math.floor(time / 30);//时间除30
                        let rate = data.occupation_exp_list.find(item => item.id == player.occupation_level).rate * 10;
                        let exp = 0;
                        let ext = "";
                        if (player.occupation == "采矿师") {
                            exp = time * 10;
                            time *= rate;
                            ext = `你是采矿师，获得采矿经验${exp}，额外获得矿石${Math.floor(rate * 100)}%，`;
                        }
                        let end_amount = Math.floor(4 * (rate + 1) * (mine_amount1))//普通矿石
                        let end_amount2 = Math.floor(4 * (rate + 1) * (mine_amount3))//稀有
                        if (player.level_id <= 21) {

                            end_amount *= player.level_id / 35
                            end_amount2 *= player.level_id / 35
                            end_amount *= (1 - (1 - player.level_id / 40) * 50)
                            end_amount2 *= (1 - (1 - player.level_id / 40) * 50)
                            msg.push("由于你境界不足化神,在琥牢山爬上爬下总被石珀困住，挣脱花了很多时间，收入降低" + (1 - player.level_id / 40) * 50 + "%\n")
                        } else {
                            end_amount *= player.level_id / 35
                            end_amount2 *= player.level_id / 35
                        }
                        let usr_qq = player.id
                        end_amount = Math.floor(end_amount);
                        end_amount2 = Math.floor(end_amount2);
                        await Add_najie_thing(player_action.usr_id, "庚金", "材料", end_amount);
                        await Add_najie_thing(player_action.usr_id, "玄土", "材料", end_amount);
                        await Add_najie_thing(player_action.usr_id, "红宝石", "材料", end_amount2);
                        await Add_najie_thing(player_action.usr_id, "绿宝石", "材料", end_amount2);
                        await Add_najie_thing(player_action.usr_id, "蓝宝石", "材料", end_amount2);
                        Add_职业经验(usr_qq, exp);
                        msg.push(`\n采矿归来，${ext}\n收获庚金×${end_amount}\n玄土×${end_amount}\n红宝石×${end_amount2}\n绿宝石×${end_amount2}\n蓝宝石×${end_amount2}`);

                        const sql2 = `delete from action where usr_id=${player_action.usr_id};`
                        db1.query(sql2, () => {
                            if (is_group) {
                                this.pushInfo(push_address, is_group, msg)
                            } else {
                                this.pushInfo(player_action.usr_id, is_group, msg);
                            }
                        })

                    }
                }
                if (player_action.action_zhiye_3 == "1") {
                    //这里改一改,要在结束时间的前一分钟提前结算
                    //时间过了
                    end_time = end_time - 60000 * 2;
                    if (now_time > end_time) {
                        var y = this.xiuxianConfigData.mine.time;//固定时间
                        let time = parseInt(player_action.time) / 1000 / 60;//最高720分钟
                        if (time > 720) {
                            time = 720
                        }
                        //超过就按最低的算，即为满足30分钟才结算一次
                        if (time < y) {
                            time = 0;
                        }
                        let player = data.getData("player", player_action.usr_id);
                        if (!isNotNull(player.level_id)) {
                            return;
                        }
                        let msg = [`【${player.名号}】`];
                        //返回数目
                        let shoulie_amount = Math.floor((1.6 + Math.random() * 0.35) * time * 12);
                        //职业经验
                        let exp = 0;
                        let ext = "";
                        if (player.occupation == "猎户") {
                            exp = time * 12;
                            ext = `你是猎户，获得狩猎经验${exp}，`;
                        }

                        let end_amount = Math.floor(shoulie_amount)
                        end_amount *= player.occupation_level / 60
                        end_amount = Math.floor(end_amount);
                        await Add_najie_thing(player_action.usr_id, "野兔", "食材", end_amount);
                        await Add_najie_thing(player_action.usr_id, "野鸡", "食材", end_amount);
                        await Add_najie_thing(player_action.usr_id, "野猪", "食材", end_amount);
                        await Add_najie_thing(player_action.usr_id, "野牛", "食材", end_amount);
                        await Add_najie_thing(player_action.usr_id, "野羊", "食材", end_amount);
                        Add_职业经验(player_action.usr_id, exp);
                        msg.push(`\n狩猎归来，${ext}\n收获野兔×${end_amount}\n野鸡×${end_amount}\n野猪×${end_amount}\n野牛×${end_amount}\n野羊×${end_amount}\n`);
                        const sql2 = `delete from action where usr_id=${player_action.usr_id};`
                        db1.query(sql2, () => {
                            if (is_group) {
                                this.pushInfo(push_address, is_group, msg)
                            } else {
                                this.pushInfo(player_action.usr_id, is_group, msg);
                            }
                        })

                    }
                }
            }
        })
    }





    async pushInfo(id, is_group, msg) {
        if (is_group) {
            await Bot.pickGroup(id)
                .sendMsg(msg)
                .catch((err) => {
                    logger.mark(err);
                });
        }
        else {
            await common.relpyPrivate(id, msg);
        }
    }
}
