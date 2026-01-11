import * as DAL from '../api/data-access.js';

/**
 * 每日任务配置
 */
const DAILY_TASKS = {
    'sign_in': { name: '每日签到', points: 10, target: 1, limit: 1, desc: '每日签到领取奖励', icon: 'http://q1.qlogo.cn/g?b=qq&nk=10000&s=100' }, // 使用通用图标或后续替换
    'explore': { name: '探索秘境', points: 20, target: 10, limit: 999, desc: '探索秘境或沉迷', icon: 'https://syc-1255529515.cos.ap-shanghai.myqcloud.com/xiuxian/img/task_explore.png' },
    'duel': { name: '切磋比试', points: 15, target: 1, limit: 999, desc: '与其他玩家切磋', icon: 'https://syc-1255529515.cos.ap-shanghai.myqcloud.com/xiuxian/img/task_duel.png' },
    'sell': { name: '经商致富', points: 20, target: 1, limit: 999, desc: '出售获得20w灵石', icon: 'https://syc-1255529515.cos.ap-shanghai.myqcloud.com/xiuxian/img/task_trade.png' },
};

/**
 * 积分奖励配置
 */
const REWARDS = [
    { points: 25, rewards: [{ name: '灵石', count: 20000 }] },
    { points: 60, rewards: [{ name: '灵石', count: 100000 }] },
    { points: 95, rewards: [{ name: '血气瓶', count: 20 }] },
    { points: 150, rewards: [{ name: '七星玄元丹', count: 1 }] }
];

const REDIS_KEY_PREFIX = 'xiuxian:daily_task:';

/**
 * 获取今日日期字符串 YYYY-MM-DD
 */
function getTodayDate() {
    const date = new Date();
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * 初始化或获取玩家今日任务状态
 * @param {string} userId
 */
export async function getDailyStats(userId) {
    const today = getTodayDate();
    const key = `${REDIS_KEY_PREFIX}${today}:${userId}`;

    let stats = await redis.get(key);
    if (!stats) {
        stats = {
            points: 0,
            tasks: {},
            rewards_claimed: []
        };
        // 初始化任务状态
        for (const taskKey in DAILY_TASKS) {
            stats.tasks[taskKey] = { count: 0, completed_times: 0 };
        }
        await redis.set(key, JSON.stringify(stats), { EX: 86400 * 2 }); // 存2天避免跨天边界问题
    } else {
        stats = JSON.parse(stats);
    }
    return stats;
}

/**
 * 保存玩家任务状态
 */
async function saveDailyStats(userId, stats) {
    const today = getTodayDate();
    const key = `${REDIS_KEY_PREFIX}${today}:${userId}`;
    await redis.set(key, JSON.stringify(stats), { EX: 86400 * 2 });
}

/**
 * 更新任务进度
 * @param {string} userId 
 * @param {string} taskType 'sign_in', 'explore', 'duel', 'sell'
 * @param {number} value 增加的进度值 (默认1)
 */
export async function updateTaskProgress(userId, taskType, value = 1) {
    const config = DAILY_TASKS[taskType];
    if (!config) return;

    const stats = await getDailyStats(userId);
    const taskState = stats.tasks[taskType] || { count: 0, completed_times: 0 };

    // 检查是否已达上限 (999视为无限)
    if (taskState.completed_times >= config.limit) return;

    // 特殊处理 'sell' (出售灵石)，它是累积型的，每20w算一次
    if (taskType === 'sell') {
        taskState.count += value;
        const target = 200000;
        // 计算新增完成次数
        const totalCompleted = Math.floor(taskState.count / target);
        const newCompletions = totalCompleted - taskState.completed_times;

        if (newCompletions > 0) {
            const addTimes = Math.min(newCompletions, config.limit - taskState.completed_times);
            if (addTimes > 0) {
                taskState.completed_times += addTimes;
                stats.points += config.points * addTimes;
                await checkAndDistributeRewards(userId, stats);
            }
        }
    }
    // 特殊处理 'explore' (探索10次 或 沉迷1次)
    else if (taskType === 'explore') {
        taskState.count += value;
        // 每达到target算一次完成
        const totalCompleted = Math.floor(taskState.count / config.target);
        const newCompletions = totalCompleted - taskState.completed_times;

        if (newCompletions > 0) {
            const addTimes = Math.min(newCompletions, config.limit - taskState.completed_times);
            if (addTimes > 0) {
                taskState.completed_times += addTimes;
                stats.points += config.points * addTimes;
                await checkAndDistributeRewards(userId, stats);
            }
        }
    }
    // 普通计数任务 (一次性完成，如签到、比试)
    else {
        taskState.count += value;
        if (taskState.count >= config.target && taskState.completed_times < config.limit) {
            taskState.completed_times++;
            stats.points += config.points;
            await checkAndDistributeRewards(userId, stats);
        }
    }

    stats.tasks[taskType] = taskState;
    await saveDailyStats(userId, stats);
}

/**
 * 检查并发放积分奖励
 */
async function checkAndDistributeRewards(userId, stats) {
    const playerData = await DAL.getAllPlayerData(userId);
    const player = playerData.player;

    for (const rewardConfig of REWARDS) {
        if (stats.points >= rewardConfig.points && !stats.rewards_claimed.includes(rewardConfig.points)) {
            // 发放奖励
            let msg = `\n【每日任务】今日积分达到 ${stats.points}，获得：`;
            for (const item of rewardConfig.rewards) {
                let count = item.count;
                if (item.name === '灵石') {
                    // 使用事务安全增加灵石
                    await DAL.transaction_update(userId, (player) => {
                        player.灵石 = (Number(player.灵石) || 0) + count;
                        return true;
                    });
                    msg += `${count}灵石 `;
                } else {
                    // 使用DAL添加丹药/道具到纳戒
                    const itemClass = (item.name === '血气瓶' || item.name === '七星玄元丹') ? '丹药' : '道具';
                    await DAL.updateNajieItem(userId, item.name, itemClass, count);
                    msg += `${item.name}×${count} `;
                }
            }

            // 标记已领取
            stats.rewards_claimed.push(rewardConfig.points);

            // 注意：不发送私聊通知，避免封号风险
            // 奖励会在下次查看每日任务时自动显示
        }
    }
}

/**
 * 获取任务渲染数据
 */
export async function getTaskRenderData(userId) {
    const stats = await getDailyStats(userId);
    const date = new Date();

    // 任务列表视图数据
    const taskList = Object.keys(DAILY_TASKS).map(key => {
        const conf = DAILY_TASKS[key];
        const state = stats.tasks[key] || { count: 0, completed_times: 0 };

        let progressStr = '';
        let percentage = 0;

        if (key === 'sell') {
            const currentRound = state.count % 200000;
            progressStr = `${(currentRound / 10000).toFixed(1)}W/20W`;
            percentage = Math.min(100, (currentRound / 200000) * 100);
            if (state.completed_times > 0 && currentRound === 0) percentage = 100; // 刚完成一轮
        } else if (key === 'explore') {
            const currentRound = state.count % 10;
            progressStr = `${currentRound}/${conf.target}`;
            percentage = Math.min(100, (currentRound / conf.target) * 100);
            if (state.completed_times > 0 && currentRound === 0) percentage = 100;
        } else {
            progressStr = `${state.count}/${conf.target}`;
            percentage = Math.min(100, (state.count / conf.target) * 100);
        }

        if (key === 'sign_in') {
            // 动态设置头像
            conf.icon = `http://q1.qlogo.cn/g?b=qq&nk=${userId}&s=100`;
        }

        return {
            key: key,
            name: conf.name,
            desc: conf.desc,
            icon: conf.icon || '', // 可以在前端设置默认图标
            points_per_time: conf.points,
            completed_times: state.completed_times,
            limit: conf.limit,
            progress_text: progressStr,
            progress_percent: percentage,
            is_unlimited: conf.limit > 100 // 标记是否为无限任务
        };
    });

    // 奖励进度条数据
    const maxPoints = 150;
    const rewards = REWARDS.map(r => ({
        points: r.points,
        // 计算在进度条上的位置，最大95%防止溢出
        position: Math.min(95, (r.points / maxPoints) * 100),
        is_claimed: stats.rewards_claimed.includes(r.points),
        can_claim: stats.points >= r.points && !stats.rewards_claimed.includes(r.points),
        is_reached: stats.points >= r.points,
        items: r.rewards
    }));

    return {
        date_str: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
        week_day: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()],
        total_points: stats.points,
        max_points: maxPoints,
        points_percent: Math.min(100, (stats.points / maxPoints) * 100),
        tasks: taskList,
        rewards: rewards
    };
}

/**
 * 文本模式 (保留作为备用或调试)
 */
export async function getTaskStatusText(userId) {
    const data = await getTaskRenderData(userId);
    let msg = `📅 [每日任务] ${data.date_str}\n`;
    msg += `当前积分：${data.total_points} / ${data.max_points}\n`;
    msg += `------------------------------\n`;

    for (const task of data.tasks) {
        msg += `${task.completed_times > 0 ? '✅' : '⬜'} ${task.name} (${task.completed_times})\n`;
    }

    return msg;
}
