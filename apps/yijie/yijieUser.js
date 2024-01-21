import plugin from '../../../../lib/plugins/plugin.js'
import common from "../../../../lib/common/common.js"
import config from "../../model/Config.js"
import data from '../../model/XiuxianData.js'
import fs from "fs"
import {
    Write_yijie_player,
    Write_yijie_beibao,
    yijie_existplayer,
    yijie_zhanlijisuan,
    sortBy,
    sleep,
    Read_yijie_beibao,
    Add_yijie_beibao_thing,
    find_yijie_taozhuang,
    Add_yijie_饱食度,
    exist_yijie_beibao_thing,
    yijie_foundthing,
    Read_yijie_player,
    convert2integer,
    Add_星魂币,
    isNotNull,
    shijianc,
    Add_tianfu_exp
} from '../Xiuxian/xiuxian.js'
import { get_yijie_player_img, get_ranking_xinghunbi_img } from '../ShowImeg/showData.js'
import { __PATH } from "../Xiuxian/xiuxian.js"
import Show from "../../model/show.js"
import puppeteer from "../../../../lib/puppeteer/puppeteer.js"
import { verc, Gulid2, Gulid } from '../../api/api.js'

/**
 * 全局
 */
let allaction = false;//全局状态判断
/**
 * 交易系统
 */
export class yijieUser extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'yijieUser',
            /** 功能描述 */
            dsc: '交易模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: '^#造访异界$',
                    fnc: 'add_yijie'
                },
                {
                    reg: '^#我的面板$',
                    fnc: 'Show_player'
                },
                {
                    reg: '^#我的异界战力$',
                    fnc: 'myzhanli'
                },
                {
                    reg: '^#异界装备.*$',
                    fnc: 'zb'
                },
                {
                    reg: '^#异界寻宝.*$',
                    fnc: 'yijie_xunbao'
                },
                {
                    reg: '^#食用.*$',
                    fnc: 'yijie_eat'
                },
                {
                    reg: '#异界合成.*$',
                    fnc: 'yijie_hecheng'
                },
                {
                    reg: '#查询异界合成列表(装备|道具|武器|护具|法宝|材料)?$',
                    fnc: 'yijie_hecheng_list'
                },
                {
                    reg: '#查询异界(装备套装|套装效果)?$',
                    fnc: 'find_zb'
                },
                {
                    reg: '#星魂币榜$',
                    fnc: 'xinghunbi'
                },
                {
                    reg: '#异界改名.*$',
                    fnc: 'Change_player_name'
                },
                {
                    reg: '#(^#刷怪$)|(^#刷怪(.*)(分|分钟)$)$',
                    fnc: 'shuaguai'
                },
                {
                    reg: '#结束刷怪$',
                    fnc: 'shuaguaiend'
                },
                {
                    reg: '#跑路$',
                    fnc: 'Giveup'
                },
                {
                    reg: '#异界攻略$',
                    fnc: 'glve'
                },
                {
                    reg: '#调试id$',
                    fnc: 'ts'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    async glve(e) {
        e.reply('【腾讯文档】修仙插件异界攻略v2.0.0https://docs.qq.com/doc/DU1pmVFNReVlvdEJP')
        return;
    }

    async ts(e) {
        e.reply(await Gulid2(e.user_id.toString().replace('qg_', '')))
        return;
    }

    /*
     * 人物结束刷怪
     * @param e
     * @returns {Promise<void>}
     */
    async shuaguaiend(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        let action = await this.getPlayerAction(usr_qq);
        let state = await this.getPlayerState(action);
        if (state == "空闲") {
            return;
        }
        if (action.action != "刷怪") {
            return;
        }
        //结算
        let end_time = action.end_time;
        let start_time = end_time - action.time;
        let now_time = new Date().getTime();
        let time;
        var y = 30;//固定时间
        time = parseInt((now_time - start_time) / 1000 / 60 / 30);

        if (e.isGroup) {
            await this.dagong_jiesuan(usr_qq, time, true, e.group_id);//提前闭关结束不会触发随机事件
        } else {
            await this.dagong_jiesuan(usr_qq, time, false);//提前闭关结束不会触发随机事件
        }

        let arr = action;
        arr.is_jiesuan = 1;//结算状态
        arr.shutup = 1;//闭关状态
        arr.working = 1;//降妖状态
        arr.power_up = 1;//渡劫状态
        arr.Place_action = 1;//秘境
        //结束的时间也修改为当前时间
        arr.end_time = new Date().getTime();
        delete arr.group_id;//结算完去除group_id
        await redis.set("xiuxian:yijie:player:" + usr_qq + ":action", JSON.stringify(arr));
    }

    async Giveup(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            e.reply("没存档你逃个锤子!");
            return;
        }
        //查询redis中的人物动作
        let action = await redis.get("xiuxian:yijie:player:" + usr_qq + ":action");
        action = JSON.parse(action);
        //不为空，有状态
        if (action != null) {
            //是在秘境状态
            if (action.Place_action == "0" || action.Place_actionplus == "0" || action.mojie == "0" || action.shutup == "0") {
                //把状态都关了
                let arr = action;
                arr.is_jiesuan = 1;//结算状态
                arr.shutup = 1;//闭关状态
                arr.working = 1;//降妖状态
                arr.power_up = 1;//渡劫状态
                arr.Place_action = 1;//秘境
                arr.Place_actionplus = 1;//沉迷状态
                arr.mojie = 1;
                arr.end_time = new Date().getTime();//结束的时间也修改为当前时间
                delete arr.group_id;//结算完去除group_id
                await redis.set("xiuxian:yijie:player:" + usr_qq + ":action", JSON.stringify(arr));
                e.reply("跑路成功，正在删库（");
                return;
            }
        }
        return;
    }

    //闭关
    async shuaguai(e) {
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        //有无存档
        if (!await yijie_existplayer(usr_qq)) {
            return;
        }
        //不开放私聊
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        //获取时间
        let time = e.msg.replace("#", "");
        time = time.replace("刷怪", "");
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
                e.reply("【异界】正在" + action.action + "中,剩余时间:" + m + "分" + s + "秒");
                return;
            }
        }

        let action_time = time * 60 * 1000;//持续时间，单位毫秒
        let arr = {
            "action": "刷怪",//动作
            "end_time": new Date().getTime() + action_time,//结束时间
            "time": action_time,//持续时间
            "plant": "1",//采药-关闭
            "shutup": "0",//闭关状态-开启
            "working": "1",//降妖状态-关闭
            "Place_action": "1",//秘境状态---关闭
            "Place_actionplus": "1",//沉迷---关闭
            "power_up": "1",//渡劫状态--关闭
            "power_up": "1",//渡劫状态--关闭
            "mojie": "1",//魔界状态---关闭
            "power_up": "1",//渡劫状态--关闭
            "xijie": "1", //洗劫状态开启
            "plant": "1",//采药-开启
            "mine": "1",//采矿-开启
        };
        if (e.isGroup) {
            arr.group_id = e.group_id
        }

        await redis.set("xiuxian:yijie:player:" + usr_qq + ":action", JSON.stringify(arr));//redis设置动作
        e.reply(`现在开始刷怪${time}分钟,刷完回来领取报酬`);

        return true;

    }

    async Change_player_name(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let new_name = e.msg.replace("#异界改名", '');
        new_name = new_name.replace(" ", '');
        new_name = new_name.replace("+", '');
        if (new_name.length == 0) {
            e.reply("改名格式为:【#异界改名张三】请输入正确名字");
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
        let lastsetname_time = await redis.get("xiuxian:yijie:player:" + usr_qq + ":last_setname_time");//获得上次改名日期,
        lastsetname_time = parseInt(lastsetname_time);
        lastsetname_time = await shijianc(lastsetname_time);
        if (Today.Y == lastsetname_time.Y && Today.M == lastsetname_time.M && Today.D == lastsetname_time.D) {
            e.reply("每日只能改名一次");
            return;
        }
        player = await Read_yijie_player(usr_qq);
        if (player.星魂币 < 100) {
            e.reply("改名需要100星魂币");
            return;
        }
        player.名号 = new_name;
        redis.set("xiuxian:yijie:player:" + usr_qq + ":last_setname_time", nowTime);//redis设置本次改名时间戳
        player.星魂币 -= 100;
        await Write_yijie_player(usr_qq, player);
        //Add_灵石(usr_qq, -100);
        this.Show_player(e);
        return;
    }

    async xinghunbi(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) { return; }
        let usr_paiming;
        let File = fs.readdirSync(__PATH.yijie_player_path);
        File = File.filter(file => file.endsWith(".json"));
        let File_length = File.length;
        let temp = [];
        for (var i = 0; i < File_length; i++) {
            let this_qq = File[i].replace(".json", '');
            this_qq = parseInt(this_qq);
            let player = await Read_yijie_player(this_qq);
            let xinghunbi = player.星魂币
            temp[i] = {
                ls2: player.星魂币,
                星魂币: xinghunbi,
                名号: player.名号,
                qq: this_qq
            }
        }
        //排序
        temp.sort(sortBy("星魂币"));
        let Data = [];
        usr_paiming = temp.findIndex(temp => temp.qq === usr_qq) + 1;
        if (File_length > 10) { File_length = 10; }//最多显示前十
        for (var i = 0; i < File_length; i++) {
            temp[i].名次 = i + 1;
            Data[i] = temp[i];
        }
        await sleep(500);
        let thisplayer = await data.getData("yijie_player", usr_qq);
        let img = await get_ranking_xinghunbi_img(e, Data, usr_paiming, thisplayer);
        e.reply(img);
        return;

    }

    async find_zb(e) {
        let str = data.yijie_taozhuang
        let msg = []
        msg.push("▮异界套装查询▮")
        for (let i in str) {
            msg.push(`【${str[i].name}】${str[i].context}`)
            msg.push(`武器：${str[i].wuqi}`)
            msg.push(`护具：${str[i].huju}`)
            msg.push(`法宝：${str[i].fabao}`)
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

    async zb(e) {
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let zb = e.msg.replace("#异界装备", '');
        zb = zb.trim();
        let sfcz = await yijie_foundthing(zb)
        if (!sfcz) {
            e.reply("异界查无此物")
            return;
        }
        let beibao = await Read_yijie_beibao(usr_qq);
        let player = await Read_yijie_player(usr_qq);
        let sf = beibao.装备.find(item => item.name == zb)
        if (!sf) {
            e.reply(`您的背包中没有${zb}`)
            return;
        }
        let change = player[sf.type]
        player[sf.type] = sf
        await Add_yijie_beibao_thing(usr_qq, sf.name, sf.class, -1)
        await Add_yijie_beibao_thing(usr_qq, change.name, change.class, 1)
        await Write_yijie_player(usr_qq, player)
        this.Show_player(e)
        return;
    }

    async myzhanli(e) {
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            e.reply("您还未前往异界")
            return;
        }
        let player = await data.getData('yijie_player', usr_qq);
        let zhanli = await yijie_zhanlijisuan(player)
        e.reply("您当前异界战力为：" + zhanli)
        return;
    }

    async add_yijie(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply("请在群聊内发送此信息")
            return;
        }
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        //判断是否为匿名创建存档
        if (usr_qq == 80000000) {
            return;
        }

        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (ifexistplay) {
            e.reply("您已身处异界")
            return;
        }
        //初始化玩家信息
        let new_player = {
            "id": e.user_id,
            "名号": e.user_id,
            "xianding_level": 1,//仙鼎等级
            "xianding_exp": 0,//仙鼎经验
            "xianding_jieduan": 1,//仙鼎阶段
            "tianfu_level": 0,
            "tianfu_exp": 0,
            "血量上限": 0,
            "攻击": 0,
            "防御": 0,
            "暴击率": 0.05,
            "暴击伤害": 0.50,
            "饱食度": 0,
            "星魂币": 0,
            "武器": data.yijie_zhuangbei_list.find(item => item.name == "木剑"),
            "护具": data.yijie_zhuangbei_list.find(item => item.name == "木盾"),
            "法宝": data.yijie_zhuangbei_list.find(item => item.name == "葫芦")
        }
        await Write_yijie_player(usr_qq, new_player);
        //初始化背包
        let new_beibao = {
            "装备": [],
            "道具": [],
            "材料": [],
            "食材": [],
            "箱子": []
        }
        await Write_yijie_beibao(usr_qq, new_beibao);
        await this.Show_player(e);
        let i = 0
        let action = await redis.get("xiuxian:yijie:player:" + usr_qq + ":biguang");
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
            await redis.set("xiuxian:yijie:player:" + usr_qq + ":biguang", JSON.stringify(action))
        }
        return;
    }

    async Show_player(e) {
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let img = await get_yijie_player_img(e);
        e.reply(img);
        return;
    }

    async yijie_xunbao(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let player = await Read_yijie_player(usr_qq);
        //检索方法
        var reg = new RegExp(/异界寻宝/);
        let msg = e.msg.replace(reg, '');
        msg = msg.replace("#", '');
        let thing_name = msg
        //看看物品名称有没有设定,是不是瞎说的
        let thing_exist = await yijie_foundthing(thing_name);
        if (!thing_exist) {
            e.reply(`异界查无此物`);
            return;
        }
        await Go(e);
        if (allaction) {
            console.log(allaction);
        } else {
            return;
        }
        allaction = false;
        var Time = 0;
        if (usr_qq == "215673729" || usr_qq == "1204963735" || usr_qq == "2531606029") {
            Time = 2;
        } else {
            Time = 7;
        }
        let now_Time = new Date().getTime(); //获取当前时间戳
        let shuangxiuTimeout = parseInt(60000 * Time);
        let last_time = await redis.get("xiuxian:yijie:player:" + usr_qq + "xunbaocd");//获得上次的时间戳,
        last_time = parseInt(last_time);
        if (now_Time < last_time + shuangxiuTimeout) {
            let Couple_m = Math.trunc((last_time + shuangxiuTimeout - now_Time) / 60 / 1000);
            let Couple_s = Math.trunc(((last_time + shuangxiuTimeout - now_Time) % 60000) / 1000);
            if (usr_qq == "215673729" || usr_qq == "1204963735" || usr_qq == "2531606029") {
                e.reply("【异界】您受到了寻宝赐福，正在归来途中.....\n" + `还需要  ${Couple_m}分 ${Couple_s}秒。`);
            } else {
                e.reply("【异界】正在归来途中.....\n" + `还需要  ${Couple_m}分 ${Couple_s}秒。`);
            }
            return;
        }
        let x = await exist_yijie_beibao_thing(usr_qq, thing_name, thing_exist.class);
        if (!x) {
            e.reply(`你的背包中没有【${thing_name}】这样的地图`);
            return;
        }
        let math = Math.random();
        let math1 = Math.random();
        let beilv = 1
        let wuqi = player.武器
        let huju = player.护具
        let fabao = player.法宝
        let tianfulevel = player.tianfu_level
        let other = 0
        let tianfu = ""
        if (tianfulevel >= 2 && tianfulevel <= 5 && math1 < 0.01) {
            other = 1
            tianfu = "您触发了天赋效果，本次寻宝收益+1\n"
        }
        if (tianfulevel >= 6 && tianfulevel <= 10 && math1 < 0.025) {
            other = 1
            tianfu = "您触发了天赋效果，本次寻宝收益+1\n"
        }
        let fanbei = ""
        let taozhuangmath = Math.random();
        if (wuqi.name == "压缩金剑" && huju.name == "压缩金盾" && fabao.name == "压缩金葫芦") {
            if (taozhuangmath >= 0.8) {
                beilv = 2
                fanbei = "您触发了【寻宝者的期许】套装效果，本次寻宝收益翻倍！\n"
            }
        }
        await Add_tianfu_exp(usr_qq, 3)
        if (thing_name == "幽静谷") {
            if (player.饱食度 < 100) {
                e.reply('你快饿死了,还是先吃点东西吧');
                return;
            }
            let mugao = await exist_yijie_beibao_thing(usr_qq, "玄蛛网", "道具")
            if (mugao > 0) {
                await Add_yijie_饱食度(usr_qq, -100)
                await redis.set("xiuxian:yijie:player:" + usr_qq + "xunbaocd", now_Time);
                await Add_yijie_beibao_thing(usr_qq, "玄蛛网", "道具", -1);
                await Add_yijie_beibao_thing(usr_qq, "幽静谷", "道具", -1);
                if (math > 0.90 && math < 1) {
                    e.reply(`${tianfu}${fanbei}你在【幽静谷】发现了${1000 * beilv + other}个星魂币，之后迅速跑走了！`)
                    Add_星魂币(usr_qq, 1000 * beilv + other)
                    return;
                } else if (math > 0.7 && math <= 0.90) {
                    e.reply(`${tianfu}${fanbei}你在【幽静谷】打开了一个宝箱，宝箱内装有【道具*深邃矿洞】*${2 * beilv + other}以及【道具*铁镐】*${2 * beilv + other}`)
                    await Add_yijie_beibao_thing(usr_qq, "铁镐", "道具", 2 * beilv + other)
                    await Add_yijie_beibao_thing(usr_qq, "深邃矿洞", "道具", 2 * beilv + other)
                    return;
                } else if (math > 0.45 && math <= 0.7) {
                    e.reply(`${tianfu}${fanbei}你在【幽静谷】捡到了${100 * beilv + other}个星魂币，此外啥也没看到！`)
                    Add_星魂币(usr_qq, 100 * beilv + other)
                    return;
                } else if (math >= 0.1 && math <= 0.45) {
                    e.reply(`${tianfu}${fanbei}你在【幽静谷】捡到了${50 * beilv + other}个星魂币，此外啥也没看到！`)
                    Add_星魂币(usr_qq, 50 * beilv + other)
                    return;
                } else {
                    e.reply(`${tianfu}${fanbei}你在【幽静谷】只捡到了${10 * beilv + other}个星魂币，此外啥也没看到！`)
                    Add_星魂币(usr_qq, 10 * beilv + other)
                    return;
                }
            } else {
                e.reply('你没有携带玄蛛网，无法进入幽静谷')
                return;
            }
        }
        if (thing_name == "深邃矿洞") {
            if (player.饱食度 < 100) {
                e.reply('你快饿死了,还是先吃点东西吧');
                return;
            }
            let mugao = await exist_yijie_beibao_thing(usr_qq, "铁镐", "道具")
            if (mugao > 0) {
                await Add_yijie_饱食度(usr_qq, -100)
                await redis.set("xiuxian:yijie:player:" + usr_qq + "xunbaocd", now_Time);
                await Add_yijie_beibao_thing(usr_qq, "深邃矿洞", "道具", -1);
                await Add_yijie_beibao_thing(usr_qq, "铁镐", "道具", -1);
                if (math >= 0.95) {
                    e.reply(`${tianfu}${fanbei}你在【深邃矿洞】捡到了【箱子*初级材料箱】*${2 * beilv + other}`)
                    await Add_yijie_beibao_thing(usr_qq, "初级材料箱", "箱子", 2 * beilv + other)
                    return;
                } else if (math > 0.8 && math < 0.95) {
                    e.reply(`${tianfu}${fanbei}你在【深邃矿洞】挖出了【材料*原金矿】*${10 * beilv + other}`)
                    await Add_yijie_beibao_thing(usr_qq, "原金矿", "材料", 10 * beilv + other)
                    return;
                } else if (math > 0.6 && math <= 0.8) {
                    e.reply(`${tianfu}${fanbei}你在【深邃矿洞】挖出了【材料*原铁矿】*${20 * beilv + other}`)
                    await Add_yijie_beibao_thing(usr_qq, "原铁矿", "材料", 20 * beilv + other)
                    return;
                } else if (math > 0.4 && math <= 0.6) {
                    e.reply(`${tianfu}${fanbei}你在【深邃矿洞】挖出了【材料*钻石】*${1 * beilv + other}`)
                    await Add_yijie_beibao_thing(usr_qq, "钻石", "材料", 1 * beilv + other)
                    return;
                } else {
                    e.reply(`${tianfu}${fanbei}你在【深邃矿洞】挖出了【材料*煤矿】*${5 * beilv + other}`)
                    await Add_yijie_beibao_thing(usr_qq, "煤矿", "材料", 5 * beilv + other)
                    return;
                }
            } else {
                e.reply('你没有铁镐，无法在矿洞里搜寻宝贝！')
                return;
            }
        }
        if (thing_name == "仙石迷幻阵") {
            if (player.饱食度 < 200) {
                e.reply('你快饿死了,还是先吃点东西吧');
                return;
            }
            let mugao = await exist_yijie_beibao_thing(usr_qq, "铁镐", "道具")
            if (mugao > 0) {
                await Add_yijie_饱食度(usr_qq, -100)
                await redis.set("xiuxian:yijie:player:" + usr_qq + "xunbaocd", now_Time);
                await Add_yijie_beibao_thing(usr_qq, "深邃矿洞", "道具", -1);
                await Add_yijie_beibao_thing(usr_qq, "铁镐", "道具", -1);
                if (math >= 0.95) {
                    e.reply(`${tianfu}${fanbei}你在【深邃矿洞】捡到了【箱子*初级材料箱】*${2 * beilv + other}`)
                    await Add_yijie_beibao_thing(usr_qq, "初级材料箱", "箱子", 2 * beilv + other)
                    return;
                } else if (math > 0.8 && math < 0.95) {
                    e.reply(`${tianfu}${fanbei}你在【深邃矿洞】挖出了【材料*原金矿】*${10 * beilv + other}`)
                    await Add_yijie_beibao_thing(usr_qq, "原金矿", "材料", 10 * beilv + other)
                    return;
                } else if (math > 0.6 && math <= 0.8) {
                    e.reply(`${tianfu}${fanbei}你在【深邃矿洞】挖出了【材料*原铁矿】*${20 * beilv + other}`)
                    await Add_yijie_beibao_thing(usr_qq, "原铁矿", "材料", 20 * beilv + other)
                    return;
                } else if (math > 0.4 && math <= 0.6) {
                    e.reply(`${tianfu}${fanbei}你在【深邃矿洞】挖出了【材料*钻石】*${1 * beilv + other}`)
                    await Add_yijie_beibao_thing(usr_qq, "钻石", "材料", 1 * beilv + other)
                    return;
                } else {
                    e.reply(`${tianfu}${fanbei}你在【深邃矿洞】挖出了【材料*煤矿】*${5 * beilv + other}`)
                    await Add_yijie_beibao_thing(usr_qq, "煤矿", "材料", 5 * beilv + other)
                    return;
                }
            } else {
                e.reply('你没有铁镐，无法在矿洞里搜寻宝贝！')
                return;
            }
        }
    }

    async yijie_eat(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let player = await Read_yijie_player(usr_qq);
        //检索方法
        var reg = new RegExp(/食用/);
        let msg = e.msg.replace(reg, '');
        msg = msg.replace("#", '');
        let code = msg.split("\*");
        let thing_name = code[0];
        let quantity = code[1];
        quantity = await convert2integer(quantity);
        //看看物品名称有没有设定,是不是瞎说的
        let thing_exist = await yijie_foundthing(thing_name);
        if (!thing_exist) {
            e.reply(`异界查无此物`);
            return;
        }
        await Go(e);
        if (allaction) {
            console.log(allaction);
        } else {
            return;
        }
        allaction = false;
        let action = await redis.get("xiuxian:player:" + 10 + ":biguang");
        action = await JSON.parse(action);
        let x = await exist_yijie_beibao_thing(usr_qq, thing_name, thing_exist.class);
        if (!x) {
            e.reply(`你没有【${thing_name}】这样的【${thing_exist.class}】`);
            return;
        }
        quantity = await convert2integer(quantity)
        let baoshidu = 0
        let eat = data.yijie_shichai.find(item => item.name == thing_name);
        if (eat) {
            baoshidu = eat.饱食度
        }
        if (baoshidu == 0) {
            e.reply(`不要随随便便什么东西都往嘴里送啊喂！`)
            return
        }
        let shicai = await exist_yijie_beibao_thing(usr_qq, thing_name, "食材")
        if (shicai >= quantity) {
            await Add_yijie_beibao_thing(usr_qq, thing_name, "食材", -quantity);
            await Add_yijie_饱食度(usr_qq, baoshidu * quantity)
            e.reply(`食用成功,增加了${baoshidu * quantity}点饱食度`)
            return;
        } else {
            e.reply(`你没有那么多的【${thing_name}】`)
            return;
        }
    }

    async yijie_hecheng(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        if (!verc({ e })) return false;
        let usr_qq = e.user_id.toString().replace('qg_', '');
        usr_qq = await Gulid(usr_qq);
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let player = await Read_yijie_player(usr_qq);
        //检索方法
        var reg = new RegExp(/异界合成/);
        let msg = e.msg.replace(reg, '');
        msg = msg.replace("#", '');
        let code = msg.split("\*");
        let thing_name = code[0];
        let quantity = code[1];
        quantity = await convert2integer(quantity);
        //看看物品名称有没有设定,是不是瞎说的
        let thing_exist = await yijie_foundthing(thing_name);
        if (!thing_exist) {
            e.reply(`异界查无此物`);
            return;
        }
        allaction = false;
        let wupin = data.yijie_hecheng.find(item => item.name == thing_name);
        if (!isNotNull(wupin)) {
            e.reply(`异界暂不支持该物品的合成`);
            return;
        }
        //看物品是否够
        for (let i = 0; i < wupin.materials.length; i++) {
            const material = wupin.materials[i];
            let x = await exist_yijie_beibao_thing(usr_qq, material.name, material.class);
            if (x == false) {
                x = 0;
            }
            if (x < material.amount * quantity) {
                e.reply(`背包中拥有【${material.name}】*${x}，合成需要${material.amount * quantity}份`);
                return;
            }
        }
        //纳戒中减去对应物品
        for (let i = 0; i < wupin.materials.length; i++) {
            const material = wupin.materials[i];
            await Add_yijie_beibao_thing(usr_qq, material.name, material.class, -material.amount * quantity)
        }
        await Add_yijie_beibao_thing(usr_qq, wupin.name, wupin.class, wupin.amount * quantity);
        e.reply(`合成成功，获得【${wupin.name}】*${wupin.amount * quantity}`);
        return;
    }

    async yijie_hecheng_list(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        let thing_type = e.msg.replace("#查询异界合成列表", "");
        let img = await get_yijie_hecheng_img(e, thing_type);
        e.reply(img);
        return;
    }

    /**
     * 获取缓存中的人物状态信息
     * @param usr_qq
     * @returns {Promise<void>}
     */
    async getPlayerAction(usr_qq) {
        let action = await redis.get("xiuxian:yijie:player:" + usr_qq + ":action");
        action = JSON.parse(action);//转为json格式数据
        return action;
    }

    /**
     * 获取人物的状态，返回具体的状态或者空闲
     * @param action
     * @returns {Promise<void>}
     */
    async getPlayerState(action) {
        if (action == null) {
            return "空闲";
        }
        let now_time = new Date().getTime();
        let end_time = action.end_time;
        //当前时间>=结束时间，并且未结算 属于已经完成任务，却并没有结算的
        //当前时间<=完成时间，并且未结算 属于正在进行
        if (!((now_time >= end_time && (action.shutup == 0 || action.working == 0 || action.plant == 0)) || (now_time <= end_time && (action.shutup == 0 || action.working == 0 || action.plant == 0)))) {

            return "空闲";
        }
        return action.action;
    }

    /**
     * 刷怪结算
     * @param usr_qq
     * @param time持续时间(单位用分钟)
     * @param is_random是否触发随机事件  true,false
     * @param group_id  回复消息的地址，如果为空，则私聊
     * @returns {Promise<void>}
     */
    async dagong_jiesuan(user_id, time, is_random, group_id) {


        let usr_qq = e.user_id.toString().replace('qg_', '')
        usr_qq = await Gulid(usr_qq);
        let player = data.getData("yijie_player", usr_qq);
        if (!isNotNull(player.xianding_level)) {
            return;
        }
        let xinghunbi = Math.floor(15 * Number(player.xianding_level) * 0.8)
        let num1 = xinghunbi - 30
        let num2 = xinghunbi - 15
        if (player.xianding_level < 3) {
            num1 = 30
            num2 = 15
        }
        let Time = time * 2;//分钟
        let msg = [segment.at(e.user_id)];
        let other_xinghunbi = 0;
        let rand = Math.random();
        if (rand < 0.2 && num1 > 0 && num2 > 0) {
            let a = Math.floor(Math.random() * num1) + 1;
            other_xinghunbi = a;
            msg.push("\n刷怪的时候不小心被地上的石头绊了一跤，你把石头挖开一看，发现了星魂币" + a);
        } else if (rand > 0.7) {
            let a = Math.floor(Math.random() * num2) + 1;
            other_xinghunbi = -1 * a;
            msg.push("\n刷怪的时候被人抢了一只，因此你得到的报酬也减少了，获取的星魂币减少" + a);
        }
        let get_xinghunbi = Math.floor(xinghunbi * Time + other_xinghunbi);
        await Add_星魂币(user_id, get_xinghunbi);

        //给出消息提示
        if (is_random) {
            msg.push("\n本次刷怪获得星魂币" + get_xinghunbi);
        } else {
            msg.push("\n本次刷怪获得星魂币" + get_xinghunbi);
        }

        if (group_id) {
            await this.pushInfo(group_id, true, msg)
        } else {
            await this.pushInfo(usr_qq, false, msg);
        }

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
                    Bot.logger.mark(err);
                });
        } else {
            await common.relpyPrivate(id, msg);
        }
    }
}

/**
 * 状态
 */
export async function Go(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);
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


export async function get_yijie_hecheng_img(e, thing_type) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);
    let ifexistplay = data.existData("yijie_player", usr_qq);
    if (!ifexistplay) {
        return;
    }


    let tuzhi_list = data.yijie_hecheng;
    if (thing_type != "") {
        if (thing_type == "装备" || thing_type == "道具" || thing_type == "材料") {
            tuzhi_list = tuzhi_list.filter(item => item.class == thing_type);
        }
        else if (thing_type == "武器" || thing_type == "护具" || thing_type == "法宝") {

            tuzhi_list = tuzhi_list.filter(item => item.type == thing_type);
        }
    }
    let tuzhi_data = {
        user_id: usr_qq,
        tuzhi_list: tuzhi_list
    }
    const data1 = await new Show(e).get_yijiehecheng_Data(tuzhi_data);
    let img = await puppeteer.screenshot("yijie_hecheng", {
        ...data1,
    });
    return img;
}