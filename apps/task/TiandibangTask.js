
import plugin from '../../../../lib/plugins/plugin.js';
import * as tiandibangLogic from '../../logic/tiandibang_logic.js';

export class TiandibangTask extends plugin {
    constructor() {
        super({
            name: 'TiandibangTask',
            dsc: '天地榜定时结算任务',
            event: 'message',
            priority: 1000,
            rule: [
                { reg: '^#手动结算天地榜$', fnc: 'manualSettlement', permission: 'master' }
            ]
        });

        this.task = {
            cron: '59 59 23 * * 0', // 每周日 23:59:59
            name: '天地榜每周结算',
            fnc: () => this.settlement()
        };
    }

    /**
     * 定时结算逻辑
     */
    async settlement() {
        logger.mark('[天地榜] 开始执行每周结算...');
        try {
            const result = await tiandibangLogic.startNewSeason();
            logger.mark(`[天地榜] 结算完成！已开启第 ${result.newSeason} 赛季。旧数据已归档。`);

            // 这里可以添加自动推送到群的逻辑，如果有需要的话
        } catch (error) {
            logger.error(`[天地榜] 结算失败: ${error.message}`);
        }
    }

    /**
     * 只有管理员可调用的手动结算
     */
    async manualSettlement(e) {
        const confirmKey = 'xiuxian:admin:confirm_settlement';
        const isConfirmed = await redis.get(confirmKey);

        if (!isConfirmed) {
            await redis.set(confirmKey, '1', { EX: 30 }); // 30秒过期
            return e.reply('⚠️ 警告：这将强制结束当前赛季并清除排行榜！\n此操作不可逆！\n请在30秒内再次发送【#手动结算天地榜】以确认执行。');
        }

        // 清除确认状态，防止连击
        await redis.del(confirmKey);

        e.reply('正在执行天地榜结算...');

        try {
            const result = await tiandibangLogic.startNewSeason();
            e.reply(`✅ 结算成功！\n旧赛季数据已保存。\n当前已进入第 ${result.newSeason} 赛季。\n请通知群友发送【#报名天地榜】重新参与。`);
        } catch (err) {
            e.reply(`❌ 结算失败: ${err.message}`);
            logger.error('[天地榜] 手动结算异常:', err);
        }
    }
}
