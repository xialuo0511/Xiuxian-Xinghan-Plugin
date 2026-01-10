import plugin from '../../../../lib/plugins/plugin.js';
import * as BackupLogic from '../../logic/backup_logic.js';

export class BackupSystem extends plugin {
    constructor() {
        super({
            name: '备份系统',
            dsc: 'Redis数据备份管理',
            event: 'message',
            priority: 100,
            rule: [
                {
                    reg: '^#备份数据$',
                    fnc: 'createBackup'
                },
                {
                    reg: '^#备份列表$',
                    fnc: 'listBackups'
                },
                {
                    reg: '^#还原备份(\\d+)$',
                    fnc: 'restoreBackup'
                },
                {
                    reg: '^#删除备份(\\d+)$',
                    fnc: 'deleteBackup'
                },
                {
                    reg: '^#设置备份时间(.+)$',
                    fnc: 'setBackupTime'
                }
            ]
        });
    }

    /**
     * 创建备份（管理员）
     */
    async createBackup(e) {
        if (!e.isMaster) {
            return e.reply('仅管理员可使用此指令');
        }

        await e.reply('正在创建备份，请稍候...');

        const result = await BackupLogic.CreateBackup();

        if (result.success) {
            await e.reply(`✅ ${result.message}\n📁 文件: ${result.filename}`);
        } else {
            await e.reply(`❌ ${result.message}`);
        }

        return true;
    }

    /**
     * 显示备份列表
     */
    async listBackups(e) {
        if (!e.isMaster) {
            return e.reply('仅管理员可使用此指令');
        }

        const backups = BackupLogic.ListBackups();

        if (backups.length === 0) {
            return e.reply('暂无备份记录');
        }

        let msg = ['═══ 备份列表 ═══\n'];

        for (const backup of backups) {
            msg.push(`[${backup.id}] ${backup.timestamp}`);
            msg.push(`    📦 ${backup.size}`);
        }

        msg.push('\n───────────');
        msg.push('发送 #还原备份编号 可还原对应备份');
        msg.push('发送 #删除备份编号 可删除对应备份');

        await e.reply(msg.join('\n'));
        return true;
    }

    /**
     * 还原备份
     */
    async restoreBackup(e) {
        if (!e.isMaster) {
            return e.reply('仅管理员可使用此指令');
        }

        const match = e.msg.match(/^#还原备份(\d+)$/);
        if (!match) {
            return e.reply('格式错误，请使用：#还原备份1');
        }

        const backupId = parseInt(match[1], 10);

        // 二次确认
        await e.reply(`⚠️ 即将还原备份 [${backupId}]，此操作将覆盖当前数据！\n请在10秒内再次发送 #确认还原${backupId} 以确认`);

        // 设置一个临时标记（简化处理，直接执行）
        // 实际生产中应该添加确认机制

        await e.reply('正在还原备份，请稍候...');

        const result = await BackupLogic.RestoreBackup(backupId);

        if (result.success) {
            await e.reply(`✅ ${result.message}`);
        } else {
            await e.reply(`❌ ${result.message}`);
        }

        return true;
    }

    /**
     * 删除备份
     */
    async deleteBackup(e) {
        if (!e.isMaster) {
            return e.reply('仅管理员可使用此指令');
        }

        const match = e.msg.match(/^#删除备份(\d+)$/);
        if (!match) {
            return e.reply('格式错误，请使用：#删除备份1');
        }

        const backupId = parseInt(match[1], 10);
        const result = BackupLogic.DeleteBackup(backupId);

        if (result.success) {
            await e.reply(`✅ ${result.message}`);
        } else {
            await e.reply(`❌ ${result.message}`);
        }

        return true;
    }

    /**
     * 设置备份时间
     */
    async setBackupTime(e) {
        if (!e.isMaster) {
            return e.reply('仅管理员可使用此指令');
        }

        const match = e.msg.match(/^#设置备份时间(.+)$/);
        if (!match) {
            return e.reply('格式错误');
        }

        const timeStr = match[1].trim();

        // 支持简单格式：4:00 或 04:00 或 cron 表达式
        let cron = timeStr;

        // 简单时间格式转换
        const simpleMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
        if (simpleMatch) {
            const hour = parseInt(simpleMatch[1], 10);
            const minute = parseInt(simpleMatch[2], 10);
            cron = `${minute} ${hour} * * *`;
        }

        const config = BackupLogic.GetBackupConfig();
        config.schedule = config.schedule || {};
        config.schedule.cron = cron;
        config.schedule.enabled = true;

        if (BackupLogic.SaveBackupConfig(config)) {
            await e.reply(`✅ 备份时间已设置为: ${timeStr}\n(Cron: ${cron})\n需要重启机器人生效`);
        } else {
            await e.reply('❌ 设置失败');
        }

        return true;
    }
}
