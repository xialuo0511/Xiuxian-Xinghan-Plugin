/**
 * 备份调度器
 * 负责定时执行备份任务
 */

import * as BackupLogic from './backup_logic.js';
import chalk from 'chalk';

let schedulerTimer = null;

/**
 * 解析 Cron 表达式并计算下次执行时间
 * 简化版本：仅支持 "分 时 * * *" 格式
 * @param {string} cron 
 * @returns {Date|null}
 */
function GetNextExecutionTime(cron) {
    try {
        const parts = cron.split(' ');
        if (parts.length < 5) return null;

        const minute = parseInt(parts[0], 10);
        const hour = parseInt(parts[1], 10);

        if (isNaN(minute) || isNaN(hour)) return null;

        const now = new Date();
        const next = new Date();
        next.setHours(hour, minute, 0, 0);

        // 如果今天的时间已过，则设置为明天
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }

        return next;
    } catch (error) {
        console.error('[备份调度] 解析 Cron 表达式失败:', error.message);
        return null;
    }
}

/**
 * 执行备份任务
 */
async function ExecuteBackupTask() {
    try {
        logger.info(chalk.blue('[备份调度] 开始执行定时备份...'));
        const result = await BackupLogic.CreateBackup();

        if (result.success) {
            logger.info(chalk.green(`[备份调度] ${result.message}`));
        } else {
            logger.warn(chalk.yellow(`[备份调度] ${result.message}`));
        }
    } catch (error) {
        logger.error(chalk.red('[备份调度] 备份执行失败:'), error);
    }

    // 重新调度下一次备份
    ScheduleNextBackup();
}

/**
 * 调度下一次备份
 */
function ScheduleNextBackup() {
    const config = BackupLogic.GetBackupConfig();

    if (!config.schedule?.enabled) {
        logger.info('[备份调度] 定时备份已禁用');
        return;
    }

    const cron = config.schedule?.cron || '0 4 * * *';
    const nextTime = GetNextExecutionTime(cron);

    if (!nextTime) {
        logger.warn('[备份调度] 无法解析备份时间配置');
        return;
    }

    const delay = nextTime.getTime() - Date.now();

    if (schedulerTimer) {
        clearTimeout(schedulerTimer);
    }

    schedulerTimer = setTimeout(ExecuteBackupTask, delay);

    const timeStr = nextTime.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    logger.info(chalk.cyan(`[备份调度] 下次备份时间: ${timeStr}`));
}

/**
 * 初始化备份调度
 */
export function scheduleBackup() {
    try {
        const config = BackupLogic.GetBackupConfig();

        if (!config.schedule?.enabled) {
            logger.info('[备份调度] 定时备份未启用');
            return;
        }

        logger.info(chalk.green('[备份调度] 定时备份系统初始化...'));
        ScheduleNextBackup();
    } catch (error) {
        logger.error('[备份调度] 初始化失败:', error);
    }
}

/**
 * 停止备份调度
 */
export function stopBackupScheduler() {
    if (schedulerTimer) {
        clearTimeout(schedulerTimer);
        schedulerTimer = null;
        logger.info('[备份调度] 已停止');
    }
}
