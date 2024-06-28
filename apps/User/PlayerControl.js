
import plugin from '../../../../lib/plugins/plugin.js'
import common from "../../../../lib/common/common.js"
import config from "../../model/Config.js"
import data from '../../model/XiuxianData.js'
import { player_efficiency, Read_player, existplayer, isNotNull, exist_najie_thing, Add_najie_thing, Add_血气, Add_修为 } from '../Xiuxian/xiuxian.js'

import { createRequire } from "module"
const require = createRequire(import.meta.url)
import mysql from "mysql"
let databaseConfigData = config.getConfig("database", "database");
//创建连接
const db = mysql.createPool({
    host: 'localhost',
    user: databaseConfigData.Database.username,
    password: databaseConfigData.Database.password,
    database: 'xiuxiandatabase'
})

/**
 * 定时任务
 */

export class PlayerControl extends plugin {
    constructor() {
        super({
            name: 'PlayerControl',
            dsc: '控制人物的行为',
            event: 'message',
            priority: 600,
            rule: [
                {
                    reg: '(^#*降妖$)|(^#*降妖(.*)(分|分钟)$)',
                    fnc: 'Dagong'
                },
                {
                    reg: '(^#闭关$)|(^#闭关(.*)(分|分钟)$)',
                    fnc: 'Biguan'
                },
                {
                    reg: '^#出关$',
                    fnc: 'chuGuan'
                },
                {
                    reg: '^#降妖归来$',
                    fnc: 'endWork'
                }
            ]
        });
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }


    //闭关
    async Biguan(e) {

        let usr_qq = e.user_id;//用户qq
        //有无存档
        if (!await existplayer(usr_qq)) {
            return;
        }

        //不开放私聊
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }


        //获取时间
        let time = e.msg.replace("#", "");
        time = time.replace("闭关", "");
        time = time.replace("分", "");
        time = time.replace("钟", "");
        if (parseInt(time) == parseInt(time)) {
            time = parseInt(time);
            var y = 30;//时间
            var x = 240;//循环次数
            //如果是 >=16*33 ----   >=30
            for (var i = x; i > 0; i--) {
                if (time >= y * i) {
                    time = y * i;
                    break;
                }
            }
            //如果<30，修正。
            if (time < 30) {
                time = 30;
            }
        }
        else {
            //不设置时间默认60分钟
            time = 30;
        }

        let sql1 = `select * from action where usr_id=${usr_qq};`
        db.query(sql1, async (err, result) => {
            let action = JSON.stringify(result)
            if (action != undefined && action != "undefined" && action.length > 2) {
                action = JSON.parse(action)
                action = action[0]
                let now_time = new Date().getTime();
                let m = parseInt((action.end_time - now_time) / 1000 / 60);
                let s = parseInt(((action.end_time - now_time) - m * 60 * 1000) / 1000);
                e.reply("正在" + action.action + "中，剩余时间:" + m + "分" + s + "秒");
                return;
            }
            let msg = ""
            let biguan_action = await redis.get('xiuxian:player:' + usr_qq + ':biguang');
            biguan_action = JSON.parse(biguan_action);
            if (biguan_action) {
                if (biguan_action.biguan > 0) {
                    msg += "本次闭关消耗一次辟谷丹效果，还剩" + (biguan_action.biguan - 1) + "次(仅闭关获得收益后才会消耗次数)\n"
                }
            }
            let lianshen_action = await redis.get('xiuxian:player:' + usr_qq + ':lianshen');
            lianshen_action = JSON.parse(lianshen_action);
            if (lianshen_action) {
                if (lianshen_action.lianti > 0) {
                    msg += "本次闭关消耗一次炼神之力(仅闭关获得收益后才会消耗次数)\n"
                }
            }
            let action_time = time * 60 * 1000;//持续时间，单位毫秒
            let group_id = 0
            if (e.isGroup) {
                group_id = e.group_id
            }
            let sql3 = `insert into action values(${usr_qq},'闭关',${new Date().getTime() + action_time},${action_time},${group_id},0,0,0,0,0,0,0,1,0,0,0,'') `
            db.query(sql3)
            e.reply(msg + `现在开始闭关${time}分钟,两耳不闻窗外事了`);
            return;
        })

    }




    //降妖
    async Dagong(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id;//用户qq
        //有无存档
        if (!await existplayer(usr_qq)) {
            return;
        }
        //获取时间
        let time = e.msg.replace("#", "");
        time = time.replace("降妖", "");
        time = time.replace("分", "");
        time = time.replace("钟", "");
        if (parseInt(time) == parseInt(time)) {
            time = parseInt(time);//你选择的时间
            var y = 15;//固定时间
            var x = 48;//循环次数
            //如果是 >=16*33 ----   >=30
            for (var i = x; i > 0; i--) {
                if (time >= y * i) {
                    time = y * i;
                    break;
                }
            }
            //如果<30，修正。
            if (time < 15) {
                time = 15;
            }
        }
        else {
            //不设置时间默认60分钟
            time = 30;
        }


        let player = await Read_player(usr_qq);
        if (player.当前血量 < 200) {
            e.reply("你都伤成这样了,先去疗伤吧");
            return;
        }
        //查询redis中的人物动作
        let sql1 = `select * from action where usr_id=${usr_qq};`
        db.query(sql1, async (err, result) => {
            let action = JSON.stringify(result)
            if (action != undefined && action != "undefined" && action.length > 2) {
                action = JSON.parse(action)
                action = action[0]
                let now_time = new Date().getTime();
                let m = parseInt((action.end_time - now_time) / 1000 / 60);
                let s = parseInt(((action.end_time - now_time) - m * 60 * 1000) / 1000);
                e.reply("正在" + action.action + "中，剩余时间:" + m + "分" + s + "秒");
                return;
            }
            let action_time = time * 60 * 1000;//持续时间，单位毫秒
            let group_id = 0
            if (e.isGroup) {
                group_id = e.group_id
            }
            let sql3 = `insert into action values(${usr_qq},'降妖',${new Date().getTime() + action_time},${action_time},${group_id},0,0,0,0,0,0,0,0,1,0,0,'') `
            db.query(sql3)
            e.reply(`现在开始降妖${time}分钟`);
            return true;
        })
    }
    /**
     * 人物结束闭关
     * @param e
     * @returns {Promise<void>}
     */
    async chuGuan(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let sql1 = `select * from action where usr_id=${e.user_id};`
        db.query(sql1, async (err, result) => {
            let b = JSON.stringify(result)
            let action0 = JSON.parse(b);
            var action = action0[0]
            if (!action) {
                return;
            }
            if (action.action != "闭关") {
                return;
            }
            //结算
            let end_time = action.end_time;
            let start_time = action.end_time - action.time;
            let now_time = new Date().getTime();
            let time;


            var y = this.xiuxianConfigData.biguan.time;//固定时间
            var x = this.xiuxianConfigData.biguan.cycle;//循环次数


            if (end_time > now_time) {
                //属于提前结束
                time = parseInt((new Date().getTime() - start_time) / 1000 / 60);
                //超过就按最低的算，即为满足30分钟才结算一次
                //如果是 >=16*33 ----   >=30
                for (var i = x; i > 0; i--) {
                    if (time >= y * i) {
                        time = y * i;
                        break;
                    }
                }
                if (time < y) {
                    time = 0;
                }
            } else {//属于结束了未结算
                time = parseInt((action.time) / 1000 / 60);
                //超过就按最低的算，即为满足30分钟才结算一次
                //如果是 >=16*33 ----   >=30
                for (var i = x; i > 0; i--) {
                    if (time >= y * i) {
                        time = y * i;
                        break;
                    }
                }
                if (time < y) {
                    time = 0;
                }
            }

            if (e.isGroup) {
                await this.biguan_jiesuan(e.user_id, time, false, e.group_id);//提前闭关结束不会触发随机事件
            } else {
                await this.biguan_jiesuan(e.user_id, time, false);//提前闭关结束不会触发随机事件
            }

            const sql2 = `delete from action where usr_id=${e.user_id};`
            db.query(sql2)
            return;
        })
    }



    /*
     * 人物结束降妖
     * @param e
     * @returns {Promise<void>}
     */
    async endWork(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let sql1 = `select * from action where usr_id=${e.user_id};`
        db.query(sql1, async (err, result) => {
            let b = JSON.stringify(result)
            let action0 = JSON.parse(b);
            var action = action0[0]
            if (!action) {
                return;
            }
            if (action.action != "降妖") {
                return;
            }
            //结算
            let end_time = action.end_time;
            let start_time = action.end_time - action.time;
            let now_time = new Date().getTime();
            let time;
            var y = this.xiuxianConfigData.work.time;//固定时间
            var x = this.xiuxianConfigData.work.cycle;//循环次数

            if (end_time > now_time) {//属于提前结束
                time = parseInt((new Date().getTime() - start_time) / 1000 / 60);
                //超过就按最低的算，即为满足30分钟才结算一次
                //如果是 >=16*33 ----   >=30
                for (var i = x; i > 0; i--) {
                    if (time >= y * i) {
                        time = y * i;
                        break;
                    }
                }
                //如果<15，不给收益
                if (time < y) {
                    time = 0;
                }
            } else {//属于结束了未结算
                time = parseInt((action.time) / 1000 / 60);
                //超过就按最低的算，即为满足30分钟才结算一次
                //如果是 >=16*33 ----   >=30
                for (var i = x; i > 0; i--) {
                    if (time >= y * i) {
                        time = y * i;
                        break;
                    }
                }
                //如果<15，不给收益
                if (time < y) {
                    time = 0;
                }
            }

            if (e.isGroup) {
                await this.dagong_jiesuan(e.user_id, time, false, e.group_id);//提前闭关结束不会触发随机事件
            } else {
                await this.dagong_jiesuan(e.user_id, time, false);//提前闭关结束不会触发随机事件
            }

            const sql2 = `delete from action where usr_id=${e.user_id};`
            db.query(sql2)
            return;
        })
    }
    /**
     * 闭关结算
     * @param usr_qq
     * @param time持续时间(单位用分钟)
     * @param is_random是否触发随机事件  true,false
     * @param group_id  回复消息的地址，如果为空，则私聊
     * @returns {Promise<void>}
     */
    async biguan_jiesuan(user_id, time, is_random, group_id) {

        let usr_qq = user_id;
        await player_efficiency(usr_qq);
        let player = data.getData("player", usr_qq);
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

        let msg = [segment.at(usr_qq)];
        //炼丹师丹药修正
        let transformation = "修为"
        let xueqi = 0
        //随机事件预留空间
        if (is_random) {
            let rand = Math.random();
            //顿悟
            if (rand < 0.2) {
                rand = Math.trunc(rand * 10) + 45;
                other_xiuwei = rand * time;
                xueqi = Math.trunc(rand * time);
                if (transformation == "血气") {
                    msg.push("\n本次闭关顿悟,受到炼神之力修正,额外增加血气:" + xueqi);
                } else {
                    msg.push("\n本次闭关顿悟,额外增加修为:" + rand * time);
                }
            }
            //走火入魔
            else if (rand > 0.8) {
                rand = Math.trunc(rand * 10) + 5;
                other_xiuwei = -1 * rand * time;
                xueqi = Math.trunc(rand * time);
                if (transformation == "血气") {
                    msg.push("\n,由于你闭关时隔壁装修,导致你差点走火入魔,受到炼神之力修正,血气下降" + xueqi);

                } else {
                    msg.push("\n由于你闭关时隔壁装修,导致你差点走火入魔,修为下降" + rand * time);
                }
            }
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
        msg.push("\n增加修为:" + xiuwei * time, "\n获得治疗,血量增加:" + blood * time);

        let lianshen_action = await redis.get('xiuxian:player:' + usr_qq + ':lianshen');
        lianshen_action = JSON.parse(lianshen_action);
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
        biguan_action = JSON.parse(biguan_action)
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

        if (group_id) {
            await this.pushInfo(group_id, true, msg)
        } else {
            await this.pushInfo(usr_qq, false, msg);
        }
        return;
    }




    /**
     * 降妖结算
     * @param usr_qq
     * @param time持续时间(单位用分钟)
     * @param is_random是否触发随机事件  true,false
     * @param group_id  回复消息的地址，如果为空，则私聊
     * @returns {Promise<void>}
     */
    async dagong_jiesuan(user_id, time, is_random, group_id) {


        let usr_qq = user_id;
        let player = data.getData("player", usr_qq);
        let now_level_id;
        if (!isNotNull(player.level_id)) {
            return;
        }
        now_level_id = data.Level_list.find(item => item.level_id == player.level_id).level_id;
        var size = this.xiuxianConfigData.work.size;
        let lingshi = size * now_level_id;
        let other_lingshi = 0;//额外的灵石
        let Time = time * 2;
        let msg = [segment.at(usr_qq)];
        if (is_random) {//随机事件预留空间
            let rand = Math.random();
            if (rand < 0.2) {
                rand = Math.trunc(rand * 10) + 40;
                other_lingshi = rand * Time;
                msg.push("\n本次增加灵石" + rand * Time);
            } else if (rand > 0.8) {
                rand = Math.trunc(rand * 10) + 5;
                other_lingshi = -1 * rand * Time;
                msg.push("\n由于你的疏忽,货物被人顺手牵羊,老板大发雷霆,灵石减少" + rand * Time);
            }
        }
        let get_lingshi = lingshi * Time + other_lingshi * 1.5;//最后获取到的灵石

        //设置灵石
        await this.setFileValue(usr_qq, get_lingshi, "灵石");

        //给出消息提示
        if (is_random) {
            msg.push("\n增加灵石" + get_lingshi);
        } else {
            msg.push("\n增加灵石" + get_lingshi);
        }

        if (group_id) {
            await this.pushInfo(group_id, true, msg)
        } else {
            await this.pushInfo(usr_qq, false, msg);
        }

        return;
    }


    /**
     * 获取缓存中的人物状态信息
     * @param usr_qq
     * @returns {Promise<void>}
     */
    async getPlayerAction(usr_qq) {
        let sql1 = `select * from action where usr_id=${usr_qq};`
        var mysql = require('mysql');
        let databaseConfigData = config.getConfig("database", "database");
        //创建连接
        const db1 = mysql.createPool({
            host: 'localhost',
            user: databaseConfigData.Database.username,
            password: databaseConfigData.Database.password,
            database: 'xiuxiandatabase'
        })
        db1.query(sql1, (err, result) => {
            var action0 = JSON.stringify(result)
            let action = JSON.parse(action0);
            let a = action[0]
            console.log(a)
            return a;
        })
    }

    /**
     * 获取人物的状态，返回具体的状态或者空闲
     * @param action
     * @returns {Promise<void>}
     */
    async getPlayerState(action) {
        if (!action) {
            return "空闲";
        }

        return action.action;
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


    /**
     * 增加player文件某属性的值（在原本的基础上增加）
     * @param user_qq
     * @param num 属性的value
     * @param type 修改的属性
     * @returns {Promise<void>}
     */
    async setFileValue(user_qq, num, type) {
        let user_data = data.getData("player", user_qq);
        let current_num = user_data[type];
        let new_num = current_num + num;
        if (type == "当前血量" && new_num > user_data.血量上限) {
            new_num = user_data.血量上限;//治疗血量需要判读上限
        }
        user_data[type] = new_num;
        data.setData("player", user_qq, user_data);
        return;
    }



}

