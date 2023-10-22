import plugin from '../../../../lib/plugins/plugin.js'
import data from '../../model/XiuxianData.js'
import config from "../../model/Config.js"
import { timestampToTime, shijianc, exist_najie_thing, ForwardMsg, Add_najie_thing } from '../Xiuxian/xiuxian.js'

//如需截图必须引入以下两库
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';
import Api from '../../api/api.js';
import { createOpenAPI, createWebsocket } from 'qq-guild-bot'
import chalk from "chalk"

export class Gulid extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'Yunzai_Bot_Gulid',
            /** 功能描述 */
            dsc: '频道模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,//小功能高一些
            rule: [
                {
                    reg: '^#调试频道$',
                    fnc: 'test'
                }

            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
        this.GulidConfigData = config.getConfig("Gulid", "Gulid");
    }

    async test(e) {
        e.reply(e.member.getAvatarUrl())
        return;
    }
}