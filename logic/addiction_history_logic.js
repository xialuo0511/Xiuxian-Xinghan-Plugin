/**
 * 沉迷收获记录业务逻辑
 * @module logic/addiction_history_logic
 */

import * as DAL from '../api/data-access.js';

/**
 * 获取格式化的沉迷收获数据（用于渲染）
 * @param {string} userId 玩家ID
 * @returns {Promise<object|null>} 格式化的数据，或null表示无记录
 */
export async function getFormattedAddictionHistory(userId) {
    const record = await DAL.getAddictionHistory(userId);
    if (!record) {
        return null;
    }

    // 计算持续时长
    const endTime = record.endTime || Date.now();
    const durationMs = endTime - record.startTime;
    const durationMinutes = Math.floor(durationMs / 60000);
    const durationHours = Math.floor(durationMinutes / 60);
    const remainingMinutes = durationMinutes % 60;

    let durationText;
    if (durationHours > 0) {
        durationText = `${durationHours}小时${remainingMinutes}分钟`;
    } else {
        durationText = `${durationMinutes}分钟`;
    }

    // 格式化时间
    const formatTime = (timestamp) => {
        if (!timestamp) return '进行中';
        const date = new Date(timestamp);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return {
        location: record.location,
        locationType: record.locationType,
        totalRuns: record.totalRuns,
        completedRuns: record.completedRuns,
        failedRuns: record.failedRuns,
        xiuweiGained: record.xiuweiGained,
        xueqiGained: record.xueqiGained,
        itemsGained: record.itemsGained,
        status: record.status,
        statusText: record.status === 'completed' ? '已完成' : '进行中',
        startTime: formatTime(record.startTime),
        endTime: formatTime(record.endTime),
        duration: durationText
    };
}

/**
 * 清除沉迷记录（仅限已完成状态）
 * @param {string} userId 玩家ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function clearAddictionHistoryIfCompleted(userId) {
    const record = await DAL.getAddictionHistory(userId);

    if (!record) {
        return { success: false, message: '暂无沉迷记录可清除。' };
    }

    if (record.status === 'in_progress') {
        return { success: false, message: '沉迷正在进行中，无法清除。请先等待探索完成。' };
    }

    const cleared = await DAL.clearAddictionHistory(userId);
    if (cleared) {
        return { success: true, message: '沉迷记录已清除。' };
    } else {
        return { success: false, message: '清除失败，请稍后重试。' };
    }
}
