//#tag已适配 
import plugin from '../../../../lib/plugins/plugin.js'
import data from '../../model/XiuxianData.js'
import config from "../../model/Config.js"
import Config from "../../model/Config.js"
import fs from "fs"
import { Read_player, existplayer, get_random_talent, getLastsign, Read_yijie_player, yijie_existplayer, Add_星魂币 } from '../Xiuxian/xiuxian.js'
import { Write_equipment, Write_player, Write_najie, Read_qinmidu } from '../Xiuxian/xiuxian.js'
import { shijianc, get_random_fromARR, isNotNull } from '../Xiuxian/xiuxian.js'
import { Add_HP, Add_修为, Add_najie_thing, Add_yijie_beibao_thing, Write_qinmidu } from '../Xiuxian/xiuxian.js'
import { Gulid, Read_Gulid, Write_Gulid, fstadd_Gulid, verc } from '../../api/api.js'
import { player_efficiency } from '../Xiuxian/xiuxian.js'
import { GetPower, bigNumberTransform } from '../ShowImeg/showData.js'

import { __PATH } from "../Xiuxian/xiuxian.js"

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

const versionData = Config.getdefSet("version", "version");
//如需截图必须引入以下两库
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';

/**
 * 全局
 */
let allaction = false;//全局状态判断
export class UserStart extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'UserStart',
            /** 功能描述 */
            dsc: '初始模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: '^#踏入仙途$',
                    fnc: 'Create_player'
                },
                {
                    reg: '^#再入仙途$',
                    fnc: 'reCreate_player'
                },
                {
                    reg: '^#我的练气$',
                    fnc: 'Show_player'
                },
                {
                    reg: '^#设置性别.*$',
                    fnc: 'Set_sex'
                },
                {
                    reg: '^#(改名.*)|(设置道宣.*)$',
                    fnc: 'Change_player_name'
                },
                {
                    reg: '^#修仙签到$',
                    fnc: 'daily_gift'
                },
                {
                    reg: '^#设置头像框.*$',
                    fnc: 'Set_touxiang'
                }
                ,
                {
                    reg: '^#领取七日馈赠$',
                    fnc: 'huodong_gift'
                },
                {
                    reg: '^#绑定频道密钥$',
                    fnc: 'bangding'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }
    async bangding(e) {
        let nowid = e.user_id.toString().replace('qg_', '')

        let Gulid;
        try {
            Gulid = await Read_Gulid();
        } catch {
            //没有建立一个
            await Write_Gulid([]);
            Gulid = await Read_Gulid();
        }
        for (let i = 0; i < Gulid.length; i++) {
            if (Gulid[i].QQ_ID == nowid || Gulid[i].频道_ID == nowid) {
                e.reply("你已经发送或绑定过频道了，密钥为:" + Gulid[i].密钥)
                return
            }
        }
        var num = 15
        var amm = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, "A", "B", "C", "D", "E", "F", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
        var tmp = Math.floor(Math.random() * num);
        var s = tmp;//密钥
        s = s + amm[tmp];
        for (let i = 0; i < Math.floor(num / 2) - 1; i++) {
            tmp = Math.floor(Math.random() * 26);
            s = s + String.fromCharCode(65 + tmp);
        }
        for (let i = 0; i < (num - Math.floor(num / 2) - 1); i++) {
            tmp = Math.floor(Math.random() * 26);
            s = s + String.fromCharCode(97 + tmp);
        }
        await fstadd_Gulid(nowid, 0, s)
        e.reply("您的密钥为:" + s + "\n请于QQ私聊管理发送#频道绑定" + s)
        return;
    }


    //#踏入仙途
    async Create_player(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply("请在群聊内发送此信息")
            return;
        }
        let usr_qq = e.user_id.toString().replace('qg_', '')
        usr_qq = await Gulid(usr_qq);
        //判断是否为匿名创建存档
        if (usr_qq == 80000000) {
            return;
        }
        //有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (ifexistplay) {
            this.Show_player(e);
            return;
        }
        //初始化玩家信息
        let File_msg = fs.readdirSync(__PATH.player_path);
        let n = File_msg.length + 1;
        let talent = await get_random_talent();
        let new_player = {
            "id": e.user_id,
            "sex": 0,//性别
            "名号": `路人甲${n}号`,
            "宣言": "这个人很懒还没有写",
            "level_id": 1,//练气境界
            "Physique_id": 1,//练体境界 
            "race": 1,//种族
            "修为": 1,//练气经验
            "血气": 1,//练体经验
            "灵石": 10000,
            "灵根": talent,
            "神石": 0,
            "favorability": 0,
            "breakthrough": false,
            "linggen": [],
            "linggenshow": 1,//灵根显示，隐藏
            "学习的功法": [],
            "修炼效率提升": talent.eff,
            "连续签到天数": 0,
            "攻击加成": 0,
            "防御加成": 0,
            "生命加成": 0,
            "power_place": 1,//仙界状态
            "当前血量": 8000,
            "lunhui": 0,
            "lunhuiBH": 0,
            "轮回点": 10,
            "occupation": [],//职业
            "occupation_level": 1,
            "daofaxianshu": 0,
            "daofaxianshu_endtime": 0,
            "镇妖塔层数": 0,
            "神魄段数": 0,
            "魔道值": 0,
            "饱食度": 0,
            "热量": 0,
            "仙宠": [],
            "练气皮肤": 0,
            "装备皮肤": 0,
            "幸运": data.necklace_list.find(item => item.name == "幸运儿").加成,
            "熔炉": 0,
            "附魔台": 0,
            "书架": 0,
            "师徒任务阶段": 0,
            "师徒积分": 0,
            "副职": {
                "职业名": [],
                "职业经验": 0,
                "职业等级": 1
            }
        }
        if (!new_player.all_touxiangkuang) {
            new_player.all_touxiangkuang = [];
            let Touxiang = data.Touxiang_list.find(item => item.name == "默认头像框")
            new_player.all_touxiangkuang.push(Touxiang)
        }
        if (!new_player.zb_touxiangkuang) {
            new_player.zb_touxiangkuang = [];
            let Touxiang = data.Touxiang_list.find(item => item.name == "默认头像框")
            new_player.zb_touxiangkuang.push(Touxiang)
        }
        await Write_player(usr_qq, new_player);
        //初始化装备
        let new_equipment = {
            "武器": data.wuqi_list.find(item => item.name == "烂铁匕首"),
            "护具": data.huju_list.find(item => item.name == "破铜护具"),
            "法宝": data.fabao_list.find(item => item.name == "廉价炮仗"),
            "项链": data.necklace_list.find(item => item.name == "幸运儿")
        }
        await Write_equipment(usr_qq, new_equipment);
        //初始化纳戒
        let new_najie = {
            "等级": 1,
            "灵石上限": 5000,
            "灵石": 0,
            "装备": [],
            "丹药": [],
            "道具": [],
            "功法": [],
            "草药": [],
            "材料": [],
            "食材": [],
            "盒子": [],
            "仙宠": [],
            "仙宠口粮": [],
        }
        await Write_najie(usr_qq, new_najie);
        await Add_HP(usr_qq, 999999);
        await this.Show_player(e);
        let i = 0
        let action = await redis.get("xiuxian:player:" + 10 + ":biguang");
        action = await JSON.parse(action);
        if (action == null) {
            action = [];
        }
        for (i = 0; i < action.length; i++) {
            if (action[i].qq == usr_qq) {
                break
            }
        }
        if (i == action.length) {
            let arr = {
                biguan: 0,//闭关状态1
                biguanxl: 0,//增加效率
                xingyun: 0,
                lianti: 0,//1
                ped: 0,//1
                modao: 0,
                beiyong1: 0,
                beiyong2: 0,//1
                beiyong3: 0,//2
                beiyong4: 0,
                beiyong5: 0,
                qq: usr_qq
            }
            action.push(arr)
            console.log(arr);
            await redis.set("xiuxian:player:" + 10 + ":biguang", JSON.stringify(action))
        }
        return;
    }

    //重新修仙
    async reCreate_player(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let nowid = e.user_id.toString().replace('qg_', '')
        let usr_qq = await Gulid(nowid);
        //有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            e.reply("没存档你转世个锤子!");
            return;
        } else {
            //没有存档，初始化次数
            await redis.set("xiuxian:player:" + usr_qq + ":reCreate_acount", 1);
        }
        let acount = await redis.get("xiuxian:player:" + usr_qq + ":reCreate_acount");
        if (acount == undefined || acount == null || acount == NaN || acount <= 0) {
            await redis.set("xiuxian:player:" + usr_qq + ":reCreate_acount", 1);
        }
        let player = await data.getData("player", usr_qq);
        //重生之前先看状态
        if (player.灵石 <= 0) {
            e.reply(`负债无法再入仙途`);
            return;
        }
        await Go(e);
        if (allaction) {
            console.log(allaction);
        } else {
            return;
        }
        allaction = false;
        let now = new Date();
        let nowTime = now.getTime(); //获取当前时间戳
        let lastrestart_time = await redis.get("xiuxian:player:" + usr_qq + ":last_reCreate_time");//获得上次重生时间戳,
        lastrestart_time = parseInt(lastrestart_time);
        const time = this.xiuxianConfigData.CD.reborn;
        let rebornTime = parseInt(60000 * time)
        if (nowTime < lastrestart_time + rebornTime) {
            let waittime_m = Math.trunc((lastrestart_time + rebornTime - nowTime) / 60 / 1000);
            let waittime_s = Math.trunc(((lastrestart_time + rebornTime - nowTime) % 60000) / 1000);
            e.reply(`每${rebornTime / 60 / 1000}分钟只能转世一次` + `剩余cd:${waittime_m}分 ${waittime_s}秒`);
            return;
        }
        /** 设置上下文 */
        this.setContext('RE_xiuxian');
        /** 回复 */
        await e.reply('一旦转世一切当世与你无缘,你真的要重生吗?回复:【断绝此生】或者【再继仙缘】进行选择', false, { at: true });
        return;
    }

    //重生方法
    async RE_xiuxian(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let nowid = e.user_id.toString().replace('qg_', '')
        let usr_qq = await Gulid(nowid);
        /** 内容 */
        let new_msg = this.e.message;
        let choice = new_msg[0].text;
        let now = new Date();
        let nowTime = now.getTime(); //获取当前时间戳
        if (choice == "再继仙缘") {
            await this.reply('重拾道心,继续修行');
            /** 结束上下文 */
            this.finish('RE_xiuxian');
            return;
        } else if (choice == "断绝此生") {
            //得到重生次数
            let acount = await redis.get("xiuxian:player:" + usr_qq + ":reCreate_acount");
            //
            if (acount >= 15) {
                e.reply("灵魂虚弱，已不可转世！");
                return;
            }
            acount = Number(acount);
            acount++;
            //重生牵扯到宗门模块
            let player = await data.getData("player", usr_qq);
            if (isNotNull(player.宗门)) {
                if (player.宗门.职位 != "宗主") {//不是宗主
                    let ass = data.getAssociation(player.宗门.宗门名称);
                    ass[player.宗门.职位] = ass[player.宗门.职位].filter(item => item != usr_qq);
                    ass["所有成员"] = ass["所有成员"].filter(item => item != usr_qq);//原来的成员表删掉这个B
                    await data.setAssociation(ass.宗门名称, ass);
                    delete player.宗门;
                    await data.setData("player", usr_qq, player);
                } else {//是宗主
                    let ass = data.getAssociation(player.宗门.宗门名称);
                    if (ass.所有成员.length < 2) {
                        fs.rmSync(`${data.filePathMap.association}/${player.宗门.宗门名称}.json`);
                    } else {
                        ass["所有成员"] = ass["所有成员"].filter(item => item != usr_qq);//原来的成员表删掉这个B
                        //随机一个幸运儿的QQ,优先挑选等级高的
                        let randmember_qq;
                        if (ass.长老.length > 0) {
                            randmember_qq = await get_random_fromARR(ass.长老);
                        } else if (ass.内门弟子.length > 0) {
                            randmember_qq = await get_random_fromARR(ass.内门弟子);
                        } else {
                            randmember_qq = await get_random_fromARR(ass.所有成员);
                        }
                        let randmember = await data.getData("player", randmember_qq);//获取幸运儿的存档
                        ass[randmember.宗门.职位] = ass[randmember.宗门.职位].filter((item) => item != randmember_qq);//原来的职位表删掉这个幸运儿
                        ass["宗主"] = randmember_qq;//新的职位表加入这个幸运儿
                        randmember.宗门.职位 = "宗主";//成员存档里改职位
                        await data.setData("player", randmember_qq, randmember);//记录到存档
                        await data.setAssociation(ass.宗门名称, ass);//记录到宗门
                    }
                }
            }
            fs.rmSync(`${__PATH.player_path}/${usr_qq}.json`);
            fs.rmSync(`${__PATH.equipment_path}/${usr_qq}.json`);
            fs.rmSync(`${__PATH.najie_path}/${usr_qq}.json`);
            e.reply([segment.at(e.user_id), "当前存档已清空!开始重生"]);
            e.reply([segment.at(e.user_id), "来世，信则有，不信则无，岁月悠悠，世间终会出现两朵相同的花，千百年的回眸，一花凋零，一花绽。是否为同一朵，任后人去评断！！"]);
            await this.Create_player(e);
            await redis.set("xiuxian:player:" + usr_qq + ":last_reCreate_time", nowTime);//redis设置本次改名时间戳
            await redis.set("xiuxian:player:" + usr_qq + ":reCreate_acount", acount);
        } else {
            this.setContext('RE_xiuxian');
            await this.reply('请回复:【断绝此生】或者【再继仙缘】进行选择', false, { at: true });
            return;
        }
        /** 结束上下文 */
        this.finish('RE_xiuxian');
        return;
    }

    //#我的练气
    async Show_player(e) {
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);

        //有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) return false;
        let 法宝评级;
        let 护具评级;
        let 武器评级;
        let head_pic
        try {
            head_pic = e.member.getAvatarUrl()
        } catch (error) {

        }

        if (!head_pic) {
            head_pic = `https://q1.qlogo.cn/g?b=qq&s=0&nk=` + usr_qq
        }
        let player = await Read_player(usr_qq)
        let equipment = await data.getData('equipment', usr_qq);
        let sql1 = `select * from action where usr_id=${usr_qq};`
        let status = '空闲';
        db.query(sql1, async (err, result) => {
            console.log(err)
            let action1 = JSON.stringify(result)
            if (action1 != undefined && action1 != "undefined" && action1.length > 2) {
                console.log(action1)
                action1 = JSON.parse(action1)
                action1 = action1[0]
                let now_time = new Date().getTime();
                let timee = 0
                if (action1 != undefined && action1.action_chengmi != 0) {
                    timee = action1.time - now_time
                } else {
                    timee = action1.end_time - now_time
                }
                let m = parseInt(timee / 1000 / 60);
                let s = parseInt((timee - m * 60 * 1000) / 1000);
                if (m <= 0 && s <= 0) {
                    status = action1.action + "(结算中)"
                } else {
                    status = action1.action + "(剩余时间:" + m + "分" + s + "秒)"
                }

            }
            let lingshi = Math.trunc(player.灵石);

            //头像框
            let touxiang = player.zb_touxiangkuang[0].id

            //道法仙术
            let daofa
            let now_Time = new Date().getTime(); //获取当前时间戳
            if (player.daofaxianshu_endtime > now_Time) {
                var date = new Date(player.daofaxianshu_endtime - now_Time)
                var DD = parseInt((player.daofaxianshu_endtime - now_Time) / (24 * 60 * 60 * 1000));
                var hh = date.getHours() < 10 ? '0' + date.getHours() : date.getHours();
                var mm = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes();
                var ss = date.getSeconds() < 10 ? '0' + date.getSeconds() : date.getSeconds();
                if (DD >= 1) {
                    daofa = `剩余时长:${DD}日`
                } else {
                    daofa = `剩余时长:${hh}时${mm}分${ss}秒`
                }

            } else if (player.daofaxianshu > 0) {
                daofa = "已过期"
            } else {
                daofa = "未购买"
            }


            if (player.灵石 > 999999999999) {
                lingshi = 999999999999;
            }
            if (player.宣言 == null || player.宣言 == undefined) {
                player.宣言 = '这个人很懒什么都没写';
            }
            if (player.灵根 == null || player.灵根 == undefined) {
                player.灵根 = await get_random_talent();
            }
            data.setData('player', usr_qq, player);
            await player_efficiency(usr_qq); // 注意这里刷新了修炼效率提升
            if ((await player.linggenshow) != 0) {
                player.灵根.type = '无';
                player.灵根.name = '未知';
                player.灵根.法球倍率 = '0';
                player.修炼效率提升 = '0';
            }
            if (!isNotNull(player.level_id)) {
                e.reply('请先#一键同步');
                return;
            }
            if (!isNotNull(player.sex)) {
                e.reply('请先#一键同步');
                return;
            }
            let nd = '无';
            if (player.隐藏灵根) nd = player.隐藏灵根.name;
            let zd = ['攻击', '防御', '生命加成', '防御加成', '攻击加成'];
            let num = [];
            let p = [];
            let kxjs = [];
            let count = 0;
            for (let j of zd) {
                if (player[j] == 0) {
                    p[count] = '';
                    kxjs[count] = 0;
                    count++;
                    continue;
                }
                p[count] = Math.floor(Math.log(player[j]) / Math.LN10);
                num[count] = player[j] * 10 ** -p[count];
                kxjs[count] = `${num[count].toFixed(2)} x 10`;
                count++;
            }
            //境界名字需要查找境界名
            let level = data.Level_list.find(
                item => item.level_id == player.level_id
            ).level;
            let power =
                (player.攻击 * 0.9 +
                    player.防御 * 1.1 +
                    player.血量上限 * 0.6 +
                    player.暴击率 * player.攻击 * 0.5 +
                    player.灵根.法球倍率 * player.攻击) /
                10000;
            power = Number(power);
            power = power.toFixed(2);
            let power2 =
                (player.攻击 + player.防御 * 1.1 + player.血量上限 * 0.5) / 10000;
            power2 = Number(power2);
            power2 = power2.toFixed(2);
            let level2 = data.LevelMax_list.find(
                item => item.level_id == player.Physique_id
            ).level;
            let need_exp = data.Level_list.find(
                item => item.level_id == player.level_id
            ).exp;
            let need_exp2 = data.LevelMax_list.find(
                item => item.level_id == player.Physique_id
            ).exp;
            let occupation = player.occupation;
            let occupation_level;
            let occupation_level_name;
            let occupation_exp;
            let occupation_need_exp;
            if (!isNotNull(player.occupation)) {
                occupation = '无';
                occupation_level_name = '-';
                occupation_exp = '-';
                occupation_need_exp = '-';
            } else {
                occupation_level = player.occupation_level;
                occupation_level_name = data.occupation_exp_list.find(
                    item => item.id == occupation_level
                ).name;
                occupation_exp = player.occupation_exp;
                occupation_need_exp = data.occupation_exp_list.find(
                    item => item.id == occupation_level
                ).experience;
            }
            let this_association;
            if (!isNotNull(player.宗门)) {
                this_association = {
                    宗门名称: '无',
                    职位: '无',
                };
            } else {
                this_association = player.宗门;
            }
            let pinji = ['劣', '普', '优', '精', '极', '绝', '顶'];
            if (!isNotNull(equipment.武器.pinji)) {
                武器评级 = '无';
            } else {
                武器评级 = pinji[equipment.武器.pinji];
            }
            if (!isNotNull(equipment.护具.pinji)) {
                护具评级 = '无';
            } else {
                护具评级 = pinji[equipment.护具.pinji];
            }
            if (!isNotNull(equipment.法宝.pinji)) {
                法宝评级 = '无';
            } else {
                法宝评级 = pinji[equipment.法宝.pinji];
            }
            let rank_lianqi = data.Level_list.find(
                item => item.level_id == player.level_id
            ).level;
            let expmax_lianqi = data.Level_list.find(
                item => item.level_id == player.level_id
            ).exp;
            let rank_llianti = data.LevelMax_list.find(
                item => item.level_id == player.Physique_id
            ).level;
            let expmax_llianti = need_exp2;
            let rank_liandan = occupation_level_name;
            let expmax_liandan = occupation_need_exp;
            let strand_hp = Strand(player.当前血量, player.血量上限);
            let strand_lianqi = Strand(player.修为, expmax_lianqi);
            let strand_llianti = Strand(player.血气, expmax_llianti);
            let strand_liandan = Strand(occupation_exp, expmax_liandan);
            let Power = GetPower(
                player.攻击,
                player.防御,
                player.血量上限,
                player.暴击率
            );
            let PowerMini = bigNumberTransform(Power);
            let bao = parseInt(player.暴击率 * 100) + '%';
            equipment.武器.bao = parseInt(equipment.武器.bao * 100) + '%';
            equipment.护具.bao = parseInt(equipment.护具.bao * 100) + '%';
            equipment.法宝.bao = parseInt(equipment.法宝.bao * 100) + '%';
            lingshi = bigNumberTransform(lingshi);
            let hunyin = '未知';
            let A = usr_qq;
            let qinmidu;
            try {
                qinmidu = await Read_qinmidu();
            } catch {
                //没有建立一个
                await Write_qinmidu([]);
                qinmidu = await Read_qinmidu();
            }
            for (let i = 0; i < qinmidu.length; i++) {
                if (qinmidu[i].QQ_A == A || qinmidu[i].QQ_B == A) {
                    if (qinmidu[i].婚姻 > 0) {
                        if (qinmidu[i].QQ_A == A) {
                            let B = await Read_player(qinmidu[i].QQ_B);
                            hunyin = B.名号;
                        } else {
                            let A = await Read_player(qinmidu[i].QQ_A);
                            hunyin = A.名号;
                        }
                        break;
                    }
                }
            }
            let dingjixianshi = await redis.get("xiuxian:player:" + usr_qq + ":dingjixianshi");
            if (!dingjixianshi) {
                dingjixianshi = 0
            }
            let action = player.练气皮肤;
            let player_data = {
                daofa: daofa,
                touxiang: touxiang,
                head_pic: head_pic,
                dingjixianshi: dingjixianshi,
                pifu: action,
                user_id: usr_qq,
                player, // 玩家数据
                rank_lianqi, // 练气境界
                expmax_lianqi, // 练气需求经验
                rank_llianti, // 炼体境界
                expmax_llianti, // 炼体需求经验
                rank_liandan, // 炼丹境界
                expmax_liandan, // 炼丹需求经验
                equipment, // 装备数据
                talent: parseInt(player.修炼效率提升 * 100), //
                player_action: status, // 当前状态
                this_association, // 宗门信息
                strand_hp,
                strand_lianqi,
                strand_llianti,
                strand_liandan,
                PowerMini, // 玩家战力
                bao,
                nickname: player.名号,
                linggen: player.灵根, //
                declaration: player.宣言,
                need_exp: need_exp,
                need_exp2: need_exp2,
                exp: player.修为,
                exp2: player.血气,
                zdl: power,
                镇妖塔层数: player.镇妖塔层数,
                sh: player.神魄段数,
                mdz: player.魔道值,
                hgd: player.favorability,
                jczdl: power2,
                level: level,
                level2: level2,
                lingshi: lingshi,
                player_maxHP: player.血量上限,
                player_nowHP: player.当前血量,
                player_atk: kxjs[0],
                player_atk2: p[0],
                player_def: kxjs[1],
                player_def2: p[1],
                生命加成: kxjs[2],
                生命加成_t: p[2],
                防御加成: kxjs[3],
                防御加成_t: p[3],
                攻击加成: kxjs[4],
                攻击加成_t: p[4],
                player_bao: player.暴击率,
                player_bao2: player.暴击伤害,
                occupation: occupation,
                occupation_level: occupation_level_name,
                occupation_exp: occupation_exp,
                occupation_need_exp: occupation_need_exp,
                arms: equipment.武器,
                armor: equipment.护具,
                treasure: equipment.法宝,
                association: this_association,
                learned_gongfa: player.学习的功法,
                婚姻状况: hunyin,
                武器评级: 武器评级,
                护具评级: 护具评级,
                法宝评级: 法宝评级,
                修仙版本: versionData,
            };
            const data1 = await new Show(e).get_playerData(player_data);
            e.reply(await puppeteer.screenshot('player', {
                ...data1,
            }));
        })
    }

    async Set_touxiang(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let nowid = e.user_id.toString().replace('qg_', '')
        let usr_qq = await Gulid(nowid);
        //有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let player = await Read_player(usr_qq);
        //命令判断
        let msg = e.msg.replace("#设置头像框", '');
        let thing = player.all_touxiangkuang.find(item => item.name == msg); //查找头像框
        if (!isNotNull(thing)) {
            e.reply('您暂未拥有此头像框');
            return;
        }
        player.zb_touxiangkuang.length = 0
        player.zb_touxiangkuang.push(thing)
        await Write_player(usr_qq, player);
        e.reply(`头像框更换成功！`);
        return;
    }

    async Set_sex(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let nowid = e.user_id.toString().replace('qg_', '')
        let usr_qq = await Gulid(nowid);
        //有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let player = await Read_player(usr_qq);
        if (player.sex != 0) {
            e.reply("每个存档仅可设置一次性别！");
            return;
        }
        //命令判断
        let msg = e.msg.replace("#设置性别", '');
        if (msg != '男' && msg != '女') {
            e.reply("请发送#设置性别男 或 #设置性别女");
            return;
        }
        player.sex = msg == '男' ? 2 : 1;
        data.setData("player", usr_qq, player);
        e.reply(`${player.名号}的性别已成功设置为 ${msg}。`);
    }

    //改名
    async Change_player_name(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let nowid = e.user_id.toString().replace('qg_', '')
        let usr_qq = await Gulid(nowid);
        //有无存档
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        //检索方法
        var reg = new RegExp(/改名|设置道宣/);
        let func = reg.exec(e.msg);
        //
        if (func == "改名") {
            let new_name = e.msg.replace("#改名", '');
            new_name = new_name.replace(" ", '');
            new_name = new_name.replace("+", '');
            if (new_name.length == 0) {
                e.reply("改名格式为:【#改名张三】请输入正确名字");
                return;
            } else if (new_name.length > 8) {
                e.reply("玩家名字最多八字");
                return;
            }
            let player = {};
            let now = new Date();
            let nowTime = now.getTime(); //获取当前日期的时间戳
            //let Yesterday = await shijianc(nowTime - 24 * 60 * 60 * 1000);//获得昨天日期
            let Today = await shijianc(nowTime);
            let lastsetname_time = await redis.get("xiuxian:player:" + usr_qq + ":last_setname_time");//获得上次改名日期,
            lastsetname_time = parseInt(lastsetname_time);
            lastsetname_time = await shijianc(lastsetname_time);
            if (Today.Y == lastsetname_time.Y && Today.M == lastsetname_time.M && Today.D == lastsetname_time.D) {
                e.reply("每日只能改名一次");
                return;
            }
            player = await Read_player(usr_qq);
            if (player.灵石 < 1000) {
                e.reply("改名需要1000灵石");
                return;
            }
            player.名号 = new_name;
            redis.set("xiuxian:player:" + usr_qq + ":last_setname_time", nowTime);//redis设置本次改名时间戳
            player.灵石 -= 1000;
            await Write_player(usr_qq, player);
            //Add_灵石(usr_qq, -100);
            this.Show_player(e);
            return;
        }
        //设置道宣
        else if (func == "设置道宣") {
            let new_msg = e.msg.replace("#设置道宣", '');
            new_msg = new_msg.replace(" ", '');
            new_msg = new_msg.replace("+", '');
            if (new_msg.length == 0) {
                return;
            } else if (new_msg.length > 50) {
                e.reply("道宣最多50字符");
                return;
            }
            let player = {};
            let now = new Date();
            let nowTime = now.getTime(); //获取当前日期的时间戳
            //let Yesterday = await shijianc(nowTime - 24 * 60 * 60 * 1000);//获得昨天日期
            //
            let Today = await shijianc(nowTime);
            let lastsetxuanyan_time = await redis.get("xiuxian:player:" + usr_qq + ":last_setxuanyan_time");
            //获得上次改道宣日期,
            lastsetxuanyan_time = parseInt(lastsetxuanyan_time);
            lastsetxuanyan_time = await shijianc(lastsetxuanyan_time);
            if (Today.Y == lastsetxuanyan_time.Y && Today.M == lastsetxuanyan_time.M && Today.D == lastsetxuanyan_time.D) {
                e.reply("每日仅可更改一次");
                return;
            }
            //这里有问题，写不进去
            player = await Read_player(usr_qq);
            player.宣言 = new_msg;//
            redis.set("xiuxian:player:" + usr_qq + ":last_setxuanyan_time", nowTime);//redis设置本次设道置宣时间戳
            await Write_player(usr_qq, player);
            this.Show_player(e);
            return;
        }
    }


    async daily_gift(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let nowid = e.user_id.toString().replace('qg_', '')
        let usr_qq = await Gulid(nowid);
        //有无账号
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let now = new Date();
        let nowTime = now.getTime(); //获取当前日期的时间戳
        let Yesterday = await shijianc(nowTime - 24 * 60 * 60 * 1000);//获得昨天日期
        let Today = await shijianc(nowTime);
        let lastsign_time = await getLastsign(usr_qq);//获得上次签到日期
        if (Today.Y == lastsign_time.Y && Today.M == lastsign_time.M && Today.D == lastsign_time.D) {
            e.reply(`今日已经签到过了`);
            return;
        }
        let Sign_Yesterday;        //昨日日是否签到
        if (Yesterday.Y == lastsign_time.Y && Yesterday.M == lastsign_time.M && Yesterday.D == lastsign_time.D) {
            Sign_Yesterday = true;
        } else {
            Sign_Yesterday = false;
        }
        await redis.set("xiuxian:player:" + usr_qq + ":lastsign_time", nowTime);//redis设置签到时间
        let player = await data.getData("player", usr_qq);
        if (player.连续签到天数 == 14 || !Sign_Yesterday) {//签到连续14天或者昨天没有签到,连续签到天数清零
            player.连续签到天数 = 0;
        }
        player.连续签到天数 += 1;
        data.setData("player", usr_qq, player);
        //给奖励
        let gift_xiuwei = player.连续签到天数 * 15000;
        if (player.daofaxianshu_endtime > nowTime) {
            gift_xiuwei *= 2
        }
        let yijie_bl = await yijie_existplayer(usr_qq)
        let lilian = this.xiuxianConfigData.Sign.ticket
        let msg
        if (yijie_bl) {
            let yijie = await Read_yijie_player(usr_qq)
            await Add_修为(usr_qq, gift_xiuwei);
            let xianding = 16
            if (yijie["xianding_level"] > 10) {
                xianding = 64
            }
            if (player.daofaxianshu_endtime > nowTime) {
                xianding *= 2
                lilian *= 2
                msg = [
                    segment.at(e.user_id),
                    `【道法仙术】给予你赐福，签到奖励翻倍！`,
                    `连续签到${player.连续签到天数}天了，获得了${gift_xiuwei}修为,【秘境之匙】*${lilian},【仙鼎历练券】*${xianding}`
                ]
            } else {
                msg = [
                    segment.at(e.user_id),
                    `连续签到${player.连续签到天数}天了，获得了${gift_xiuwei}修为,【秘境之匙】*${lilian},【仙鼎历练券】*${xianding}`
                ]
            }
            await Add_najie_thing(usr_qq, "秘境之匙", "道具", lilian);
            await Add_yijie_beibao_thing(usr_qq, "仙鼎历练券", "道具", xianding)
            e.reply(msg);
            return;
        } else {
            if (player.daofaxianshu_endtime > nowTime) {
                lilian *= 2
                msg = [
                    segment.at(e.user_id),
                    `【道法仙术】给予你赐福，签到奖励翻倍！`,
                    `连续签到${player.连续签到天数}天了，获得了${gift_xiuwei}修为,【秘境之匙】*${lilian}`
                ]
            } else {
                msg = [
                    segment.at(e.user_id),
                    `连续签到${player.连续签到天数}天了，获得了${gift_xiuwei}修为,【秘境之匙】*${lilian}`
                ]
            }
            await Add_najie_thing(usr_qq, "秘境之匙", "道具", lilian);
            await Add_修为(usr_qq, gift_xiuwei);
            e.reply(msg);
            return;
        }
    }

    async huodong_gift(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let nowid = e.user_id.toString().replace('qg_', '')
        let usr_qq = await Gulid(nowid);
        //有无账号
        let ifexistplay = await existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let now = new Date();
        let nowTime = now.getTime(); //获取当前日期的时间戳
        let Today = await shijianc(nowTime);
        if (nowTime < 1711850400000) {
            e.reply(`「七日馈赠 · 仙韵绕春华」活动暂未开启！`);
            return;
        }
        if (nowTime > 1713110399999) {
            e.reply(`「七日馈赠 · 仙韵绕春华」活动已结束！`);
            return;
        }
        let time = await redis.get("xiuxian:player:" + usr_qq + ":huodonglastsign_time");
        if (!time || time < 1689091200000) {
            time = 1589091200000
        }
        let lastsign_time = await shijianc(parseInt(time))//获得上次签到日期

        if (Today.Y == lastsign_time.Y && Today.M == lastsign_time.M && Today.D == lastsign_time.D) {
            e.reply(`你今日已经领取过「七日馈赠 · 仙韵绕春华」了`);
            return;
        }
        await redis.set("xiuxian:player:" + usr_qq + ":huodonglastsign_time", nowTime);//redis设置签到时间
        let sign = await redis.get("xiuxian:player:" + usr_qq + ":huodongsign");
        sign = Number(sign);
        if (!sign) {
            sign = 0
        }
        sign = sign + 1
        await redis.set("xiuxian:player:" + usr_qq + ":huodongsign", sign);//redis设置签到
        if (sign > 7) {//签到连续7天或者昨天没有签到,连续签到天数清零
            e.reply(`「七日馈赠 · 仙韵绕春华」已领取完毕！`);
            return;
        }

        if (sign == 1) {
            await Add_najie_thing(usr_qq, "2w", "道具", "10");
            let msg = [
                segment.at(e.user_id),
                `领取第${sign}天馈赠成功！获得【2w】*10`
            ]
            e.reply(msg);
            return;
        }
        if (sign == 2) {
            await Add_najie_thing(usr_qq, "甜酿丹", "丹药", "20");
            let msg = [
                segment.at(e.user_id),
                `领取第${sign}天馈赠成功！获得【甜酿丹】*20`
            ]
            e.reply(msg);
            return;
        }
        if (sign == 3) {
            await Add_najie_thing(usr_qq, "摘榜令", "道具", "5");
            let msg = [
                segment.at(e.user_id),
                `领取第${sign}天馈赠成功！获得【摘榜令】*5`
            ]
            e.reply(msg);
            return;
        }
        if (sign == 4) {
            await Add_najie_thing(usr_qq, "2w", "道具", "15");
            let msg = [
                segment.at(e.user_id),
                `领取第${sign}天馈赠成功！获得【2w】*15`
            ]
            e.reply(msg);
            return;
        }
        if (sign == 5) {
            await Add_najie_thing(usr_qq, "2w", "道具", "30");
            let msg = [
                segment.at(e.user_id),
                `领取第${sign}天馈赠成功！获得【2w】*30`
            ]
            e.reply(msg);
            return;
        }
        if (sign == 6) {
            await Add_najie_thing(usr_qq, "2w", "道具", "50");
            let msg = [
                segment.at(e.user_id),
                `领取第${sign}天馈赠成功！获得【2w】*50`
            ]
            e.reply(msg);
            return;
        }
        if (sign == 7) {
            await Add_najie_thing(usr_qq, "七星玄元丹", "丹药", "5");
            let msg = [
                segment.at(e.user_id),
                `领取第${sign}天馈赠成功！获得【七星玄元丹】*5`
            ]
            e.reply(msg);
            return;
        }
    }
}

/**
 * 状态
 */
export async function Go(e) {
    let nowid = e.user_id.toString().replace('qg_', '')
    let usr_qq = await Gulid(nowid);
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
    allaction = true;
    return;
}

/**
 * @description: 进度条渲染
 * @param {Number} res 百分比小数
 * @return {*} css样式
 */
function Strand(now, max) {
    let num = (now / max * 100).toFixed(0);
    let mini
    if (num > 100) {
        mini = 100
    } else {
        mini = num
    }
    let strand = {
        style: `style=width:${mini}%`,
        num: num
    };
    return strand
}