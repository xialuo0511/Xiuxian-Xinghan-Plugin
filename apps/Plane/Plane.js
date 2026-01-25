/**
 * 位面系统指令模块
 * @module apps/Plane/Plane
 */

import * as DAL from '../../api/data-access.js';
import { Gulid, puppeteer, plugin } from '../../api/api.js';
import {
    getPlaneDisplayData,
    tryTeleport,
    getAllPlanes,
    getPlaneConfigByName,
    formatCooldown
} from '../../logic/plane_logic.js';

export class Plane extends plugin {
    constructor() {
        super({
            name: 'Yunzai_Bot_Plane',
            dsc: '修仙模块-位面系统',
            event: 'message',
            priority: 600,
            rule: [
                { reg: '^#位面$', fnc: 'showPlanes' },
                { reg: '^#位面列表$', fnc: 'showPlanes' },
                { reg: '^#传送.+$', fnc: 'teleport' },
                { reg: '^#位面信息$', fnc: 'showCurrentPlane' }
            ]
        });
    }

    // 预检函数
    async preCheck(e) {
        if (!e.isGroup) {
            e.reply('修仙游戏请在群聊中游玩');
            return null;
        }
        const userId = await Gulid(e.user_id.toString().replace('qg_', ''));
        if (!await DAL.existPlayer(userId)) {
            return null;
        }
        return userId;
    }

    // 查看位面列表
    async showPlanes(e) {
        const userId = await this.preCheck(e);
        if (!userId) return;

        try {
            const displayData = await getPlaneDisplayData(userId);
            const img = await puppeteer.screenshot('plane', {
                ...displayData,
                pluResPath: `${process.cwd()}/plugins/xiuxian-emulator-plugin/resources`
            });
            await e.reply(img);
        } catch (err) {
            console.error('[位面系统] 渲染失败:', err);
            // 降级为文字版
            const displayData = await getPlaneDisplayData(userId);
            let msg = `【${displayData.playerName}的位面信息】\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `当前位面：${displayData.currentPlane?.icon} ${displayData.currentPlane?.name}\n`;
            msg += `传送冷却：${displayData.canTeleport ? '✅可传送' : formatCooldown(displayData.cooldownRemaining)}\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

            displayData.planes.forEach(plane => {
                const status = plane.isCurrent ? '📍' : (plane.isUnlocked ? '✅' : '🔒');
                msg += `${status} ${plane.icon} ${plane.name}`;
                if (plane.isUnlocked && plane.progress.currency > 0) {
                    msg += ` (${plane.currency}: ${plane.progress.currency})`;
                }
                msg += '\n';
            });

            msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `发送 #传送xxx 前往指定位面`;
            e.reply(msg);
        }
    }

    // 传送到指定位面
    async teleport(e) {
        const userId = await this.preCheck(e);
        if (!userId) return;

        const planeName = e.msg.replace('#传送', '').trim();
        if (!planeName) {
            e.reply('请指定要传送的位面名称，例如：#传送太虚幻境');
            return;
        }

        const result = await tryTeleport(userId, planeName);
        e.reply(result.message);
    }

    // 查看当前位面详情
    async showCurrentPlane(e) {
        const userId = await this.preCheck(e);
        if (!userId) return;

        const displayData = await getPlaneDisplayData(userId);
        const current = displayData.currentPlane;

        if (!current) {
            e.reply('无法获取当前位面信息。');
            return;
        }

        let msg = `【${current.icon} ${current.name}】\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `${current.desc}\n\n`;
        msg += `🎯 主题：${current.theme}\n`;
        msg += `💰 货币：${current.currency}\n`;

        if (current.attribute_bonus) {
            const bonuses = Object.entries(current.attribute_bonus)
                .map(([k, v]) => `${k}+${v}%`)
                .join('、');
            msg += `✨ 位面加成：${bonuses}\n`;
        }

        if (current.progress) {
            msg += `\n📊 当前进度：\n`;
            const stageName = current.stages?.find(s => s.id === current.progress.stage)?.name || '未进入';
            msg += `  阶段：${stageName}\n`;
            msg += `  货币：${current.progress.currency} ${current.currency}\n`;
        }

        if (current.stages && current.stages.length > 0) {
            msg += `\n🔮 进阶路线：\n`;
            current.stages.forEach(stage => {
                const isCurrent = stage.id === current.progress?.stage;
                msg += `  ${isCurrent ? '➤' : '○'} ${stage.name}\n`;
            });
        }

        e.reply(msg);
    }
}
