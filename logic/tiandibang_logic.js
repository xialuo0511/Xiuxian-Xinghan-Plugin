/**
 * 天地榜核心业务逻辑 (tiandibang_logic.js)
 * 天地榜2.0 - 报名、段位、连胜、赛季积分管理
 */

import * as DAL from '../api/data-access.js';

// ===== 段位系统定义 =====
export const DUANWEI_LIST = [
    { name: '凡俗', minJifen: 0, maxJifen: 4999, dailyFights: 3, color: '#888888' },
    { name: '练气', minJifen: 5000, maxJifen: 14999, dailyFights: 4, color: '#52c41a' },
    { name: '筑基', minJifen: 15000, maxJifen: 29999, dailyFights: 5, color: '#1890ff' },
    { name: '金丹', minJifen: 30000, maxJifen: 49999, dailyFights: 6, color: '#faad14' },
    { name: '元婴', minJifen: 50000, maxJifen: 79999, dailyFights: 7, color: '#eb2f96' },
    { name: '化神', minJifen: 80000, maxJifen: Infinity, dailyFights: 8, color: '#722ed1' }
];

// ===== 连胜奖励定义 =====
export const LIANSHENG_REWARDS = [
    { streak: 3, jifenMultiplier: 1.2, lingshiMultiplier: 1.0, reward: null },
    { streak: 5, jifenMultiplier: 1.5, lingshiMultiplier: 1.5, reward: null },
    { streak: 7, jifenMultiplier: 2.0, lingshiMultiplier: 1.5, reward: '连胜宝匣' },
    { streak: 10, jifenMultiplier: 2.5, lingshiMultiplier: 2.0, reward: '称号：天榜连胜王', broadcast: true }
];

// ===== 赛季奖励定义 =====
export const SEASON_REWARDS = [
    { rank: 1, tiandiLing: 50, title: '天榜至尊', extra: '限定功法心得' },
    { rank: 3, tiandiLing: 30, title: '榜上有名' },
    { rank: 10, tiandiLing: 20 },
    { rank: 50, tiandiLing: 10 }
];

// ===== Redis Key 前缀 =====
const REDIS_PREFIX = 'xiuxian:tiandibang';
const LEADERBOARD_KEY = `${REDIS_PREFIX}:leaderboard`;
const SEASON_KEY = `${REDIS_PREFIX}:season`;

/**
 * 获取当前赛季号
 */
export async function getCurrentSeason() {
    const season = await redis.get(SEASON_KEY);
    return season ? parseInt(season) : 1;
}

/**
 * 检查今天是否为结算日（周日）
 */
export function isSettlementDay() {
    const today = new Date();
    return today.getDay() === 0; // 0 = 周日
}

/**
 * 获取本赛季结束时间（本周日23:59:59）
 */
export function getSeasonEndTime() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

    const endDate = new Date(now);
    endDate.setDate(now.getDate() + daysUntilSunday);
    endDate.setHours(23, 59, 59, 0);

    return endDate;
}

/**
 * 格式化赛季结束倒计时
 */
export function formatSeasonEndTime() {
    const now = new Date();
    const endTime = getSeasonEndTime();
    const diffMs = endTime.getTime() - now.getTime();

    if (diffMs <= 0) return '结算中';

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}天${hours}小时`;
    return `${hours}小时`;
}

/**
 * 获取玩家天地榜数据
 */
export async function getPlayerTiandibang(userId) {
    const data = await DAL.getAllPlayerData(userId);
    const player = data?.player;
    if (!player) return null;

    // 初始化默认数据
    if (!player.tiandibang) {
        player.tiandibang = {
            jifen: 0,
            daily_fights: 0,
            last_fight_date: null,
            win_streak: 0,
            season_id: 0,  // 0表示未报名
            glory_points: 0,
            tiandi_tokens: 0,
            total_fights: 0
        };
    }

    return player.tiandibang;
}

/**
 * 报名参加天地榜
 */
export async function registerTiandibang(userId) {
    const data = await DAL.getAllPlayerData(userId);
    const player = data?.player;
    if (!player) return { success: false, message: '未找到玩家存档' };

    const currentSeason = await getCurrentSeason();

    if (!player.tiandibang) {
        player.tiandibang = {};
    }

    // 检查是否已报名当前赛季
    if (player.tiandibang.season_id === currentSeason) {
        return { success: false, message: '你已经报名了本赛季天地榜！' };
    }

    // 新赛季重置数据
    player.tiandibang = {
        jifen: 0,
        daily_fights: getDuanwei(0).dailyFights,
        last_fight_date: null,
        win_streak: 0,
        season_id: currentSeason,
        glory_points: player.tiandibang?.glory_points || 0,  // 保留荣耀点
        tiandi_tokens: player.tiandibang?.tiandi_tokens || 0, // 保留天地令
        total_fights: player.tiandibang?.total_fights || 0
    };

    await DAL.savePlayer(userId, player);

    // 添加到排行榜
    await redis.zAdd(LEADERBOARD_KEY, { score: 0, value: String(userId) });

    return {
        success: true,
        message: `报名成功！你已加入第${currentSeason}赛季天地榜挑战，今日可比试${player.tiandibang.daily_fights}次`
    };
}

/**
 * 检查玩家是否已报名本赛季
 */
export async function isRegistered(userId) {
    const currentSeason = await getCurrentSeason();
    const tiandibang = await getPlayerTiandibang(userId);
    return tiandibang && tiandibang.season_id === currentSeason;
}

/**
 * 获取段位信息
 */
export function getDuanwei(jifen) {
    for (const dw of DUANWEI_LIST) {
        if (jifen >= dw.minJifen && jifen <= dw.maxJifen) {
            return dw;
        }
    }
    return DUANWEI_LIST[0];
}

/**
 * 获取连胜奖励
 */
export function getLianshengReward(streak) {
    let best = null;
    for (const r of LIANSHENG_REWARDS) {
        if (streak >= r.streak) {
            best = r;
        }
    }
    return best;
}

/**
 * 刷新每日次数（如果是新的一天）
 */
export async function refreshDailyFights(userId) {
    const data = await DAL.getAllPlayerData(userId);
    const player = data?.player;
    if (!player?.tiandibang) return false;

    const today = new Date().toDateString();
    const lastFight = player.tiandibang.last_fight_date;

    if (lastFight !== today) {
        const duanwei = getDuanwei(player.tiandibang.jifen);
        player.tiandibang.daily_fights = duanwei.dailyFights;
        player.tiandibang.last_fight_date = today;
        await DAL.savePlayer(userId, player);
        return true;
    }
    return false;
}

/**
 * 消耗每日次数
 */
export async function consumeDailyFight(userId) {
    const data = await DAL.getAllPlayerData(userId);
    const player = data?.player;
    if (!player?.tiandibang) return { success: false, message: '请先报名天地榜' };

    // 先刷新每日次数
    await refreshDailyFights(userId);

    // 重新获取最新数据
    const updatedData = await DAL.getAllPlayerData(userId);
    const updatedPlayer = updatedData.player;

    if (updatedPlayer.tiandibang.daily_fights <= 0) {
        return { success: false, message: '今日比试次数已用完，请明日再来' };
    }

    updatedPlayer.tiandibang.daily_fights -= 1;
    updatedPlayer.tiandibang.total_fights += 1;
    await DAL.savePlayer(userId, updatedPlayer);

    return { success: true, remainingFights: updatedPlayer.tiandibang.daily_fights };
}

/**
 * 更新战斗结果
 */
export async function updateBattleResult(userId, isWin, baseJifen, baseLingshi) {
    const data = await DAL.getAllPlayerData(userId);
    const player = data?.player;
    if (!player?.tiandibang) return null;

    let jifen = baseJifen;
    let lingshi = baseLingshi;
    let messages = [];

    if (isWin) {
        // 连胜+1
        player.tiandibang.win_streak += 1;

        // 检查连胜奖励
        const liansheng = getLianshengReward(player.tiandibang.win_streak);
        if (liansheng) {
            jifen = Math.floor(jifen * liansheng.jifenMultiplier);
            lingshi = Math.floor(lingshi * liansheng.lingshiMultiplier);
            messages.push(`🔥 ${player.tiandibang.win_streak}连胜！积分×${liansheng.jifenMultiplier}`);

            if (liansheng.reward) {
                messages.push(`🎁 获得奖励：${liansheng.reward}`);
            }
        }
    } else {
        // 连胜中断
        if (player.tiandibang.win_streak >= 3) {
            messages.push(`💔 ${player.tiandibang.win_streak}连胜中断`);
        }
        player.tiandibang.win_streak = 0;
    }

    // 更新积分
    player.tiandibang.jifen += jifen;
    player.tiandibang.glory_points += Math.floor(jifen / 10); // 荣耀点

    // 更新排行榜
    await redis.zAdd(LEADERBOARD_KEY, {
        score: player.tiandibang.jifen,
        value: String(userId)
    });

    // 检查段位变化
    const newDuanwei = getDuanwei(player.tiandibang.jifen);

    await DAL.savePlayer(userId, player);

    return {
        jifen,
        lingshi,
        totalJifen: player.tiandibang.jifen,
        winStreak: player.tiandibang.win_streak,
        duanwei: newDuanwei,
        messages
    };
}

/**
 * 获取排行榜
 */
export async function getLeaderboard(start = 0, end = 9) {
    // 使用 sendCommand 调用 ZREVRANGE 以兼容不同Redis客户端
    // 返回格式为 [member1, score1, member2, score2, ...]
    const rawResults = await redis.sendCommand(['ZREVRANGE', LEADERBOARD_KEY, String(start), String(end), 'WITHSCORES']);

    const leaderboard = [];
    if (!rawResults || rawResults.length === 0) return leaderboard;

    for (let i = 0; i < rawResults.length; i += 2) {
        const userId = rawResults[i];
        const jifen = parseInt(rawResults[i + 1]);
        const data = await DAL.getAllPlayerData(userId);
        const player = data?.player;

        leaderboard.push({
            rank: start + (i / 2) + 1,
            userId,
            name: player?.名号 || '未知',
            jifen,
            duanwei: getDuanwei(jifen)
        });
    }

    return leaderboard;
}

/**
 * 获取玩家排名
 */
export async function getPlayerRank(userId) {
    const rank = await redis.zRevRank(LEADERBOARD_KEY, String(userId));
    return rank !== null ? rank + 1 : null;
}

/**
 * 随机匹配对手
 */
export async function matchOpponent(userId, playerJifen) {
    // 获取积分相近的玩家
    const range = 5000;
    const minScore = Math.max(0, playerJifen - range);
    const maxScore = playerJifen + range;

    const candidates = await redis.zRangeByScore(LEADERBOARD_KEY, minScore, maxScore);

    // 过滤掉自己
    const opponents = candidates.filter(id => id !== String(userId));

    if (opponents.length === 0) {
        return null; // 没有合适对手，将匹配NPC
    }

    // 随机选择一个对手
    const randomIdx = Math.floor(Math.random() * opponents.length);
    return opponents[randomIdx];
}

/**
 * 开始新赛季
 */
export async function startNewSeason() {
    const currentSeason = await getCurrentSeason();
    const newSeason = currentSeason + 1;

    // 保存赛季结算数据
    const finalLeaderboard = await getLeaderboard(0, 49);
    await redis.set(`${REDIS_PREFIX}:season_result:${currentSeason}`, JSON.stringify({
        season: currentSeason,
        endTime: Date.now(),
        leaderboard: finalLeaderboard
    }));

    // 清空排行榜
    await redis.del(LEADERBOARD_KEY);

    // 更新赛季号
    await redis.set(SEASON_KEY, String(newSeason));

    return { newSeason, finalLeaderboard };
}
