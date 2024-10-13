import plugin from '../../../../lib/plugins/plugin.js'
import common from "../../../../lib/common/common.js"
import data from '../../model/XiuxianData.js'
import config from "../../model/Config.js"
import fs from "node:fs"

import { isNotNull, Add_星魂币 } from "../Xiuxian/xiuxian.js"
import { Gulid2 } from '../../api/api.js'

/**
 * 定时任务
 */
export class yijietask extends plugin {
    constructor() {
        super({
            name: 'yijietask',
            dsc: '定时任务',
            event: 'message',
            priority: 300,
            rule: []
        });
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
        this.set = config.getdefSet('task', 'task')
        this.task = {
            cron: this.set.action_task,
            name: 'yijietask',
            fnc: () => this.Playercontroltask()
        }
    }

    async Playercontroltask() {
        //获取缓存中人物列表
        let playerList = [];
        let files = fs
            .readdirSync("./plugins/xiuxian-emulator-plugin/resources/data/yijie/player")
            .filter((file) => file.endsWith(".json"));
        for (let file of files) {
            file = file.replace(".json", "");
            playerList.push(file);
        }
        for (let player_id of playerList) {
            player_id = await Gulid2(player_id);
            let log_mag = "";//查询当前人物动作日志信息
            log_mag = log_mag + "查询" + player_id + "是否有动作,";
            //得到动作
            let action = await redis.get("xiuxian:yijie:player:" + player_id + ":action");
            try {
                action = await JSON.parse(action);
            } catch (error) {
                console.log(error);
            }
            //不为空，存在动作
            if (action != null) {
                let push_address;//消息推送地址
                let is_group = false;//是否推送到群
                if (action.hasOwnProperty("group_id")) {
                    if (isNotNull(action.group_id)) {
                        is_group = true;
                        push_address = action.group_id;
                    }
                }
                //最后发送的消息
                let msg = [segment.at(Number(player_id))];
                //动作结束时间
                let end_time = action.end_time;
                //现在的时间
                let now_time = new Date().getTime();
                //降妖
                if (action.shutup == "0") {
                    //这里改一改,要在结束时间的前一分钟提前结算
                    end_time = end_time - 60000 * 2;
                    //时间过了
                    if (now_time > end_time) {
                        //现在大于结算时间，即为结算
                        log_mag = log_mag + "当前人物未结算，结算状态";
                        let player = data.getData("yijie_player", player_id);
                        if (!isNotNull(player.xianding_level)) {
                            return;
                        }
                        let xinghunbi = Math.floor(15 * Number(player.xianding_level) * 0.8)
                        let num1 = xinghunbi - 30
                        let num2 = xinghunbi - 15
                        let time = (parseInt(action.time) / 1000 / 60 / 30) * 2;//分钟
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
                        //
                        data.setData("yijie_player", player_id, player);
                        let get_xinghunbi = Math.floor(xinghunbi * time + other_xinghunbi);//最后获取到的灵石
                        await Add_星魂币(player_id, get_xinghunbi);
                        //redis动作
                        if (action.acount == null) {
                            action.acount = 0;
                        }
                        let arr = action;
                        //把状态都关了
                        arr.shutup = 1;//闭关状态
                        arr.working = 1;//降妖状态
                        arr.power_up = 1;//渡劫状态
                        arr.Place_action = 1;//秘境
                        arr.Place_actionplus = 1;//沉迷状态
                        delete arr.group_id;//结算完去除group_id
                        await redis.set("xiuxian:yijie:player:" + player_id + ":action", JSON.stringify(arr));
                        msg.push("\n刷怪得到" + get_xinghunbi + "星魂币");
                        log_mag += "收入" + get_xinghunbi;
                        if (is_group) {
                            await this.pushInfo(push_address, is_group, msg)
                        } else {
                            await this.pushInfo(player_id, is_group, msg);
                        }
                    }
                }
            }
        }
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
