import plugin from '../../../../lib/plugins/plugin.js'
import config from "../../model/Config.js"
import data from '../../model/XiuxianData.js'
import {
    yijie_foundjinmaithing,
    Write_yijie_beibao,
    yijie_existplayer,
    yijie_zhanlijisuan,
    Read_yijie_beibao,
    Add_yijie_beibao_thing,
    Add_xianding_exp,
    exist_yijie_beibao_thing,
    yijie_foundthing,
    Read_yijie_player,
    Add_星魂币
} from '../Xiuxian/xiuxian.js'
import { get_yijie_player_img, get_beibao_img } from '../ShowImeg/showData.js'
import { __PATH } from "../Xiuxian/xiuxian.js"

//如需截图必须引入以下两库
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';

/**
 * 全局
 */
let allaction = false;//全局状态判断
/**
 * 交易系统
 */
export class yijiebeibao extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'yijiebeibao',
            /** 功能描述 */
            dsc: '交易模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: '^#我的背包$',
                    fnc: 'mybeibao'
                },
                {
                    reg: '^#开启箱子.*$',
                    fnc: 'open_box'
                },
                {
                    reg: '^#十连箱子.*$',
                    fnc: 'open_box_ten'
                },
                {
                    reg: '^#查询箱子.*$',
                    fnc: 'find_box'
                },
                {
                    reg: '^#异界出售.*$',
                    fnc: 'Sell_comodities'
                },
                {
                    reg: '^#异界一键出售.*$',
                    fnc: 'Sell_all_comodities'
                },
                {
                    reg: '^#背包(锁定|解锁)(装备|道具|材料|食材|箱子).*$',
                    fnc: 'locked'
                }
            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
    }

    async locked(e) {
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
        //命令判断
        let msg = e.msg.replace("#背包", '');
        let un_lock = msg.substr(0, 2);
        let thing = msg.substr(4).split("\*");
        let thing_name = thing[0];
        let thing_exist = await yijie_foundthing(thing_name);
        if (!thing_exist) {
            e.reply(`异界不存在${thing_name}`);
            return;
        }


        let beibao = await Read_yijie_beibao(usr_qq);
        let ifexist;
        if (thing_exist.class == "装备") {
            ifexist = beibao.装备.find(item => (item.name == thing_name));
        }
        if (thing_exist.class == "道具") {
            ifexist = beibao.道具.find(item => item.name == thing_name);
        }
        if (thing_exist.class == "材料") {
            ifexist = beibao.材料.find(item => item.name == thing_name);
        }
        if (thing_exist.class == "食材") {
            ifexist = beibao.食材.find(item => item.name == thing_name);
        }
        if (thing_exist.class == "箱子") {
            ifexist = beibao.箱子.find(item => item.name == thing_name);
        }
        if (!ifexist) {//没有
            e.reply(`你没有【${thing_name}】这样的${thing_exist.class}`);
            return;
        }
        if (ifexist.islockd == 0) {
            if (un_lock == "锁定") {
                ifexist.islockd = 1;
                await Write_yijie_beibao(usr_qq, beibao);
                e.reply(`${thing_exist.class}:${thing_name}已锁定`);
                return;
            } else if (un_lock == "解锁") {
                e.reply(`${thing_exist.class}:${thing_name}本就是未锁定的`);
                return;
            }
        } else if (ifexist.islockd == 1) {
            if (un_lock == "解锁") {
                ifexist.islockd = 0;
                await Write_yijie_beibao(usr_qq, beibao);
                e.reply(`${thing_exist.class}:${thing_name}已解锁`);
                return;
            } else if (un_lock == "锁定") {
                e.reply(`${thing_exist.class}:${thing_name}本就是锁定的`);
                return;
            }
        }
    }

    async Sell_all_comodities(e) {
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
        let str = [];
        let najie = await data.getData("yijie_beibao", usr_qq);
        let commodities_price = 0
        let wupin = ['装备', '道具', '材料', '箱子', '食材'];
        let wupin1 = []
        if (e.msg != '#异界一键出售') {
            let thing = e.msg.replace("#异界一键出售", '');
            for (var i of wupin) {
                if (thing.includes(i)) {
                    wupin1.push(i)
                    thing = thing.replace(i, "")
                }
            }
            if (thing.length == 0) {
                wupin = wupin1
            } else {
                return;
            }
        }
        console.log(wupin);
        for (var i of wupin) {
            console.log(najie[i]);
            for (let l of najie[i]) {
                if (l.islockd == 0) {
                    //纳戒中的数量
                    let quantity = l.数量;
                    let t;
                    let y = await yijie_foundjinmaithing(l.name);
                    if (y) {
                        str.push(`【${l.name}】禁止出售`)
                        return;
                    }
                    await Add_yijie_beibao_thing(usr_qq, l.name, l.class, -quantity);
                    t = `【${l.name}*${l.数量}】出售成功,`;
                    commodities_price = commodities_price + l.出售价 * quantity;
                    let money = l.出售价 * quantity;
                    t = t + `共${money} 星魂币`;
                    str.push(t);
                }
            }
        }
        await Add_星魂币(usr_qq, commodities_price);
        str.push(`出售成功!出售共获得${commodities_price}星魂币 `);

        //返回图片
        let log_data = {
            log: str,
        };
        const data1 = await new Show(e).get_logData(log_data);
        let img = await puppeteer.screenshot('log', {
            ...data1,
        });
        e.reply(img);
        return;
    }

    //出售商品
    async Sell_comodities(e) {
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
        //命令判断
        let thing = e.msg.replace("#", '');
        thing = thing.replace("异界出售", '');
        let code = thing.split("\*");
        let thing_name = code[0]; //物品
        let thing_amount = code[1];//数量
        let najie = await Read_yijie_beibao(usr_qq);
        let thing_exist = await yijie_foundthing(thing_name);
        if (!thing_exist) {
            e.reply(`异界不存在【${thing_name}】`);
            return;
        }
        if (thing_amount < 1 || thing_amount == null || thing_amount == undefined || thing_amount == NaN) {
            thing_amount = 1;
        } else {
            thing_amount = thing_amount.replace(/[^0-9]/ig, "");
        }
        if (thing_amount < 1 || thing_amount == null || thing_amount == undefined || thing_amount == NaN) {
            thing_amount = 1;
        }
        let x = await exist_yijie_beibao_thing(usr_qq, thing_name, thing_exist.class);
        if (!x) {
            //没有
            e.reply(`你的背包里没有【${thing_name}】这样的${thing_exist.class}`);
            return;
        }
        let y = await yijie_foundjinmaithing(thing_name);
        if (y) {
            e.reply(`【${thing_name}】禁止出售`);
            return;
        }
        if (x < thing_amount) {
            //不够
            e.reply(`你目前只有【${thing_name}】*${x}`);
            return;
        }

        await Add_yijie_beibao_thing(usr_qq, thing_name, thing_exist.class, -thing_amount);
        let commodities_price = thing_exist.出售价 * thing_amount;
        await Add_星魂币(usr_qq, commodities_price);
        e.reply(`出售成功!  获得${commodities_price}星魂币,还剩余【${thing_name}】*${x - thing_amount} `);
        return;
    }

    async open_box(e) {
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let thing_name = e.msg.replace("#开启箱子", '');
        thing_name = thing_name.trim();
        let x = await exist_yijie_beibao_thing(usr_qq, thing_name, "箱子");
        if (!x) {
            e.reply(`你没有【${thing_name}】这样的箱子`);
            return;
        }
        await Add_yijie_beibao_thing(usr_qq, thing_name, "箱子", -1);
        let thing = data.yijie_box.find(item => item.name == thing_name);
        let contents = thing.contents;
        let chuhuo_all = ""

        let rand = Math.random();
        let rate = 0;
        let cishu = await redis.get("xiuxian:box:player:" + usr_qq + ":" + thing.id)
        let all_cishu = await redis.get("xiuxian:box:player:" + usr_qq + ":" + thing.id + "_all")
        let lishi = await redis.get("xiuxian:box:player:" + usr_qq + ":" + thing.id + "_log")
        if (!cishu) {
            cishu = 0
        }
        if (!all_cishu) {
            all_cishu = 0
        }
        if (!lishi) {
            lishi = ""
        }
        cishu = Number(cishu)
        all_cishu = Number(all_cishu)
        cishu += 1
        all_cishu += 1
        var time = new Date();
        let a
        if (cishu < thing.baodi) {
            for (let i in contents) {
                rate += contents[i].rate;
                if (rand < rate) {
                    let item = contents[i].items[Math.floor(Math.random() * contents[i].items.length)];
                    await Add_yijie_beibao_thing(usr_qq, item.name, item.class, item.amount);
                    a = `【${item.name}】*${item.amount}`
                    if (item.name == thing.best) {
                        cishu = 0
                        chuhuo_all += `【(极品)${item.name}】*${item.amount},`;
                    } else {
                        chuhuo_all += `【${item.name}】*${item.amount},`;
                    }
                    break;
                }
            }
        } else {
            for (let i in contents) {
                let item = contents[i].items.find(item => item.name == thing.best);
                if (item) {
                    await Add_yijie_beibao_thing(usr_qq, item.name, item.class, item.amount);
                    chuhuo_all += `【(保底)(极品)${item.name}】*${item.amount},`;
                    a = `【${item.name}】*${item.amount}`
                    break;
                }
            }
            cishu = 0
        }
        lishi = `====================
时间：${time.toLocaleString()}
总次数：${all_cishu}
当前次数：${cishu}
保底还差：${thing.baodi - cishu}
物品：${a}
` + lishi
        await redis.set("xiuxian:box:player:" + usr_qq + ":" + thing.id, cishu)
        await redis.set("xiuxian:box:player:" + usr_qq + ":" + thing.id + "_log", lishi)
        await redis.set("xiuxian:box:player:" + usr_qq + ":" + thing.id + "_all", all_cishu)
        chuhuo_all = chuhuo_all.substring(0, chuhuo_all.length - 1);
        e.reply(`您打开了${thing_name} ，获得了${chuhuo_all}`)

        return;
    }

    async open_box_ten(e) {
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let thing_name = e.msg.replace("#十连箱子", '');
        thing_name = thing_name.trim();
        let x = await exist_yijie_beibao_thing(usr_qq, thing_name, "箱子");
        if (!x) {
            e.reply(`你没有【${thing_name}】这样的箱子`);
            return;
        }
        if (x < 10) {
            e.reply(`【${thing_name}】不足十个！`);
            return;
        }
        await Add_yijie_beibao_thing(usr_qq, thing_name, "箱子", -10);
        let thing = data.yijie_box.find(item => item.name == thing_name);
        let contents = thing.contents;
        let chuhuo_all = ""

        for (let i = 0; i < 10; i++) {

            let rand = Math.random();
            let rate = 0;
            let cishu = await redis.get("xiuxian:box:player:" + usr_qq + ":" + thing.id)
            let all_cishu = await redis.get("xiuxian:box:player:" + usr_qq + ":" + thing.id + "_all")
            let lishi = await redis.get("xiuxian:box:player:" + usr_qq + ":" + thing.id + "_log")
            if (!cishu) {
                cishu = 0
            }
            if (!all_cishu) {
                all_cishu = 0
            }
            if (!lishi) {
                lishi = ""
            }
            cishu = Number(cishu)
            all_cishu = Number(all_cishu)
            cishu += 1
            all_cishu += 1
            var time = new Date();
            let a
            if (cishu < thing.baodi) {
                for (let i in contents) {
                    rate += contents[i].rate;
                    if (rand < rate) {
                        let item = contents[i].items[Math.floor(Math.random() * contents[i].items.length)];
                        await Add_yijie_beibao_thing(usr_qq, item.name, item.class, item.amount);
                        a = `【${item.name}】*${item.amount}`
                        if (item.name == thing.best) {
                            cishu = 0
                            chuhuo_all += `【(极品)${item.name}】*${item.amount},`;
                        } else {
                            chuhuo_all += `【${item.name}】*${item.amount},`;
                        }
                        break;
                    }
                }
            } else {
                for (let i in contents) {
                    let item = contents[i].items.find(item => item.name == thing.best);
                    if (item) {
                        await Add_yijie_beibao_thing(usr_qq, item.name, item.class, item.amount);
                        chuhuo_all += `【(保底)(极品)${item.name}】*${item.amount},`;
                        a = `【${item.name}】*${item.amount}`
                        break;
                    }
                }
                cishu = 0
            }
            lishi = `====================
时间：${time.toLocaleString()}
总次数：${all_cishu}
当前次数：${cishu}
保底还差：${thing.baodi - cishu}
物品：${a}
` + lishi
            await redis.set("xiuxian:box:player:" + usr_qq + ":" + thing.id, cishu)
            await redis.set("xiuxian:box:player:" + usr_qq + ":" + thing.id + "_log", lishi)
            await redis.set("xiuxian:box:player:" + usr_qq + ":" + thing.id + "_all", all_cishu)
        }
        chuhuo_all = chuhuo_all.substring(0, chuhuo_all.length - 1);
        e.reply(`您一次性打开了十个箱子，共获得了：
${chuhuo_all}`)

        return;
    }


    async find_box(e) {
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let thing_name = e.msg.replace("#查询箱子", '');
        thing_name = thing_name.trim();
        let sf = await yijie_foundthing(thing_name);
        if (!sf) {
            e.reply("异界查无此物")
            return;
        }
        let thing = data.yijie_box.find(item => item.name == thing_name);
        let all_cishu = await redis.get("xiuxian:box:player:" + usr_qq + ":" + thing.id + "_all")
        let cishu = await redis.get("xiuxian:box:player:" + usr_qq + ":" + thing.id)
        if (!all_cishu) {
            all_cishu = 0
        }
        if (!cishu) {
            cishu = 0
        }
        e.reply(`箱子：${thing_name}
累计抽数：${all_cishu}
本箱子保底数：${thing.baodi}
当前保底内已抽数：${cishu}
还有【${thing.baodi - cishu}】抽保底`)
        return;
    }

    async mybeibao(e) {
        let usr_qq = e.user_id;
        //有无存档
        let ifexistplay = await yijie_existplayer(usr_qq);
        if (!ifexistplay) {
            return;
        }
        let img = await get_beibao_img(e);
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