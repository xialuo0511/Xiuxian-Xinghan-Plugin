import plugin from '../../../../lib/plugins/plugin.js'
import config from "../../model/Config.js"
import data from '../../model/XiuxianData.js'
//如需截图必须引入以下两库
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';
import { Gulid, sql_run } from '../../api/api.js';
import { Read_player } from '../Xiuxian/xiuxian.js';
import { Add_najie_thing, exist_najie_thing } from '../Xiuxian/xiuxian.js';

import mysql from "mysql"
let databaseConfigData = config.getConfig("database", "database");
//创建连接
const db = mysql.createPool({
    host: 'localhost',
    user: databaseConfigData.Database.username,
    password: databaseConfigData.Database.password,
    database: 'xiuxiandatabase'
})

export class Ningyuandian extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'Yunzai_Bot_xiuxian_Ningyuan',
            /** 功能描述 */
            dsc: '凝渊殿',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: '^#报名凝渊殿$',
                    fnc: 'bmnyd'
                },
                {
                    reg: '^#挑战凝渊殿$',
                    fnc: 'tznyd'
                },
                {
                    reg: '^#查看本月仙殷祥祝$',
                    fnc: 'xyxz'
                },
                {
                    reg: '^#初始化凝渊殿类$',
                    fnc: 'csh'
                },
                {
                    reg: '^#宝玉坊$',
                    fnc: 'byf'
                },
                {
                    reg: '^#宝玉坊购买.*$',
                    fnc: 'buy'
                }
            ]
        })
        this.databaseConfigData = config.getConfig("database", "database");
        this.ningyuandianConfigData = config.getConfig("ningyuandian", "ningyuandian");
    }

    async buy(e) {
        let thing = e.msg.replace("#宝玉坊购买", '');
        if (!thing) {
            e.reply("这位客官，你要买啥呢~")
            return;
        }
        let usr_qq = e.user_id
        let suibi = await exist_najie_thing(usr_qq, "鎏金碎币", "道具")
        if (!suibi) {
            suibi = 0
        }
        let sql1 = `select * from baoyufang`
        let byf_text = JSON.parse(JSON.stringify(await sql_run(sql1)))
        let wuping = byf_text.find(item => item.name == thing)
        if (!wuping) {
            e.reply("客官说的东西小店暂时没有，如果能弄到一定尽量给你弄来~")
            return;
        }
        if (wuping.number < 1) {
            e.reply("物品售罄，请待小店准备一会")
            return;
        }
        if (suibi < wuping.shu2) {
            e.reply("碎币不够哦客官~再去凝渊殿试试身手吧")
            return;
        }
        await Add_najie_thing(usr_qq, thing, wuping.type, wuping.shu1)
        await Add_najie_thing(usr_qq, "鎏金碎币", "道具", -wuping.shu2)
        let sql2 = `update baoyufang set number=${wuping.number - 1} where name='${thing}';`
        await sql_run(sql2)
        e.reply("购买成功！欢迎下次光临！")
        return;
    }

    async byf(e) {
        let sql1 = `select * from baoyufang`
        let byf_text = JSON.parse(JSON.stringify(await sql_run(sql1)))
        console.log(byf_text)
        let suibi = await exist_najie_thing(e.user_id, "鎏金碎币", "道具")
        if (!suibi) {
            suibi = 0
        }
        let byf_data = {
            user_id: e.user_id,
            suibi: suibi,
            byf_text: byf_text
        }
        const data1 = await new Show(e).get_byfData(byf_data);
        let img = await puppeteer.screenshot("byf", {
            ...data1,
        });
        e.reply(img)
        return;
    }

    async csh(e) {
        if (!this.e.isMaster) {
            return;
        }
        let sql2 = `create table if not exists ningyuandian(baoming_time bigint,usr_id bigint,this_level_time bigint,this_level bigint,level_1_round int default 0,level_2_round int default 0,level_3_round int default 0,level_4_round int default 0,level_5_round int default 0,level_6_round int default 0,level_7_round int default 0,level_8_round int default 0,last_challenged_time bigint,PRIMARY KEY(baoming_time))`
        db.query(sql2, (err, result) => {
            if (err) throw e.reply("数据库连接失败，请先配置好并#初始化数据库")
            e.reply("初始化凝渊殿数据表完成")
        })
        let sql3 = `create table if not exists baoyufang(id int,name text,type text,shu1 int default 0,shu2 int default 0,number int default 0,PRIMARY KEY(id))`
        db.query(sql3, (err, result) => {
            if (err) throw e.reply("数据库连接失败，请先配置好并#初始化数据库")
            e.reply("初始化宝玉坊数据表完成")
        })
    }

    async xyxz(e) {
        e.reply("本月仙殷祥祝效果：\n战斗开始时，获得10%攻击力加成，持续3回合\n\n道法仙术加成后效果：\n战斗开始时，获得12%攻击力加成，持续5回合")
        return;
    }

    async bmnyd(e) {
        let usr_qq = e.user_id;
        usr_qq = await Gulid(usr_qq)
        let player = await Read_player(usr_qq)
        if (player.镇妖塔层数 < 3500) {
            e.reply('镇妖塔层数不足3500，无法参与战斗');
            return;
        }
        let sql1 = `select * from ningyuandian where usr_id=${usr_qq} and this_level_time=${this.ningyuandianConfigData.Ningyuandian.level};`
        db.query(sql1, (err, result) => {
            var dataString = JSON.stringify(result);
            let a = JSON.parse(dataString)[0]
            if (a) {
                e.reply("您已报名！")
                return;
            }
            let sql2 = `insert into ningyuandian values (${new Date().getTime()},${usr_qq},${this.ningyuandianConfigData.Ningyuandian.level},1,0,0,0,0,0,0,0,0,0)`
            db.query(sql2, (err, result) => {
                console.log(err)
                e.reply('报名成功！')
                return;
            })
        })
    }

    async tznyd(e) {
        if (!data.existData("player", e.user_id)) {
            e.reply("区区凡人，也想参与此等战斗中吗？请踏入仙途，好好修炼吧！");
            return true;
        }
        let usr_qq = e.user_id;
        usr_qq = await Gulid(usr_qq)
        let player = await Read_player(usr_qq)
        let sql1 = `select * from ningyuandian where this_level_time=${this.ningyuandianConfigData.Ningyuandian.level} and usr_id=${usr_qq};`
        let result = await sql_run(sql1)
        let a = JSON.stringify(result)
        console(a)
        if (a.length <= 2) {
            e.reply('请先#报名凝渊殿')
            return;
        }
        let b = JSON.parse(a)
        b = b[0]
        let now_time = new Date().getTime();
        if (now_time - b.last_challenged_time < 600000) {
            let m = parseInt((600000 - (now_time - b.last_challenged_time)) / 1000 / 60);
            let s = parseInt(((600000 - (now_time - b.last_challenged_time)) - m * 60 * 1000) / 1000);
            e.reply("两次挑战应间隔10分钟，剩余时间:" + m + "分" + s + "秒");
            return;
        }
        if (b.this_level == 8) {
            e.reply("勇士，你已到达凝渊殿最深处，请回吧！")
            return;
        }
        //战斗模块
        let bosszt = data.ningyuan_guai_list_1.find(item => item.id == b.this_level)
        let zd_json = await xh_zd(player, bosszt)
        //结算
        let bi = 0
        if (zd_json.ok) {
            bi += 60
            if (b.this_level + 1 <= 4) {
                if (zd_json.round <= 20) {
                    bi += 20
                }
            }
            if (b.this_level + 1 > 4) {
                if (zd_json.round <= 10) {
                    bi += 20
                }
            }
            bi *= 2
            if (a.this_level_time != 0) {
                await Add_najie_thing(usr_qq, "鎏金碎币", "道具", bi)
            }
            let sql = `update ningyuandian set this_level='${b.this_level + 1}',level_${b.this_level + 1}_round=${zd_json.round},last_challenged_time=${now_time} where this_level_time=${this.ningyuandianConfigData.Ningyuandian.level} and usr_id=${usr_qq};`
            db.query(sql, (err, result) => {
                e.reply(`恭喜挑战成功，获得鎏金碎币*${bi}，进入下一层--第${b.this_level + 1}层!`)
            })

        }

        let log_data = {
            log: zd_json.msg,
        };
        const data1 = await new Show(e).get_logData(log_data);
        let img = await puppeteer.screenshot(`log`, {
            ...data1,
        });
        e.reply(img);
        return true;
    }
}

//攻击攻击防御计算伤害
function Harm(atk, def, bao, baoshang) {
    let x;
    let s = Math.random()
    if (s <= bao) {
        x = atk * (1 + baoshang) / (def * 0.3)
    } else {
        x = atk / (def * 0.3)
    }
    if (x < 1) {
        x = 1
    }
    x = Math.floor(x)

    return x;
}

/*
* 战斗相关
*/
export async function xh_zd(A_player, B_player) {
    let cnt = 1; //回合数
    let cnt1 = 0

    if (!A_player.灵气) {
        A_player.灵气 = 100
    }
    if (!A_player.单段攻击回复灵气) {
        A_player.单段攻击回复灵气 = 20
    }
    if (!A_player.终结技) {
        A_player.终结技 = "破体之力"
    }
    if (!A_player.倍率) {
        A_player.倍率 = 1.5
    }
    //攻击赋值
    let a_atk = A_player.攻击
    let b_atk = B_player.攻击
    //灵气赋值
    let A_lingqi = 0
    let B_lingqi = 0

    let xyxz_cnt = 3
    let xyxz_atk_add = 0.1
    let now_Time = new Date().getTime(); //获取当前时间戳
    if (A_player.daofaxianshu_endtime > now_Time) {
        xyxz_cnt = 5
        xyxz_atk_add = 0.12
    }

    let msg = [];
    let ok = false
    while (A_player.血量上限 > 0 && B_player.血量上限 > 0) {
        if (cnt == 31) {
            msg.push("30回合未战胜魔物，挑战失败！")
            break;
        }
        msg.push(`==第${cnt}回合==`)
        let lingshi_atk = a_atk
        if (xyxz_cnt > 0) {
            msg.push(`本回合获得【仙殷祥祝】祝福，攻击力提高${xyxz_atk_add * 100}%`)
            xyxz_cnt--
            lingshi_atk *= xyxz_atk_add + 1
        }

        let A_shanghai = Harm(lingshi_atk, B_player.防御, A_player.暴击率, A_player.暴击伤害)
        let B_shanghai = Harm(b_atk, A_player.防御, B_player.暴击率, B_player.暴击伤害)
        //A对B
        if (A_lingqi < A_player.灵气) {
            B_player.血量上限 -= A_shanghai
            if (B_player.血量上限 < 0) {
                B_player.血量上限 = 0
            }
            A_lingqi += A_player.单段攻击回复灵气
            msg.push(`【${A_player.名号}】发起了攻击！对【${B_player.名号}】发起了普通攻击，造成伤害${A_shanghai}，【${B_player.名号}】剩余血量${B_player.血量上限}\n||\n回复了${A_player.单段攻击回复灵气}灵气，当前灵气值${A_lingqi}/${A_player.灵气}`)
            if (B_player.血量上限 <= 0) {
                msg.push(`【${A_player.名号}】造成了致命一击，击败了【${B_player.名号}】，结束了战斗！`)
                msg.push(`====================`)
                msg.push(`【${A_player.名号}】赢得了战斗`)
                ok = !ok
                cnt1 = cnt
                break;
            }
        } else {
            B_player.血量上限 -= A_shanghai * A_player.倍率
            A_lingqi -= A_player.灵气
            if (B_player.血量上限 < 0) {
                B_player.血量上限 = 0
            }
            msg.push(`【${A_player.名号}】灵气汇满！消耗了${A_player.灵气}灵气对【${B_player.名号}】发起了终结技${A_player.终结技}，造成伤害${A_shanghai * A_player.倍率}，【${B_player.名号}】剩余血量${B_player.血量上限}，当前灵气值${A_lingqi}/${A_player.灵气}`)
            if (B_player.血量上限 <= 0) {
                msg.push(`【${A_player.名号}】造成了致命一击，击败了【${B_player.名号}】，结束了战斗！`)
                msg.push(`====================`)
                msg.push(`【${A_player.名号}】赢得了战斗`)
                ok = !ok
                cnt1 = cnt
                break;
            }
        }

        //B对A
        if (B_lingqi < B_player.灵气) {
            A_player.血量上限 -= B_shanghai
            if (A_player.血量上限 < 0) {
                A_player.血量上限 = 0
            }
            B_lingqi += B_player.单段攻击回复灵气
            msg.push(`【${B_player.名号}】发起了攻击！对【${A_player.名号}】发起了普通攻击，造成伤害${B_shanghai}，【${A_player.名号}】剩余血量${A_player.血量上限}\n||\n回复了${B_player.单段攻击回复灵气}灵气，当前灵气值${B_lingqi}/${B_player.灵气}`)
            if (A_player.血量上限 <= 0) {
                msg.push(`【${B_player.名号}】造成了致命一击，击败了【${A_player.名号}】，结束了战斗！`)
                msg.push(`====================`)
                msg.push(`】${B_player.名号}】赢得了战斗`)
                break;
            }
        } else {
            A_player.血量上限 -= B_shanghai * B_player.倍率
            B_lingqi -= B_player.灵气
            if (A_player.血量上限 < 0) {
                A_player.血量上限 = 0
            }
            msg.push(`【${B_player.名号}】灵气汇满！消耗了${B_player.灵气}灵气对【${A_player.名号}】发起了终结技${B_player.终结技}，造成伤害${B_shanghai * B_player.倍率}，【${A_player.名号}】剩余血量${A_player.血量上限}，当前灵气值${B_lingqi}/${B_player.灵气}`)
            if (A_player.血量上限 <= 0) {
                msg.push(`【${B_player.名号}】造成了致命一击，击败了【${A_player.名号}】，结束了战斗！`)
                msg.push(`====================`)
                msg.push(`【${B_player.名号}】赢得了战斗`)
                break;
            }
        }
        cnt++;
    }
    let m = { msg: msg, round: cnt1, ok: ok, };
    return m;
}