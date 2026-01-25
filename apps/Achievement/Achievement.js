/**
 * 成就系统指令模块
 * @module apps/Achievement/Achievement
 */

import * as DAL from '../../api/data-access.js';
import { Gulid, puppeteer, plugin } from '../../api/api.js';
import {
    getAchievementCodexData,
    claimReward,
    claimAllRewards,
    getAchievementConfig
} from '../../logic/achievement_logic.js';

export class Achievement extends plugin {
    constructor() {
        super({
            name: 'Yunzai_Bot_Achievement',
            dsc: '修仙模块-成就系统',
            event: 'message',
            priority: 600,
            rule: [
                { reg: '^#成就$', fnc: 'showAchievements' },
                { reg: '^#成就图鉴$', fnc: 'showAchievements' },
                { reg: '^#领取成就.*$', fnc: 'claimAchievement' },
                { reg: '^#一键领取成就$', fnc: 'claimAllAchievements' }
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

    // 查看成就图鉴
    async showAchievements(e) {
        const userId = await this.preCheck(e);
        if (!userId) return;

        try {
            const codexData = await getAchievementCodexData(userId);
            const img = await puppeteer.screenshot('achievement_codex', {
                ...codexData,
                pluResPath: `${process.cwd()}/plugins/xiuxian-emulator-plugin/resources`
            });
            await e.reply(img);
        } catch (err) {
            console.error('[成就系统] 渲染图鉴失败:', err);
            // 降级为文字版
            const codexData = await getAchievementCodexData(userId);
            let msg = `【${codexData.playerName}的成就图鉴】\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `总进度：${codexData.stats.unlocked}/${codexData.stats.total} (${codexData.stats.progressPercent}%)\n`;
            msg += `可领取奖励：${codexData.stats.canClaim}个\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

            codexData.categories.forEach(cat => {
                if (cat.achievements.length === 0) return;
                const unlocked = cat.achievements.filter(a => a.isUnlocked).length;
                msg += `${cat.icon} ${cat.name} (${unlocked}/${cat.achievements.length})\n`;
            });

            msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            msg += `发送 #一键领取成就 领取所有奖励`;
            e.reply(msg);
        }
    }

    // 领取单个成就奖励
    async claimAchievement(e) {
        const userId = await this.preCheck(e);
        if (!userId) return;

        const achievementName = e.msg.replace('#领取成就', '').trim();
        if (!achievementName) {
            e.reply('请指定要领取的成就名称，例如：#领取成就初露锋芒');
            return;
        }

        // 通过名称查找成就ID
        const { loadItemConfig } = await import('../../model/ConfigLoader.js');
        const achievements = loadItemConfig('achievements.yaml');
        const achievement = achievements.find(a => a.name === achievementName);

        if (!achievement) {
            e.reply(`未找到名为【${achievementName}】的成就。`);
            return;
        }

        const result = await claimReward(userId, achievement.id);
        if (result.success) {
            let rewardMsg = result.message + '\n获得：';
            if (result.rewards.灵石) rewardMsg += `灵石×${result.rewards.灵石} `;
            if (result.rewards.秘境之匙) rewardMsg += `秘境之匙×${result.rewards.秘境之匙}`;
            e.reply(rewardMsg);
        } else {
            e.reply(result.message);
        }
    }

    // 一键领取所有成就奖励
    async claimAllAchievements(e) {
        const userId = await this.preCheck(e);
        if (!userId) return;

        const result = await claimAllRewards(userId);
        if (result.success) {
            let msg = result.message + '\n';
            msg += `共获得：灵石×${result.totalRewards.灵石}`;
            if (result.totalRewards.秘境之匙 > 0) {
                msg += `，秘境之匙×${result.totalRewards.秘境之匙}`;
            }
            e.reply(msg);
        } else {
            e.reply(result.message);
        }
    }
}
