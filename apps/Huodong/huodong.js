import plugin from '../../../lib/plugins/plugin.js'

import data from '../model/XiuxianData.js'
import fs from "fs"

//如需截图必须引入以下两库
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import Show from '../model/show.js';


export class DSC extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'Yunzai_Bot_Xiuxian_Huodong',
            /** 功能描述 */
            dsc: '活动模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 500,
            rule: [
                {
                    reg: '^#$',
                    fnc: ''
                }
            ]
        })
    }



}