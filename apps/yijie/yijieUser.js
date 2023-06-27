import plugin from '../../../../lib/plugins/plugin.js'
import config from "../../model/Config.js"
import data from '../../model/XiuxianData.js'
import {
    Write_yijie_player,
    Write_yijie_beibao,
    yijie_existplayer,
    yijie_zhanlijisuan,
    Read_yijie_beibao,
    Add_yijie_beibao_thing,
    Add_xianding_exp,
    Add_yijie_饱食度,
    exist_yijie_beibao_thing,
    yijie_foundthing,
    Read_yijie_player,
    convert2integer,
    Add_星魂币,
    isNotNull
} from '../Xiuxian/xiuxian.js'
import { get_yijie_player_img, get_beibao_img } from '../ShowImeg/showData.js'
import { __PATH } from "../Xiuxian/xiuxian.js"
import Show from "../../model/show.js"
import puppeteer from "../../../../lib/puppeteer/puppeteer.js"

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
                    reg: '^#异界食用.*$',
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
                    reg: '#查询异界装备套装$',
                    fnc: 'find_zb'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    async find_zb(e) {
        let str = data.yijie_taozhuang
        let msg = []
        for (let i in str) {
            msg.push(`套装：${str[i].name}\n效果：${str[i].context}\n【武器*${str[i].wuqi}】\n【护具*${str[i].wuqi}】\n【法宝*${str[i].wuqi}】`)
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
        let usr_qq = e.user_id;
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

        let chushi = data.xiandingjieduan_list.find(item => item.level == player["xianding_level"])
        let wuqi = player["武器"]
        let huju = player["护具"]
        let fabao = player["法宝"]
        player["攻击"] = chushi["初始攻击"] + wuqi["atk"]
        player["防御"] = chushi["初始防御"] + huju["def"]
        player["血量上限"] = chushi["初始生命"] + fabao["HP"]
        player["暴击率"] = 0.05 + fabao["bao"]
        player["暴击率"] = Number(player["暴击率"].toFixed(3))
        await Add_yijie_beibao_thing(usr_qq, sf.name, sf.class, -1)
        await Add_yijie_beibao_thing(usr_qq, change.name, change.class, 1)
        await Write_yijie_player(usr_qq, player)
        this.Show_player(e)
        return;
    }

    async myzhanli(e) {
        let usr_qq = e.user_id;
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
        let usr_qq = e.user_id;
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
        let wuqi = new_player["武器"]
        let huju = new_player["护具"]
        let fabao = new_player["法宝"]
        let chushi = data.xiandingjieduan_list.find(item => item.level == new_player["xianding_level"])
        // chushi = JSON.parse(chushi)
        // wuqi = JSON.parse(wuqi)
        // huju = JSON.parse(huju)
        // fabao = JSON.parse(fabao)
        new_player["攻击"] = chushi["初始攻击"] + wuqi["atk"]
        new_player["防御"] = chushi["初始防御"] + huju["def"]
        new_player["血量上限"] = chushi["初始生命"] + fabao["HP"]
        new_player["暴击率"] = new_player["暴击率"] + fabao["bao"]
        new_player["暴击率"] = Number(new_player["暴击率"].toFixed(3))
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
    //#我的练气
    async Show_player(e) {
        let usr_qq = e.user_id;
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
        let usr_qq = e.user_id;
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
        let beilv = 1
        let wuqi = player.武器
        let huju = player.护具
        let fabao = player.法宝
        let fanbei = ""
        let taozhuangmath = Math.random();
        if (wuqi.name == "压缩金剑" && huju.name == "压缩金盾" && fabao.name == "压缩金葫芦") {
            if (taozhuangmath >= 0.9) {
                beilv = 2
                fanbei = "您触发了【寻宝者的期许】套装效果，本次寻宝收益翻倍！\n"
            }
        }
        if (thing_name == "幽静谷") {
            if (player.饱食度 < 100) {
                e.reply('你快饿死了,还是先吃点东西吧');
                return;
            }
            let mugao = await exist_yijie_beibao_thing(usr_qq, "玄蛛网", "道具")
            if (mugao > 0) {
                await Add_yijie_饱食度(usr_qq, -100)
                await redis.set("xiuxian:yijie:player:" + usr_qq + "xunbaocd", now_Time);
                if (isNotNull(mugao) && mugao > 0) {
                    await Add_yijie_beibao_thing(usr_qq, "", "玄蛛网", -1);
                    mugao = 1
                } else {
                    mugao = 0;
                }
                await Add_yijie_beibao_thing(usr_qq, "幽静谷", "道具", -1);
                if (math > 0.95 && math < 1) {
                    e.reply(`${fanbei}你在【幽静谷】发现了${1000 * beilv}个星魂币，之后迅速跑走了！`)
                    Add_星魂币(usr_qq, 1000 * beilv)
                    return;
                } else if (math > 0.8 && math <= 0.95) {
                    e.reply(`${fanbei}你在【幽静谷】打开了一个宝箱，宝箱内装有【道具*深邃矿洞】*${2 * beilv}以及【道具*铁镐】*${2 * beilv}`)
                    await Add_yijie_beibao_thing(usr_qq, "铁镐", "道具", 2 * beilv)
                    await Add_yijie_beibao_thing(usr_qq, "深邃矿洞", "道具", 2 * beilv)
                    return;
                } else if (math > 0.6 && math <= 0.8) {
                    e.reply(`${fanbei}你在【幽静谷】捡到了${100 * beilv}个星魂币，此外啥也没看到！`)
                    Add_星魂币(usr_qq, 100 * beilv)
                    return;
                } else if (math > 0.4 && math <= 0.6) {
                    e.reply(`${fanbei}你在【幽静谷】捡到了${50 * beilv}个星魂币，此外啥也没看到！`)
                    Add_星魂币(usr_qq, 50 * beilv)
                    return;
                } else {
                    e.reply(`${fanbei}你在【幽静谷】只捡到了${10 * beilv}个星魂币，此外啥也没看到！`)
                    Add_星魂币(usr_qq, 10 * beilv)
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
                if (isNotNull(mugao) && mugao > 0) {
                    await Add_yijie_beibao_thing(usr_qq, "", "铁镐", -1);
                    mugao = 1
                } else {
                    mugao = 0;
                }
                await Add_yijie_beibao_thing(usr_qq, "铁镐", "道具", -1);
                if (math > 0.8 && math < 1) {
                    e.reply(`${fanbei}你在【深邃矿洞】挖出了【材料*原金矿】*${10 * beilv}`)
                    await Add_yijie_beibao_thing(usr_qq, "原金矿", "材料", 10 * beilv)
                    return;
                } else if (math > 0.6 && math <= 0.8) {
                    e.reply(`${fanbei}你在【深邃矿洞】挖出了【材料*原铁矿】*${20 * beilv}`)
                    await Add_yijie_beibao_thing(usr_qq, "原铁矿", "材料", 20 * beilv)
                    return;
                } else if (math > 0.4 && math <= 0.6) {
                    e.reply(`${fanbei}你在【深邃矿洞】挖出了【材料*钻石矿】*${1 * beilv}`)
                    await Add_yijie_beibao_thing(usr_qq, "钻石矿", "材料", 1 * beilv)
                    return;
                } else {
                    e.reply(`${fanbei}你在【深邃矿洞】挖出了【材料*煤矿】*${5 * beilv}`)
                    await Add_yijie_beibao_thing(usr_qq, "煤矿", "材料", 5 * beilv)
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
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let player = await Read_yijie_player(usr_qq);
        //检索方法
        var reg = new RegExp(/异界食用/);
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
        if (thing_name == "烤肉") {
            let shicai = await exist_yijie_beibao_thing(usr_qq, thing_name, "道具")
            if (shicai >= quantity) {
                await Add_yijie_beibao_thing(usr_qq, thing_name, "道具", -quantity);
                await Add_yijie_饱食度(usr_qq, 20 * quantity)
                e.reply(`服用成功,增加了${20 * quantity}点饱食度`)
                return;
            } else {
                e.reply(`你没有那么多的【${thing_name}】`)
                return;
            }
        }
        e.reply(`不要随随便便什么东西都往嘴里送啊喂！`)
    }

    async yijie_hecheng(e) {
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


export async function get_yijie_hecheng_img(e, thing_type) {
    let usr_qq = e.user_id;
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