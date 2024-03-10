import plugin from '../../../../lib/plugins/plugin.js'

import data from '../../model/XiuxianData.js'
//如需截图必须引入以下两库
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';

export class Ningyuandian extends plugin {
    constructor() {
        super({
            /** 功能名称 */
            name: 'Yunzai_Bot_xiuxian_Ningyuan',
            /** 功能描述 */
            dsc: '凝渊殿',
            event: 'message',
            /** 优先级，数字越小等级越高 */
            priority: 600,
            rule: [
                {
                    reg: '^#挑战凝渊殿$',
                    fnc: 'tznyd'
                },
                {
                    reg: '^#查看本月仙殷祥祝$',
                    fnc: 'xyxz'
                }
            ]
        })
    }

    async xyxz(e) {
        e.reply("本月仙殷祥祝效果：\n战斗开始时，获得10%攻击力加成，持续3回合\n\n道法仙术加成后效果：\n战斗开始时，获得12%攻击力加成，持续5回合")
    }

    async tznyd(e) {
        //不开放私聊功能
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return;
        }
        if (data.existData("player", e.user_id)) {
            let usr_qq = e.user_id;
            let player = data.getData("player", usr_qq);


            if (player.镇妖塔层数 < 3500) {
                e.reply('镇妖塔层数不足3500，无法参与战斗');
                return;
            }
            let bosszt = data.ningyuan_guai_list_1.find(item => item.id == 1)
            let zd_msg = await xh_zd(player, bosszt)

            let log_data = {
                log: zd_msg,
            };
            const data1 = await new Show(e).get_logData(log_data);
            let img = await puppeteer.screenshot('log', {
                ...data1,
            });
            e.reply(img);
            // if (bosszt.Health == 0) {
            //     CurrentPlayerAttributes.镇妖塔层数 += 5;
            //     CurrentPlayerAttributes.灵石 += Reward;
            //     CurrentPlayerAttributes.当前血量 += Reward * 21;
            //     e.reply([segment.at(e.user_id), `\n恭喜通过此层镇妖塔，层数+5！增加灵石${Reward}回复血量${Reward * 21}`]);
            //     data.setData("player", e.user_id, CurrentPlayerAttributes);
            // }
            // if (CurrentPlayerAttributes.当前血量 == 0 || CurrentPlayerAttributes.当前血量 < 0) {
            //     CurrentPlayerAttributes.当前血量 = 0;
            //     let JL = Reward / 12
            //     JL = Number(JL)
            //     JL = JL.toFixed(0)
            //     CurrentPlayerAttributes.灵石 -= JL;
            //     e.reply([segment.at(e.user_id), `\n你未能通过此层镇妖塔！灵石-${JL}`]);
            //     await data.setData("player", e.user_id, CurrentPlayerAttributes);
            // }

            return true;
        } else {
            e.reply("区区凡人，也想参与此等战斗中吗？请踏入仙途，好好修炼吧！");
            return true;
        }
    }
}

//攻击攻击防御计算伤害
function Harm(atk, def, bao, baoshang) {
    let x;
    let s = Math.random()
    if (s <= bao) {
        x = atk * (1 + baoshang) / def
    } else {
        x = atk / def
    }
    if (x < 1) {
        x = 1
    }

    return x;
}

/*
* 战斗相关
*/
export async function xh_zd(A_player, B_player) {
    let cnt = 1; //回合数

    if (!A_player.灵气) {
        A_player.灵气 = 100
    }
    if (!A_player.单段攻击回复灵气) {
        A_player.单段攻击回复灵气 = 20
    }
    if (!A_player.终结技) {
        A_player.终结技 = "破体之力"
    }
    if (!A_player.倍率) {
        A_player.倍率 = 1.5
    }
    //攻击赋值
    let a_atk = A_player.攻击
    let b_atk = B_player.攻击
    //灵气赋值
    let A_lingqi = 0
    let B_lingqi = 0

    let xyxz_cnt = 3
    let xyxz_atk_add = 0.1
    let now_Time = new Date().getTime(); //获取当前时间戳
    if (A_player.daofaxianshu_endtime > now_Time) {
        xyxz_cnt = 5
        xyxz_atk_add = 0.12
    }

    let msg = [];
    while (A_player.当前血量 > 0 && B_player.当前血量 > 0) {
        msg.push(`==第${cnt}回合==`)
        let lingshi_atk = a_atk
        if (xyxz_cnt > 0) {
            msg.push(`本回合获得【仙殷祥祝】祝福，攻击力提高${xyxz_atk_add * 100}%`)
            xyxz_cnt--
            lingshi_atk *= xyxz_atk_add + 1
        }

        let A_shanghai = Harm(lingshi_atk, B_player.防御, A_player.暴击, A_player.暴击伤害)
        let B_shanghai = Harm(b_atk, A_player.防御, B_player.暴击, B_player.暴击伤害)
        //A对B
        if (A_lingqi < A_player.灵气) {
            B_player.当前血量 -= A_shanghai
            if (B_player.当前血量 < 0) {
                B_player.当前血量 = 0
            }
            A_lingqi += A_player.单段攻击回复灵气
            msg.push(`${A_player.名号}发起了攻击！对${B_player.名号}发起了普通攻击，造成伤害${A_shanghai}，${B_player.名号}剩余血量${B_player.当前血量}\n回复了${A_player.单段攻击回复灵气}，当前灵气值${A_lingqi}/${A_player.灵气}`)
            if (B_player.当前血量 <= 0) {
                msg.push(`${A_player.名号}造成了致命一击，击败了${B_player.名号}，结束了战斗！`)
                msg.push(`====================`)
                msg.push(`${A_player.名号}赢得了战斗`)
                break;
            }
        } else {
            B_player.当前血量 -= A_shanghai * A_player.倍率
            A_lingqi -= A_player.灵气
            if (B_player.当前血量 < 0) {
                B_player.当前血量 = 0
            }
            msg.push(`${A_player.名号}灵气汇满！消耗了${A_player.灵气}灵气对${A_player.名号}发起了终结技${A_player.终结技}，造成伤害${A_shanghai * A_player.倍率}，${B_player.名号}剩余血量${B_player.当前血量}\n当前灵气值${A_lingqi}/${A_player.灵气}`)
            if (B_player.当前血量 <= 0) {
                msg.push(`${A_player.名号}造成了致命一击，击败了${B_player.名号}，结束了战斗！`)
                msg.push(`====================`)
                msg.push(`${A_player.名号}赢得了战斗`)
                break;
            }
        }

        //B对A
        if (B_lingqi < B_player.灵气) {
            A_player.当前血量 -= B_shanghai
            if (A_player.当前血量 < 0) {
                A_player.当前血量 = 0
            }
            B_lingqi += B_player.单段攻击回复灵气
            msg.push(`${B_player.名号}发起了攻击！对${A_player.名号}发起了普通攻击，造成伤害${B_shanghai}，${A_player.名号}剩余血量${A_player.当前血量}\n回复了${B_player.单段攻击回复灵气}，当前灵气值${B_lingqi}/${B_player.灵气}`)
            if (A_player.当前血量 <= 0) {
                msg.push(`${B_player.名号}造成了致命一击，击败了${A_player.名号}，结束了战斗！`)
                msg.push(`====================`)
                msg.push(`${B_player.名号}赢得了战斗`)
                break;
            }
        } else {
            A_player.当前血量 -= B_shanghai * B_player.倍率
            B_lingqi -= B_player.灵气
            if (A_player.当前血量 < 0) {
                A_player.当前血量 = 0
            }
            msg.push(`${B_player.名号}灵气汇满！消耗了${B_player.灵气}灵气对${A_player.名号}发起了终结技${B_player.终结技}，造成伤害${B_shanghai * B_player.倍率}，${A_player.名号}剩余血量${A_player.当前血量}\n当前灵气值${B_lingqi}/${B_player.灵气}`)
            if (A_player.当前血量 <= 0) {
                msg.push(`${B_player.名号}造成了致命一击，击败了${A_player.名号}，结束了战斗！`)
                msg.push(`====================`)
                msg.push(`${B_player.名号}赢得了战斗`)
                break;
            }
        }


        cnt++;
    }
    return msg;
}