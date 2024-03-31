import plugin from '../../../../lib/plugins/plugin.js'
import fs from "fs"
import path from "path"
import Show from "../../model/show.js";
import puppeteer from "../../../../lib/puppeteer/puppeteer.js";
import data from '../../model/XiuxianData.js'
import { __PATH } from "../Xiuxian/xiuxian.js"
import { ForwardMsg, Read_player, shijianc, Add_灵石, existplayer, Add_najie_thing, exist_najie_thing } from "../Xiuxian/xiuxian.js"
import { zd_battle } from "../Battle/Battle.js"
import config from "../../model/Config.js"

import { createRequire } from "module"
const require = createRequire(import.meta.url)
import mysql from "mysql"
import { constrainedMemory } from 'process';
let databaseConfigData = config.getConfig("database", "database");
//创建连接
const db = mysql.createPool({
    host: 'localhost',
    user: databaseConfigData.Database.username,
    password: databaseConfigData.Database.password,
    database: 'xiuxiandatabase'
})

export class Tiandibang extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'Tiandibang',
            /** 功能描述 */
            dsc: '交易模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: '^#天地榜$',
                    fnc: 'my_point'
                },
                {
                    reg: '^#比试$',
                    fnc: 'pk'
                },
                {
                    reg: '^#报名比赛',
                    fnc: 'cansai'
                },
                {
                    reg: '^#天地堂',
                    fnc: 'tianditang'
                },
                {
                    reg: '^#积分兑换(.*)$',
                    fnc: 'duihuan'
                }
            ]
        });
        this.set = config.getdefSet('task', 'task')
        this.task = {
            cron: this.set.saiji,
            name: 're_bangdang',
            fnc: () => this.re_bangdang()
        }
    }

    async duihuan(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let date = new Date();
        let n = date.getDay();
        if (n != 0) {
            e.reply(`物品筹备中，等到周日再来兑换吧`);
            return;
        }

        let usr_qq = e.user_id;
        //查看存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        var reg = new RegExp(/积分兑换/);
        let msg = e.msg.replace(reg, '');
        msg = msg.replace("#", '');
        let thing_name = msg.replace("积分兑换", '');
        let ifexist = data.tianditang.find(item => item.name == thing_name);
        if (!ifexist) {
            e.reply(`天地堂还没有这样的东西:${thing_name}`);
            return;
        }
        let sql1 = `select * from tiandibang where usr_id=${usr_qq};`
        db.query(sql1, async (err, result) => {
            var dataString = JSON.stringify(result);
            let a = JSON.parse(dataString)
            a = a[0]
            if (!a) {
                e.reply("您未报名")
                return;
            }
            if (a.jifen < ifexist.积分) {
                e.reply(`积分不足,还需${ifexist.积分 - a.jifen}积分兑换${thing_name}`);
                return;
            }
            a.jifen -= ifexist.积分;
            await Add_najie_thing(usr_qq, thing_name, ifexist.class, 1);
            let sql2 = `update tiandibang set jifen='${a.jifen}' where usr_id=${usr_qq};`
            db.query(sql2, (err, result) => {
                e.reply([`兑换成功!获得[${thing_name}],剩余[${a.jifen}]积分`, '\n可以在【我的纳戒】中查看']);
                return;
            })

        })

    }

    async tianditang(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id;
        //查看存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let sql1 = `select * from tiandibang where usr_id=${usr_qq};`
        db.query(sql1, async (err, result) => {
            var dataString = JSON.stringify(result);
            let a = JSON.parse(dataString)
            a = a[0]
            if (!a) {
                e.reply("您未报名")
                return;
            }
            let img = await get_tianditang_img(e, a.jifen);
            e.reply(img);
            return;
        })

    }

    async cansai(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id;
        //查看存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let sql1 = `select * from tiandibang where usr_id=${usr_qq};`
        db.query(sql1, async (err, result) => {
            var dataString = JSON.stringify(result);
            let a = JSON.parse(dataString)
            a = a[0]
            if (a) {
                e.reply("你已经参赛了!")
                return;
            }
            let sql2 = `insert into tiandibang values (${usr_qq},3,0,0,0,0)`
            db.query(sql2, (err, result) => {
                e.reply("参赛成功!");
                return;
            })
        })
    }

    async my_point(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id;
        //查看存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let sql1 = `select * from tiandibang where usr_id=${usr_qq};`
        db.query(sql1, async (err, result) => {
            var dataString = JSON.stringify(result);
            let a = JSON.parse(dataString)
            a = a[0]
            if (!a) {
                e.reply("请先报名")
                return;
            }
            let sql2 = `select * from tiandibang;`
            db.query(sql2, async (err, result) => {
                var dataString = JSON.stringify(result);
                let tiandibang = JSON.parse(dataString)
                for (var i = 0; i < tiandibang.length; i++) {
                    let play = await Read_player(tiandibang[i].usr_id)
                    tiandibang[i].名号 = play.名号
                }
                let l = 10;
                let msg = [
                    "***天地榜(每日免费三次周一0点清空积分)***",
                ];
                for (var i = 0; i < tiandibang.length; i++) {
                    if (tiandibang[i].usr_qq == usr_qq) {
                        x = i;
                        break;
                    }
                }
                let x = tiandibang.length;
                if (l > tiandibang.length) {
                    l = tiandibang.length;
                }
                let b = []
                if (x < l) {
                    for (var m = 0; m < l; m++) {
                        b.push(tiandibang[m])
                    }
                }
                else if (x >= l && (tiandibang.length - x) < l) {
                    for (var m = tiandibang.length - l; m < tiandibang.length; m++) {
                        b.push(tiandibang[m])
                    }
                }
                else {
                    for (var m = x - 5; m < x + 5; m++) {
                        b.push(tiandibang[m])
                    }
                }
                b.sort(function (a, b) {
                    if (a.jifen === b.jifen) {
                        return a.the_best_jifen - b.the_best_jifen
                    } else {
                        return b.jifen - a.jifen
                    }
                })
                for (var i = 0; i < b.length; i++) {
                    msg.push(
                        "名次：" + (i + 1) +
                        "|名号：" + b[i].名号 +
                        "|积分：" + b[i].jifen +
                        "|最高积分：" + b[i].the_best_jifen +
                        "|累计挑战次数：" + b[i].all_cishu
                    );
                }



                let log_data = {
                    log: msg,
                };
                const data1 = await new Show(e).get_logData(log_data);
                let img = await puppeteer.screenshot('log', {
                    ...data1,
                });
                e.reply(img);
                return;
            })
        })

    }

    async pk(e) {
        //不开放私聊
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
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
        let sql1 = `select * from tiandibang where usr_id=${usr_qq};`
        db.query(sql1, async (err, result) => {
            var dataString = JSON.stringify(result);
            let a = JSON.parse(dataString)
            a = a[0]
            if (!a) {
                e.reply("请先报名")
                return;
            }
            let sql2 = `select * from tiandibang;`
            db.query(sql2, async (err, result) => {
                var dataString = JSON.stringify(result);
                let tiandibang = JSON.parse(dataString)
                let x = tiandibang.length;
                for (var m = 0; m < tiandibang.length; m++) {
                    if (tiandibang[m].usr_id == usr_qq) {
                        x = m;
                        break;
                    }
                }
                let last_msg = [];
                let atk = 1;
                let def = 1;
                let blood = 1;
                let now = new Date();
                let nowTime = now.getTime(); //获取当前日期的时间戳
                let Today = await shijianc(nowTime);
                let lastbisai_time = await shijianc(tiandibang[x].last_time);//获得上次pk日期
                if (Today.Y != lastbisai_time.Y || Today.M != lastbisai_time.M || Today.D != lastbisai_time.D) {
                    tiandibang[x].last_time = nowTime
                    tiandibang[x].cishu = 3;
                }
                for (var i = 0; i < tiandibang.length; i++) {
                    let playerer = await Read_player(tiandibang[i].usr_id)
                    tiandibang[i].名号 = playerer.名号
                    tiandibang[i].境界 = playerer.level_id
                    tiandibang[i].攻击 = playerer.攻击
                    tiandibang[i].防御 = playerer.防御
                    tiandibang[i].当前血量 = playerer.血量上限
                    tiandibang[i].学习的功法 = playerer.学习的功法
                    tiandibang[i].灵根 = playerer.灵根
                    tiandibang[i].法球倍率 = playerer.灵根.法球倍率
                }
                if (Today.Y == lastbisai_time.Y && Today.M == lastbisai_time.M && Today.D == lastbisai_time.D && tiandibang[x].cishu < 1) {
                    let zbl = await exist_najie_thing(usr_qq, "摘榜令", "道具");
                    if (zbl) {
                        tiandibang[x].cishu = 1;
                        await Add_najie_thing(usr_qq, "摘榜令", "道具", -1);
                        last_msg.push(`${tiandibang[x].名号}使用了摘榜令\n`);
                    }
                    else {
                        e.reply("今日挑战次数用光了,请明日再来吧");
                        return;
                    }
                }
                let lingshi;
                if (x != 0) {
                    let k = Math.ceil(Math.random() * tiandibang.length);
                    if (k == 0 || tiandibang[x].名号 == tiandibang[k].名号) {
                        k = -1
                    }
                    let B_player;
                    if (k != -1) {
                        if ((tiandibang[k].攻击 / tiandibang[x].攻击) > 2) {
                            atk = 2;
                            def = 2;
                            blood = 2;
                        }
                        else if ((tiandibang[k].攻击 / tiandibang[x].攻击) > 1.6) {
                            atk = 1.6;
                            def = 1.6;
                            blood = 1.6;
                        }
                        else if ((tiandibang[k].攻击 / tiandibang[x].攻击) > 1.3) {
                            atk = 1.3;
                            def = 1.3;
                            blood = 1.3;
                        }
                        B_player = {
                            名号: tiandibang[k].名号,
                            攻击: tiandibang[k].攻击,
                            防御: tiandibang[k].防御,
                            当前血量: tiandibang[k].当前血量,
                            暴击率: tiandibang[k].暴击率,
                            学习的功法: tiandibang[k].学习的功法,
                            灵根: tiandibang[k].灵根,
                            法球倍率: tiandibang[k].法球倍率
                        }
                    }
                    let A_player = {
                        名号: tiandibang[x].名号,
                        攻击: parseInt((tiandibang[x].攻击)) * atk,
                        防御: parseInt((tiandibang[x].防御) * def),
                        当前血量: parseInt((tiandibang[x].当前血量) * blood),
                        暴击率: tiandibang[x].暴击率,
                        学习的功法: tiandibang[x].学习的功法,
                        灵根: tiandibang[x].灵根,
                        法球倍率: tiandibang[x].法球倍率
                    }
                    if (k == -1) {
                        atk = (0.8 + 0.4 * Math.random());
                        def = (0.8 + 0.4 * Math.random());
                        blood = (0.8 + 0.4 * Math.random());
                        B_player = {
                            名号: "灵修兽",
                            攻击: parseInt((tiandibang[x].攻击)) * atk,
                            防御: parseInt((tiandibang[x].防御) * def),
                            当前血量: parseInt((tiandibang[x].当前血量) * blood),
                            暴击率: tiandibang[x].暴击率,
                            学习的功法: tiandibang[x].学习的功法,
                            灵根: tiandibang[x].灵根,
                            法球倍率: 0.1
                        }
                    }
                    let Data_battle = await zd_battle(A_player, B_player);
                    let msg = Data_battle.msg;
                    let A_win = `${A_player.名号}击败了${B_player.名号}`;
                    let B_win = `${B_player.名号}击败了${A_player.名号}`;
                    if (msg.find(item => item == A_win)) {
                        if (k == -1) {
                            tiandibang[x].jifen += 1500;
                            lingshi = tiandibang[x].jifen * 2.5;
                        }
                        else {
                            tiandibang[x].jifen += 2000;
                            lingshi = tiandibang[x].jifen * 2;
                        }
                        tiandibang[x].cishu -= 1;
                        if (tiandibang[x].the_best_jifen < tiandibang[x].jifen) {
                            tiandibang[x].the_best_jifen = tiandibang[x].jifen
                        }
                        last_msg.push(`${A_player.名号}击败了[${B_player.名号}],当前积分[${tiandibang[x].jifen}],获得了[${lingshi}]灵石`);
                        let sql2 = `update tiandibang set the_best_jifen=${tiandibang[x].the_best_jifen},jifen=${tiandibang[x].jifen},cishu=${tiandibang[x].cishu},all_cishu=${tiandibang[x].all_cishu + 1},last_time=${tiandibang[x].last_time} where usr_id=${usr_qq};`
                        db.query(sql2)
                    }
                    else if (msg.find(item => item == B_win)) {
                        if (k == -1) {
                            tiandibang[x].jifen += 800;
                            lingshi = tiandibang[x].jifen * 2.5;
                        }
                        else {
                            tiandibang[x].jifen += 1000;
                            lingshi = tiandibang[x].jifen * 2;
                        }
                        tiandibang[x].cishu -= 1;
                        if (tiandibang[x].the_best_jifen < tiandibang[x].jifen) {
                            tiandibang[x].the_best_jifen = tiandibang[x].jifen
                        }
                        last_msg.push(`${A_player.名号}被[${B_player.名号}]打败了,当前积分[${tiandibang[x].jifen}],获得了[${lingshi}]灵石`);
                        let sql2 = `update tiandibang set the_best_jifen=${tiandibang[x].the_best_jifen},jifen=${tiandibang[x].jifen},cishu=${tiandibang[x].cishu},all_cishu=${tiandibang[x].all_cishu + 1},last_time=${tiandibang[x].last_time} where usr_id=${usr_qq};`
                        db.query(sql2)
                    }
                    else {
                        e.reply(`战斗过程出错`);
                        return;
                    }
                    await Add_灵石(usr_qq, lingshi);
                    let log_data = {
                        log: msg,
                    };
                    const data1 = await new Show(e).get_logData(log_data);
                    let img = await puppeteer.screenshot('log', {
                        ...data1,
                    });
                    e.reply(img);
                    e.reply(last_msg);
                }
                else {
                    let A_player = {
                        名号: tiandibang[x].名号,
                        攻击: (tiandibang[x].攻击),
                        防御: (tiandibang[x].防御),
                        当前血量: (tiandibang[x].当前血量),
                        暴击率: tiandibang[x].暴击率,
                        学习的功法: tiandibang[x].学习的功法,
                        灵根: tiandibang[x].灵根,
                        法球倍率: tiandibang[x].法球倍率
                    }
                    atk = (0.8 + 0.4 * Math.random());
                    def = (0.8 + 0.4 * Math.random());
                    blood = (0.8 + 0.4 * Math.random());
                    let B_player = {
                        名号: "灵修兽",
                        攻击: parseInt((tiandibang[x].攻击)) * atk,
                        防御: parseInt((tiandibang[x].防御) * def),
                        当前血量: parseInt((tiandibang[x].当前血量) * blood),
                        暴击率: tiandibang[x].暴击率,
                        学习的功法: tiandibang[x].学习的功法,
                        灵根: tiandibang[x].灵根,
                        法球倍率: tiandibang[x].法球倍率
                    }
                    let Data_battle = await zd_battle(A_player, B_player);
                    let msg = Data_battle.msg;
                    let A_win = `${A_player.名号}击败了${B_player.名号}`;
                    let B_win = `${B_player.名号}击败了${A_player.名号}`;
                    if (msg.find(item => item == A_win)) {
                        tiandibang[x].jifen += 1500;
                        tiandibang[x].cishu -= 1;
                        lingshi = tiandibang[x].jifen * 3;
                        if (tiandibang[x].the_best_jifen < tiandibang[x].jifen) {
                            tiandibang[x].the_best_jifen = tiandibang[x].jifen
                        }
                        last_msg.push(`${A_player.名号}击败了[${B_player.名号}],当前积分[${tiandibang[x].jifen}],获得了[${lingshi}]灵石`);
                        let sql2 = `update tiandibang set the_best_jifen=${tiandibang[x].the_best_jifen},jifen=${tiandibang[x].jifen},cishu=${tiandibang[x].cishu},all_cishu=${tiandibang[x].all_cishu + 1},last_time=${tiandibang[x].last_time} where usr_id=${usr_qq};`
                        db.query(sql2)
                    }
                    else if (msg.find(item => item == B_win)) {
                        tiandibang[x].jifen += 800;
                        tiandibang[x].cishu -= 1;
                        lingshi = tiandibang[x].jifen * 3;
                        if (tiandibang[x].the_best_jifen < tiandibang[x].jifen) {
                            tiandibang[x].the_best_jifen = tiandibang[x].jifen
                        }
                        last_msg.push(`${A_player.名号}被[${B_player.名号}]打败了,当前积分[${tiandibang[x].jifen}],获得了[${lingshi}]灵石`);
                        let sql2 = `update tiandibang set the_best_jifen=${tiandibang[x].the_best_jifen},jifen=${tiandibang[x].jifen},cishu=${tiandibang[x].cishu},all_cishu=${tiandibang[x].all_cishu + 1},last_time=${tiandibang[x].last_time} where usr_id=${usr_qq};`
                        db.query(sql2)
                    }
                    else {
                        e.reply(`战斗过程出错`);
                        return;
                    }
                    await Add_灵石(usr_qq, lingshi);
                    let log_data = {
                        log: msg,
                    };
                    const data1 = await new Show(e).get_logData(log_data);
                    let img = await puppeteer.screenshot('log', {
                        ...data1,
                    });
                    e.reply(img);
                    e.reply(last_msg);
                }
                return;
            })

        })



    }

    async re_bangdang() {
        let sql2 = `update tiandibang set jifen=0;`
        db.query(sql2, (err, result) => {
            return;
        })
    }




}

async function get_tianditang_img(e, jifen) {
    let usr_qq = e.user_id;
    let player = await Read_player(usr_qq);
    let commodities_list = data.tianditang;
    let tianditang_data = {
        name: player.名号,
        jifen,
        commodities_list: commodities_list
    }
    const data1 = await new Show(e).get_tianditangData(tianditang_data);
    let img = await puppeteer.screenshot("tianditang", {
        ...data1,
    });
    return img;

}