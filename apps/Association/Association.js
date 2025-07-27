import plugin from '../../../../lib/plugins/plugin.js'
import { segment } from 'oicq'
import { ForwardMsg } from '../Xiuxian/xiuxian.js'
import * as DAL from '../../api/data-access.js'
import {
    handleAssociationSalary,
    handleJoinAssociation,
    handleExitAssociation,
    handleDonateAssociation,
    getAssociationDonateLog,
    getAssociationList
} from '../../logic/association_logic.js'

/**
 * 宗门
 */
export class Association extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'Association',
            /** 功能描述 */
            dsc: '宗门模块',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: '^#加入宗门.*$',
                    fnc: 'Join_association'
                },
                {
                    reg: '^#退出宗门$',
                    fnc: 'Exit_association'
                },
                {
                    reg: '^#宗门(上交|上缴|捐赠)灵石[1-9]\\d*',
                    fnc: 'give_association_lingshi'
                },
                {
                    reg: '^#宗门俸禄$',
                    fnc: 'gift_association'
                },
                {
                    reg: '^#宗门捐献记录$',
                    fnc: 'Logs_donate'
                },
                {
                    reg: '^#宗门列表$',
                    fnc: 'List_appointment'
                }
            ]
        })
    }

    // 通用的前置检查
    async validateRequest(e) {
        const usr_qq = e.user_id;

        // 检查是否在群聊中
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return null;
        }

        // 检查玩家是否存在
        const playerExists = await DAL.existPlayer(usr_qq);
        if (!playerExists) {
            return null;
        }

        return usr_qq;
    }

    //宗门俸禄
    async gift_association(e) {
        const usr_qq = await this.validateRequest(e);
        if (!usr_qq) return;

        try {
            const result = await handleAssociationSalary(usr_qq);
            if (result.success) {
                const msg = [
                    segment.at(usr_qq),
                    result.message
                ];
                e.reply(msg);
            } else {
                e.reply(result.message);
            }
        } catch (error) {
            console.error('[Association] 宗门俸禄领取失败:', error);
            e.reply('宗门俸禄领取失败，请稍后重试');
        }
    }

    //加入宗门
    async Join_association(e) {
        const usr_qq = await this.validateRequest(e);
        if (!usr_qq) return;

        let association_name = e.msg.replace("#加入宗门", '').trim();

        if (!association_name) {
            e.reply('请输入要加入的宗门名称');
            return;
        }

        try {
            const result = await handleJoinAssociation(usr_qq, association_name);
            e.reply(result.message);
        } catch (error) {
            console.error('[Association] 加入宗门失败:', error);
            e.reply('加入宗门失败，请稍后重试');
        }
    }

    //退出宗门
    async Exit_association(e) {
        const usr_qq = await this.validateRequest(e);
        if (!usr_qq) return;

        try {
            const result = await handleExitAssociation(usr_qq);
            e.reply(result.message);
        } catch (error) {
            console.error('[Association] 退出宗门失败:', error);
            e.reply('退出宗门失败，请稍后重试');
        }
    }

    //捐赠灵石
    async give_association_lingshi(e) {
        const usr_qq = await this.validateRequest(e);
        if (!usr_qq) return;

        //获取灵石数量
        const reg = new RegExp(/#宗门(上交|上缴|捐赠)灵石/);
        let lingshi = e.msg.replace(reg, '').trim();

        // 验证灵石数量
        const parsedLingshi = parseInt(lingshi);
        if (isNaN(parsedLingshi) || parsedLingshi <= 0) {
            e.reply('请输入有效的灵石数量');
            return;
        }

        try {
            const result = await handleDonateAssociation(usr_qq, parsedLingshi);
            e.reply(result.message);
        } catch (error) {
            console.error('[Association] 宗门捐赠失败:', error);
            e.reply('宗门捐赠失败，请稍后重试');
        }
    }

    //宗门捐献记录
    async Logs_donate(e) {
        const usr_qq = await this.validateRequest(e);
        if (!usr_qq) return;

        try {
            const result = await getAssociationDonateLog(usr_qq);
            if (result.success) {
                const { associationName, donateList } = result.data;
                const msg = [`${associationName} 灵石捐献记录表`];
                for (let i = 0; i < donateList.length; i++) {
                    msg.push(`第${i + 1}名  ${donateList[i].name}  捐赠灵石:${donateList[i].lingshi_donate}`);
                }
                await ForwardMsg(e, msg);
            } else {
                e.reply(result.message);
            }
        } catch (error) {
            console.error('[Association] 获取宗门捐献记录失败:', error);
            e.reply('获取宗门捐献记录失败，请稍后重试');
        }
    }

    //宗门列表
    async List_appointment(e) {
        const usr_qq = await this.validateRequest(e);
        if (!usr_qq) return;

        try {
            const result = await getAssociationList();
            if (result.success) {
                const { associations } = result.data;
                const temp = ["宗门列表"];

                if (associations.length == 0) {
                    temp.push("暂时没有宗门数据");
                } else {
                    for (const ass of associations) {
                        temp.push(
                            `序号:${ass.序号} \n` +
                            `宗名: ${ass.宗门名称}\n` +
                            `人数: ${ass.人数}\n` +
                            `位置: ${ass.位置}\n` +
                            `等级: ${ass.等级}\n` +
                            `天赋加成: ${ass.天赋加成}\n` +
                            `宗门建设等级:${ass.宗门建设等级}\n` +
                            `镇宗神兽:[${ass.镇宗神兽}]\n` +
                            `宗门驻地:[${ass.宗门驻地}]\n` +
                            `最低加入境界:[${ass.最低加入境界}]\n` +
                            `宗主: ${ass.宗主}`
                        );
                    }
                }

                await ForwardMsg(e, temp);
            } else {
                e.reply('获取宗门列表失败，请稍后重试');
            }
        } catch (error) {
            console.error('[Association] 获取宗门列表失败:', error);
            e.reply('获取宗门列表失败，请稍后重试');
        }
    }
}
