//#tag已适配
import plugin from '../../../../lib/plugins/plugin.js'
import data from '../../model/XiuxianData.js'
import config from "../../model/Config.js"
import { Read_player, existplayer, isNotNull, sleep, exist_najie_thing, Add_najie_thing, convert2integer } from '../Xiuxian/xiuxian.js'
import { Add_灵石, Add_修为 } from '../Xiuxian/xiuxian.js'
import Show from "../../model/show.js";
import puppeteer from "../../../../lib/puppeteer/puppeteer.js";

import { Gulid } from '../../api/api.js'

import { createRequire } from "module"
const require = createRequire(import.meta.url)
var mysql = require('mysql');
let databaseConfigData = config.getConfig("database", "database");
//创建连接
const db = mysql.createPool({
    host: 'localhost',
    user: databaseConfigData.Database.username,
    password: databaseConfigData.Database.password,
    database: 'xiuxiandatabase'
})

/**
 * 秘境模块
 */
let allaction = false;

export class SecretPlace extends plugin {
    constructor() {
        super({
            name: 'Yunzai_Bot_SecretPlace',
            dsc: '修仙模块',
            event: 'message',
            /**
             * 优先级，数字越小等级越高，建议优先级600
             */
            priority: 600,
            rule: [
                {
                    reg: '^#修仙状态$',
                    fnc: 'Xiuxianstate'
                },
                {
                    reg: '^#秘境$',
                    fnc: 'Secretplace'
                },
                {
                    reg: '^#寻宝$',
                    fnc: 'xunbao'
                },
                {
                    reg: '^#降临秘境.*$',
                    fnc: 'Gosecretplace'
                },
                {
                    reg: '^#禁地$',
                    fnc: 'Forbiddenarea'
                },
                {
                    reg: '^#前往禁地.*$',
                    fnc: 'Goforbiddenarea'
                },
                {
                    reg: '^#仙府$',
                    fnc: 'Timeplace'
                },
                {
                    reg: '^#探索仙府$',
                    fnc: 'GoTimeplace'
                },
                {
                    reg: '^#仙境$',
                    fnc: 'Fairyrealm'
                },
                {
                    reg: '^#镇守仙境.*$',
                    fnc: 'Gofairyrealm'
                },
                {
                    reg: '^#逃离',
                    fnc: 'Giveup'
                },
                {
                    reg: '^#遗迹$',
                    fnc: 'Yijiplace'
                },
                {
                    reg: '^#探寻遗迹.*$',
                    fnc: 'Goyijiplace'
                },
                {
                    reg: '^#遗迹商店',
                    fnc: 'yijishop'
                },
                {
                    reg: '^#代币兑换(.*)*(.*)$',
                    fnc: 'daibiduihuan'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    //活动
    async yijishop(e) {

        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let img = await get_yijishop_img(e);
        e.reply(img);
        return;
    }

    async Xiuxianstate(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        await Go(e);
        return;
    }

    //秘境地点
    async Secretplace(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let addres = "秘境";
        let weizhi = data.didian_list;
        await Goweizhi(e, weizhi, addres);
    }

    //禁地
    async Forbiddenarea(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let addres = "禁地";
        let weizhi = data.forbiddenarea_list;
        await jindi(e, weizhi, addres);
    }

    //限定仙府
    async Timeplace(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        e.reply("仙府乃民间传说之地,请自行探索")
    }
    async xunbao(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let addres = "寻宝";
        let weizhi = data.xunbao_list;
        await Goweizhi(e, weizhi, addres);
    }

    //仙境
    async Fairyrealm(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let addres = "仙境";
        let weizhi = data.Fairyrealm_list;
        await Goweizhi(e, weizhi, addres);
    }

    //降临秘境
    async Gosecretplace(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id.toString().replace('qg_', '')
        usr_qq = await Gulid(usr_qq);
        let player = await Read_player(usr_qq);
        let didian = e.msg.replace("#降临秘境", '');
        didian = didian.trim();
        let weizhi = await data.didian_list.find(item => item.name == didian);
        if (!isNotNull(weizhi)) {
            return;
        }
        if (player.灵石 < weizhi.Price) {
            e.reply("没有灵石寸步难行,攒到" + weizhi.Price + "灵石才够哦~");
            return true;
        }
        let now_level_id;

        now_level_id = data.Level_list.find(item => item.level_id == player.level_id).level_id;
        let rate = player.occupation_level
        if (player.occupation == "采药师" && rate < 15 && didian == "须弥") {
            e.reply("冒险等级不足(职业等级不足)")
            return
        }
        if (player.occupation != "采药师" && didian == "须弥") {
            e.reply("由于没有带虚空终端，被教令院抓了起来(您不是采药师)")
            return
        }
        //记录时间
        let Price = weizhi.Price;
        const time = this.xiuxianConfigData.CD.secretplace;//时间（分钟）

        //查询人物动作
        let sql1 = `select * from action where usr_id=${usr_qq};`
        db.query(sql1, async (err, result) => {
            let action = JSON.stringify(result)
            if (action != undefined && action != "undefined" && action.length > 2) {
                action = JSON.parse(action)
                action = action[0]
                let now_time = new Date().getTime();
                let timee = 0
                if (action.action_chengmi != 0) {
                    timee = action.time - now_time
                } else {
                    timee = action.end_time - now_time
                }
                let m = parseInt(timee / 1000 / 60);
                let s = parseInt((timee - m * 60 * 1000) / 1000);
                if (m <= 0 && s <= 0) {
                    e.reply(action.action + "结算中...");
                } else {
                    e.reply("正在" + action.action + "中，剩余时间:" + m + "分" + s + "秒");
                }
                return;
            }
            await Add_灵石(usr_qq, -Price);
            let action_time = 60000 * time;//持续时间，单位毫秒
            let group_id = 0
            if (e.isGroup) {
                group_id = e.group_id
            }
            let sql3 = `insert into action values(${usr_qq},'秘境历练',${new Date().getTime() + action_time},${action_time},${group_id},0,0,0,0,0,0,0,0,0,1,0,'${didian}') `
            db.query(sql3, (err) => {
                e.reply("开始降临" + didian + "," + time + "分钟后归来!");
            })
            return;
        })
    }

    //前往禁地
    async Goforbiddenarea(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id.toString().replace('qg_', '')
        usr_qq = await Gulid(usr_qq);
        let player = await Read_player(usr_qq);
        let now_level_id;
        now_level_id = data.Level_list.find(item => item.level_id == player.level_id).level_id;
        if (now_level_id < 22) {
            e.reply("没有达到化神之前还是不要去了")
            return;
        }
        let didian = await e.msg.replace("#前往禁地", '');
        didian = didian.trim();
        let weizhi = await data.forbiddenarea_list.find(item => item.name == didian);
        // if (player.power_place == 0 && weizhi.id != 666) {
        //     e.reply("仙人不得下凡")
        //     return;
        //  }
        if (!isNotNull(weizhi)) {
            return;
        }
        if (didian == '提瓦特') {
            let yuansu = ["仙之心·火", "仙之心·水", "仙之心·雷", "仙之心·岩", "仙之心·冰", "仙之心·风", "仙之心·木"]
            let lingen = player.灵根.name
            if (!(lingen == yuansu[0] || lingen == yuansu[1] || lingen == yuansu[2] || lingen == yuansu[3] || lingen == yuansu[4] || lingen == yuansu[5] || lingen == yuansu[6])) {
                e.reply("你是元素灵根吗,就来提瓦特大陆");
                return
            }
        }
        if (didian == "诸神黄昏·旧神界") {
            if (now_level_id < 41) {
                e.reply("没有达到仙人之前还是不要去了")
                return;
            }
        }
        if (player.灵石 < weizhi.Price) {
            e.reply("没有灵石寸步难行,攒到" + weizhi.Price + "灵石才够哦~");
            return true;
        }
        if (player.修为 < weizhi.experience) {
            e.reply("你需要积累" + weizhi.experience + "修为，才能抵抗禁地魔气！");
            return true;
        }
        let Price = weizhi.Price;
        const time = this.xiuxianConfigData.CD.forbiddenarea;//时间（分钟）
        //查询人物动作
        let sql1 = `select * from action where usr_id=${usr_qq};`
        db.query(sql1, async (err, result) => {
            let action = JSON.stringify(result)
            if (action != undefined && action != "undefined" && action.length > 2) {
                action = JSON.parse(action)
                action = action[0]
                let now_time = new Date().getTime();
                let timee = 0
                if (action.action_chengmi != 0) {
                    timee = action.time - now_time
                } else {
                    timee = action.end_time - now_time
                }
                let m = parseInt(timee / 1000 / 60);
                let s = parseInt((timee - m * 60 * 1000) / 1000);
                if (m <= 0 && s <= 0) {
                    e.reply(action.action + "结算中...");
                } else {
                    e.reply("正在" + action.action + "中，剩余时间:" + m + "分" + s + "秒");
                }
                return;
            }
            await Add_灵石(usr_qq, -Price);
            await Add_修为(usr_qq, -weizhi.experience);
            let action_time = 60000 * time;//持续时间，单位毫秒
            let group_id = 0
            if (e.isGroup) {
                group_id = e.group_id
            }
            let sql3 = `insert into action values(${usr_qq},'禁地历练',${new Date().getTime() + action_time},${action_time},${group_id},0,0,0,0,0,0,0,0,0,1,0,'${weizhi.name}') `
            db.query(sql3, (err) => {
                e.reply("正在前往" + weizhi.name + "," + time + "分钟后归来!");
            })
            return;
        })
    }

    //探索仙府
    async GoTimeplace(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id.toString().replace('qg_', '')
        usr_qq = await Gulid(usr_qq);
        allaction = false;
        let player = await Read_player(usr_qq);
        let didianlist = ["无欲天仙", "仙遗之地"]
        let suiji = Math.round(Math.random());//随机一个地方
        let yunqi = Math.random();//运气随机数
        await sleep(1000)
        e.reply("你在冲水堂发现有人上架了一份仙府地图")
        let didian = didianlist[suiji];//赋值
        let now_level_id;

        await sleep(1000)
        if (yunqi > 0.9) {//10%寄
            if (player.灵石 < 50000) {
                e.reply("还没看两眼就被看堂的打手撵了出去说:“哪来的穷小子,不买别看”");
                return;
            }
            e.reply("价格为5w,你觉得特别特别便宜,赶紧全款拿下了,历经九九八十天,到了后发现居然是仙湖游乐场！")
            await Add_灵石(usr_qq, -50000)
            return
        }
        now_level_id = data.Level_list.find(item => item.level_id == player.level_id).level_id;
        if (now_level_id < 21) {
            e.reply("到了地图上的地点，结果你发现,你尚未达到化神,无法抵御灵气压制")
            return;
        }
        let weizhi = await data.timeplace_list.find(item => item.name == didian);
        if (!isNotNull(weizhi)) {
            e.reply("报错！地点错误，请找群主反馈")
            return;
        }
        if (player.灵石 < weizhi.Price) {
            e.reply("你发现标价是" + weizhi.Price + ",你买不起赶紧溜了");
            return;
        }
        if (player.修为 < 100000) {
            e.reply("到了地图上的地点，发现洞府前有一句前人留下的遗言:‘至少有10w修为才能抵御仙威！’");
            return true;
        }
        let dazhe = 1;
        if (await exist_najie_thing(usr_qq, "仙府通行证", "道具") && player.魔道值 < 1 && (player.灵根.type == "转生" || player.level_id > 41)) {
            dazhe = 0;
            e.reply(player.名号 + "使用了道具仙府通行证,本次仙府免费");
            await Add_najie_thing(usr_qq, "仙府通行证", "道具", -1);
        }
        let Price = weizhi.Price * dazhe;
        const time = this.xiuxianConfigData.CD.timeplace;//时间（分钟）
        //查询人物动作
        let sql1 = `select * from action where usr_id=${usr_qq};`
        db.query(sql1, async (err, result) => {
            let action = JSON.stringify(result)
            if (action != undefined && action != "undefined" && action.length > 2) {
                action = JSON.parse(action)
                action = action[0]
                let now_time = new Date().getTime();
                let timee = 0
                if (action.action_chengmi != 0) {
                    timee = action.time - now_time
                } else {
                    timee = action.end_time - now_time
                }
                let m = parseInt(timee / 1000 / 60);
                let s = parseInt((timee - m * 60 * 1000) / 1000);
                if (m <= 0 && s <= 0) {
                    e.reply(action.action + "结算中...");
                } else {
                    e.reply("正在" + action.action + "中，剩余时间:" + m + "分" + s + "秒");
                }
                return;
            }
            await Add_灵石(usr_qq, -Price);
            let action_time = 60000 * time;//持续时间，单位毫秒
            let group_id = 0
            if (e.isGroup) {
                group_id = e.group_id
            }
            await Add_修为(usr_qq, -100000);
            let sql3 = `insert into action values(${usr_qq},'探索仙府',${new Date().getTime() + action_time},${action_time},${group_id},0,0,0,0,0,0,0,0,0,1,0,'${weizhi.name}') `
            db.query(sql3, (err) => {
                if (suiji == 0) {
                    e.reply("你买下了那份地图,历经九九八十一天,终于到达了地图上的仙府,洞府上模糊得刻着[" + weizhi.name + "仙府]你兴奋地冲进去探索机缘,被强大的仙气压制，消耗了100000修为成功突破封锁闯了进去" + time + "分钟后归来!");
                }
                if (suiji == 1) {
                    e.reply("你买下了那份地图,历经九九八十一天,终于到达了地图上的地点,这座洞府仿佛是上个末法时代某个仙人留下的遗迹,你兴奋地冲进去探索机缘,被强大的仙气压制，消耗了100000修为成功突破封锁闯了进去" + time + "分钟后归来!");
                }
            })
            return;
        })
    }

    //前往仙境
    async Gofairyrealm(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id.toString().replace('qg_', '')
        usr_qq = await Gulid(usr_qq);
        let player = await Read_player(usr_qq);
        let didian = e.msg.replace("#镇守仙境", '');
        didian = didian.trim();
        let weizhi = await data.Fairyrealm_list.find(item => item.name == didian);
        if (!isNotNull(weizhi)) {
            return;
        }
        if (player.灵石 < weizhi.Price) {
            e.reply("没有灵石寸步难行,攒到" + weizhi.Price + "灵石才够哦~");
            return true;
        }
        let now_level_id;

        now_level_id = data.Level_list.find(item => item.level_id == player.level_id).level_id;
        if (now_level_id < 42) {
            return;
        } else {
            if (player.power_place != 0) {
                e.reply("你已无法重返仙界！");
                return;
            }
        }
        //记录时间
        let dazhe = 1;
        if (await exist_najie_thing(usr_qq, "杀神崖通行证", "道具") && player.魔道值 < 1 && (player.灵根.type == "转生" || player.level_id > 41) && didian == "杀神崖") {
            dazhe = 0;
            e.reply(player.名号 + "使用了道具杀神崖通行证,本次仙境免费");
            await Add_najie_thing(usr_qq, "杀神崖通行证", "道具", -1);
        }
        else if (await exist_najie_thing(usr_qq, "仙境优惠券", "道具") && player.魔道值 < 1 && (player.灵根.type == "转生" || player.level_id > 41)) {
            dazhe = 0.7;
            e.reply(player.名号 + "使用了道具仙境优惠券,本次消耗减少30%");
            await Add_najie_thing(usr_qq, "仙境优惠券", "道具", -1);
        }
        let Price = weizhi.Price * dazhe;
        const time = this.xiuxianConfigData.CD.secretplace;//时间（分钟）
        //查询人物动作
        let sql1 = `select * from action where usr_id=${usr_qq};`
        db.query(sql1, async (err, result) => {
            let action = JSON.stringify(result)
            if (action != undefined && action != "undefined" && action.length > 2) {
                action = JSON.parse(action)
                action = action[0]
                let now_time = new Date().getTime();
                let timee = 0
                if (action.action_chengmi != 0) {
                    timee = action.time - now_time
                } else {
                    timee = action.end_time - now_time
                }
                let m = parseInt(timee / 1000 / 60);
                let s = parseInt((timee - m * 60 * 1000) / 1000);
                if (m <= 0 && s <= 0) {
                    e.reply(action.action + "结算中...");
                } else {
                    e.reply("正在" + action.action + "中，剩余时间:" + m + "分" + s + "秒");
                }
                return;
            }
            await Add_灵石(usr_qq, -Price);
            let action_time = 60000 * time;//持续时间，单位毫秒
            let group_id = 0
            if (e.isGroup) {
                group_id = e.group_id
            }
            await Add_修为(usr_qq, -100000);
            let sql3 = `insert into action values(${usr_qq},'镇守仙境',${new Date().getTime() + action_time},${action_time},${group_id},0,0,0,0,0,0,0,0,0,1,0,'${didian}') `
            db.query(sql3, (err) => {
                e.reply("开始镇守" + didian + "," + time + "分钟后归来!");
            })
            return;
        })
    }

    async Giveup(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id.toString().replace('qg_', '')
        usr_qq = await Gulid(usr_qq);
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            e.reply("没存档你逃个锤子!");
            return;
        }
        //获取游戏状态
        let game_action = await redis.get("xiuxian:player:" + usr_qq + ":game_action");
        //防止继续其他娱乐行为
        if (game_action == 0) {
            e.reply("修仙：游戏进行中...");
            return;
        }
        let sql1 = `select * from action where usr_id=${e.user_id};`
        db.query(sql1, (err, result) => {
            let b = JSON.stringify(result)
            if (b != undefined && b != "undefined" && b.length > 2) {
                let action = JSON.parse(b)
                action = action[0]
                if (!action) {
                    e.reply('哪都没去，你逃个锤子')
                    return;
                }
                if (action.action_mijing != "1" && action.action_chengmi == 0) {
                    e.reply('哪都没去，你逃个锤子')
                    return;
                }
                const sql2 = `delete from action where usr_id=${e.user_id};`
                db.query(sql2, (err, result) => {
                    e.reply('逃离成功！')
                })
            }
        })
    }

    /**
     * huodong
     */

    //遗迹列表
    async Yijiplace(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let addres = "遗迹";
        let weizhi = data.yiji_list;
        await Goyiji(e, weizhi, addres);
    }

    //探寻遗迹
    async Goyijiplace(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id.toString().replace('qg_', '')
        usr_qq = await Gulid(usr_qq);
        let player = await Read_player(usr_qq);
        let didian = e.msg.replace("#探寻遗迹", '');
        didian = didian.trim();
        let weizhi = await data.yiji_list.find(item => item.name == didian);
        if (!weizhi) {
            return;
        }
        if (player.灵石 < weizhi.Price) {
            e.reply("需要" + weizhi.Price + "灵石才能探索噢~");
            return true;
        }
        let Price = weizhi.Price;
        await Add_灵石(usr_qq, -Price);
        const ctime = this.xiuxianConfigData.CD.yijiplace;//时间（分钟）
        let time = ctime

        let now_Time = new Date().getTime(); //获取当前时间戳
        let msg = ""
        if (player.daofaxianshu_endtime > now_Time) {
            msg = "【道法仙术】护您左右，为您指引了遗迹秘宝方向！\n"
            time -= 3
        }
        //查询人物动作
        let sql1 = `select * from action where usr_id=${usr_qq};`
        db.query(sql1, async (err, result) => {
            let action = JSON.stringify(result)
            if (action != undefined && action != "undefined" && action.length > 2) {
                action = JSON.parse(action)
                action = action[0]
                let now_time = new Date().getTime();
                let m = parseInt((action.end_time - now_time) / 1000 / 60);
                let s = parseInt(((action.end_time - now_time) - m * 60 * 1000) / 1000);
                if (m <= 0 && s <= 0) {
                    e.reply(action.action + "结算中...");
                } else {
                    e.reply("正在" + action.action + "中，剩余时间:" + m + "分" + s + "秒");
                }
                return;
            }
            let action_time = 60000 * time;//持续时间，单位毫秒
            let group_id = 0
            if (e.isGroup) {
                group_id = e.group_id
            }
            await Add_修为(usr_qq, -100000);
            let sql3 = `insert into action values(${usr_qq},'探寻遗迹',${new Date().getTime() + action_time},${action_time},${group_id},0,0,0,0,0,0,0,0,0,1,0,'${didian}') `
            db.query(sql3, (err) => {
                e.reply("开始探寻遗迹" + didian + "," + time + "分钟后归来!");
            })
            return;
        })
    }

    /**
     * 兑换
     */
    async daibiduihuan(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let usr_qq = e.user_id.toString().replace('qg_', '')
        usr_qq = await Gulid(usr_qq);

        //获取输入信息
        let msg = e.msg.replace("#代币兑换", "");
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
        let commodities_list = data.yijishop_list;
        commodities_list = commodities_list.filter(function (commodities_list) {
            return commodities_list.name === thing_name;
        });
        commodities_list = commodities_list.filter(item => item.name = thing_name);
        //搜索纳戒物品
        let shu = await exist_najie_thing(usr_qq, commodities_list[0].daibi, "道具");
        //转为整数
        let quantity = commodities_list[0].出售价 * shuliang
        quantity = await convert2integer(quantity);
        shuliang = await convert2integer(shuliang);

        if (!shu) {//没有
            e.reply(`你的纳戒中没有【${commodities_list[0].daibi}】`);
            return;
        }

        if (shu >= quantity) {
            await Add_najie_thing(usr_qq, commodities_list[0].daibi, "道具", -quantity);
            await Add_najie_thing(usr_qq, commodities_list[0].name, commodities_list[0].class, shuliang)
            e.reply(`兑换${commodities_list[0].name}*${shuliang}成功，消耗${commodities_list[0].daibi}*${quantity}`)
            return;
        } else {
            e.reply("购买需要[" + commodities_list[0].daibi + "]*" + quantity + "，你只有[" + commodities_list[0].daibi + "]*" + shu)
            return;
        }

    }
}

/**
 *遗迹商店
 */
export async function get_yijishop_img(e) {
    let usr_qq = e.user_id.toString().replace('qg_', '')
    usr_qq = await Gulid(usr_qq);
    let ifexistplay = data.existData("player", usr_qq);
    if (!ifexistplay) {
        return;
    }
    let commodities_list = data.yijishop_list;
    let yijishop_data = {
        user_id: usr_qq,
        commodities_list: commodities_list
    }
    const data1 = await new Show(e).get_yijishopData(yijishop_data);
    let img = await puppeteer.screenshot("yijishop", {
        ...data1,
    });
    return img;
}

export async function Goyiji(e, weizhi, addres) {
    let adr = addres;
    let msg = [
        "===" + adr + "列表==="
    ];
    for (let i = 0; i < weizhi.length; i++) {
        "遗迹:" + msg.push(weizhi[i].name + "\n" + "所需：" + weizhi[i].Price + "灵石")
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
}

/**
 * 地点查询
 */
export async function Goweizhi(e, weizhi, addres) {
    let get_data = {
        didian_list: weizhi,
        addres: addres
    }
    const data1 = await new Show(e).get_secret_placeData(get_data);
    let img = await puppeteer.screenshot('get_secret_placeData', {
        ...data1,
    });
    e.reply(img);
    return;
}

export async function jindi(e, weizhi, addres) {
    let adr = addres;
    let msg = [
        "***" + adr + "***"
    ];
    for (let i = 0; i < weizhi.length; i++) {
        msg.push(weizhi[i].name + "\n" + "掉落：" + weizhi[i].Grade + "\n" + "极品：" + weizhi[i].Best[0] + "\n" + "所需：" + weizhi[i].Price + "灵石" + "\n" + "所需：" + weizhi[i].experience + "修为")
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
}

/**
 * 常用查询合集
 */
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
    let sql1 = `select * from action where usr_id=${usr_qq};`
    db.query(sql1, async (err, result) => {
        let action = JSON.stringify(result)
        if (action != undefined && action != "undefined" && action.length > 2) {
            action = JSON.parse(action)
            action = action[0]
            let now_time = new Date().getTime();
            let timee = 0
            if (action.action_chengmi != 0) {
                timee = action.time - now_time
            } else {
                timee = action.end_time - now_time
            }
            let m = parseInt(timee / 1000 / 60);
            let s = parseInt((timee - m * 60 * 1000) / 1000);
            if (m <= 0 && s <= 0) {
                e.reply(action.action + "结算中...");
            } else {
                e.reply("正在" + action.action + "中，剩余时间:" + m + "分" + s + "秒");
            }

            return;
        }
        let player = await Read_player(usr_qq);
        if (player.当前血量 < 200) {
            e.reply("你都伤成这样了,就不要出去浪了");
            return;
        }
        allaction = true;
        return;
    })

}