import plugin from '../../../../lib/plugins/plugin.js'
import config from "../../model/Config.js"

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
                    reg: '^#获取频道头像链接$',
                    fnc: 'GetHeadUrl'
                },
                {
                    reg: '^#获取频道名$',
                    fnc: 'GetGulidName'
                },

            ]
        })
        this.xiuxianConfigData = config.getConfig("xiuxian", "xiuxian");
        this.GulidConfigData = config.getConfig("Gulid", "Gulid");
    }

    async GetHeadUrl(e) {
        e.reply(e.member.getAvatarUrl())
        return;
    }

    async GetGulidName(e) {
        e.reply(e.guild_name)
        return;
    }
}