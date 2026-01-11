import * as DAL from '../api/data-access.js';
import { Add_najie_thing } from '../apps/Xiuxian/xiuxian.js';

/**
 * 每日任务配置
 */
const DAILY_TASKS = {
    'sign_in': { name: '签到一次', points: 10, target: 1, limit: 1 },
    'explore': { name: '探索秘境/沉迷', points: 20, target: 10, limit: 1 }, // 每次结算算一次，累计10次给分？或者每次给2分？文档说“探索10次秘境... +20”，意味着是一个累积任务
    // 修正文档理解：探索10次秘境/沉迷1次 => +20。 意味着 探索满10次 给20分，或者 沉迷结算1次 给20分。
    // 为了简化逻辑，我们设定一个任务 code 'explore_count'，每次探索+1，沉迷一次+10（假设沉迷等同于多次或一次大额）。
    // 但文档表格写的是： | 探索10次秘境/沉迷1次 | +20 | 结算才加 |
    // 我们可以拆分成两个触发条件，共享一个任务状态。
    'duel': { name: '以武会友', points: 15, target: 1, limit: 1 },
    'sell': { name: '出售获得20w灵石', points: 20, target: 1, limit: 5 }, // "每20w一次"，这里limit设为5次（因为总分上限150，大致推算）
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

    // 检查是否已达上限
    if (taskState.completed_times >= config.limit) return;

    // 特殊处理 'sell' (出售灵石)，它是累积型的，每20w算一次
    if (taskType === 'sell') {
        taskState.count += value;
        const target = 200000;
        // 计算新增完成次数
        const newCompletions = Math.floor(taskState.count / target) - taskState.completed_times;
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
    // 这里我们假设 value 传进来的是次数。
    // 如果是沉迷，可以直接传 value=10 来触发一次完成 (如果沉迷算10次探索的话，文档写的是“探索10次/沉迷1次”，可能意味着沉迷一次直接达标)
    else if (taskType === 'explore') {
        taskState.count += value;
        // 每达到target算一次完成
        const newCompletions = Math.floor(taskState.count / config.target) - taskState.completed_times;
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

    // 道法仙术持有者：双倍奖励？ 文档说“道法仙术持有者：双倍奖励”。这里是指积分获取双倍还是奖励双倍？
    // 通常是指最终获得的物品翻倍，或者积分翻倍。
    // “规则说明：每日上限150积分... 道法仙术持有者：双倍奖励”。看起来像是奖励物品翻倍。
    // 我们先按奖励数量翻倍处理。
    const isSpecial = false; // 暂时无法判定是否持有道法仙术，预留接口。如果全都是双倍，数值会崩。
    // 假设“道法仙术”是某种特殊道具或状态，这里先不实现判断，或者默认为false。
    // 待确认：道法仙术是什么？可能是 VIP？

    for (const rewardConfig of REWARDS) {
        if (stats.points >= rewardConfig.points && !stats.rewards_claimed.includes(rewardConfig.points)) {
            // 发放奖励
            let msg = `\n【每日任务】今日积分达到 ${stats.points}，获得：`;
            for (const item of rewardConfig.rewards) {
                let count = item.count;
                // if (isSpecial) count *= 2; 
                if (item.name === '灵石') {
                    // 使用事务安全增加灵石
                    await DAL.transaction_update(userId, (player) => {
                        player.灵石 = (Number(player.灵石) || 0) + count;
                        return true;
                    });
                    msg += `${count}灵石 `;
                } else {
                    await Add_najie_thing(userId, item.name, item.name === '血气瓶' || item.name === '七星玄元丹' ? '丹药' : '道具', count);
                    msg += `${item.name}×${count} `;
                }
            }

            // 标记已领取
            stats.rewards_claimed.push(rewardConfig.points);

            // 发送通知 (尝试使用 sendMsg，如果是在群里触发的最好，但这里可能是后台触发)
            // 我们可以尝试缓存一条消息，或者直接通过redis推送到 UserTask 通知器（如果有的话）
            // 简单起见，且由于 updateTaskProgress 通常在用户交互中调用，我们可以不返回消息，而是依赖调用者提示，
            // 或者在这里直接调用 Bot 发送及私聊 (有点侵入性)。
            // 更好的方式：返回给调用者 triggeredRewards 列表。

            // 但为了“自动发放，无需领取”，我们需要通知用户。
            try {
                // 尝试通知用户
                let notifyMsg = msg;
                Bot.pickUser(userId).sendMsg(notifyMsg).catch(() => { });
            } catch (e) {
                // ignore
            }
        }
    }
}

/**
 * 获取用于展示的文本详情
 */
export async function getTaskStatusText(userId) {
    const stats = await getDailyStats(userId);
    let msg = `📅 [每日任务] ${getTodayDate()}\n`;
    msg += `当前积分：${stats.points} / 150\n`;
    msg += `------------------------------\n`;

    // 任务列表
    for (const key in DAILY_TASKS) {
        const conf = DAILY_TASKS[key];
        const state = stats.tasks[key] || { count: 0, completed_times: 0 };
        const isDone = state.completed_times >= conf.limit;

        let progress = '';
        if (key === 'sell') {
            progress = `${state.count}/20w`; // 简化显示
        } else if (key === 'explore') {
            progress = `${state.count}/${conf.target}`;
        } else {
            progress = `${state.count}/${conf.target}`;
        }

        msg += `${isDone ? '✅' : '⬜'} ${conf.name} (${state.completed_times}/${conf.limit})\n`;
        // msg += `   进度: ${progress}  奖励: ${conf.points}积分\n`;
    }

    msg += `------------------------------\n`;
    msg += `🎁 积分奖励：\n`;
    for (const rw of REWARDS) {
        const claimed = stats.rewards_claimed.includes(rw.points);
        const canClaim = stats.points >= rw.points && !claimed;
        let statusIcon = claimed ? '已发放' : (canClaim ? '待发放' : `${rw.points}分`);
        if (canClaim) statusIcon = '发放中...'; // 实际上是自动发放的

        msg += `${claimed ? '✅' : '🔒'} ${statusIcon}: ${rw.rewards.map(r => r.name + 'x' + r.count).join(',')}\n`;
    }

    return msg;
}
