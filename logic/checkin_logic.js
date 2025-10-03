import * as DAL from '../api/data-access.js';
import { shijianc } from '../apps/Xiuxian/xiuxian.js';
import config from '../model/Config.js';

// 加载月度累计签到奖励配置
const monthlyRewardsConfig = config.getConfig('xiuxian', 'sign_in_rewards');
const xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');

/**
 * 处理玩家的每日签到逻辑
 * @param {string} userId 玩家ID
 * @returns {Promise<object>} 返回一个包含签到结果、各类数据和奖励的丰富对象
 */
export async function processDailyCheckIn(userId) {
  const now = new Date();
  const nowTime = now.getTime();
  const today = await shijianc(nowTime);
  const yesterday = await shijianc(nowTime - 24 * 60 * 60 * 1000);

  // 检查今天是否已经签到
  const lastSignTime = parseInt(await redis.get(`xiuxian:player:${userId}:lastsign_time`)) || 0;
  const lastSignDay = await shijianc(lastSignTime);
  if (today.Y === lastSignDay.Y && today.M === lastSignDay.M && today.D === lastSignDay.D) {
    return { success: false, message: '今日已经签到过了' };
  }

  // 用于在事务内外传递数据的变量
  let transactionResult = null;

  // 使用事务来更新所有与玩家状态相关的数据
  const transactionSuccess = await DAL.transaction_update(userId, (player) => {
    // --- 处理每日连续签到 (逻辑不变) ---
    const wasYesterday = yesterday.Y === lastSignDay.Y && yesterday.M === lastSignDay.M && yesterday.D === lastSignDay.D;
    if (player.连续签到天数 >= 14 || !wasYesterday) {
      player.连续签到天数 = 0;
    }
    player.连续签到天数 += 1;

    // --- 处理月度累计签到 ---
    const currentMonth = `${today.Y}-${today.M}`;
    // 初始化或重置月度数据
    if (!player.sign_in_info || player.sign_in_info.last_sign_in_month !== currentMonth) {
      player.sign_in_info = {
        last_sign_in_month: currentMonth,
        monthly_cumulative_days: 0,
        claimed_monthly_rewards: []
      };
    }
    player.sign_in_info.monthly_cumulative_days += 1;

    // --- 计算每日奖励 ---
    let daily_gift_xiuwei = player.连续签到天数 * 15000;
    let daily_gift_key = xiuxianConfigData.Sign.ticket;
    let dailyRewardsMessages = [];

    // 检查是否有翻倍buff
    if (player.daofaxianshu_endtime > nowTime) {
      daily_gift_xiuwei *= 2;
      daily_gift_key *= 2;
      dailyRewardsMessages.push('【道法仙术】给予你赐福，签到奖励翻倍！');
    }

    player.修为 += daily_gift_xiuwei;

    // --- 检查并“预定”累计奖励 ---
    let cumulativeRewardsToGrant = []; // 待发放的累计奖励物品
    let cumulativeRewardsMsgs = [];   // 累计奖励的提示消息

    for (const rewardTier of monthlyRewardsConfig) {
      // 条件：达到天数 且 尚未在本事务中被标记为领取
      if (player.sign_in_info.monthly_cumulative_days >= rewardTier.days && !player.sign_in_info.claimed_monthly_rewards.includes(rewardTier.days)) {
        // 核心：在事务内标记为“已领取”，防止重复发放
        player.sign_in_info.claimed_monthly_rewards.push(rewardTier.days);

        // 将奖励物品和消息暂存，待事务成功后发放
        cumulativeRewardsToGrant.push(...rewardTier.rewards);
        cumulativeRewardsMsgs.push(`达成[${rewardTier.days}天]累计签到，获得额外奖励！`);
      }
    }

    // --- 将所有结果暂存到事务外 ---
    transactionResult = {
      player, // 更新后的player对象
      dailyRewards: {
        修为: daily_gift_xiuwei,
        秘境之匙: daily_gift_key,
        message: dailyRewardsMessages
      },
      cumulativeRewards: cumulativeRewardsToGrant,
      cumulativeMessages: cumulativeRewardsMsgs
    };

    return true; // 表示事务修改成功
  });

  if (!transactionSuccess) {
    return { success: false, message: '签到失败，数据更新时发生冲突，请重试。' };
  }

  // 3. 事务成功后，执行所有外部操作（Redis、物品发放）
  await redis.set(`xiuxian:player:${userId}:lastsign_time`, nowTime);

  // 发放每日奖励物品
  await DAL.updateNajieItem(userId, '秘境之匙', '道具', transactionResult.dailyRewards.秘境之匙);

  // 发放所有累计奖励物品
  for (const item of transactionResult.cumulativeRewards) {
    await DAL.updateNajieItem(userId, item.name, item.class, item.amount, item.pinji);
  }

  // 记录本月签到日期
  const checkinKey = `XinghanXiuxian:Player:${userId}:Checkin:${today.Y}-${today.M}`;
  await redis.sAdd(checkinKey, String(today.D));
  const checkedInDaysRaw = await redis.sMembers(checkinKey);

  // 组装并返回给前端的最终数据
  const finalMessage = '签到成功！' + (transactionResult.cumulativeMessages.length > 0 ? `\n${transactionResult.cumulativeMessages.join('\n')}` : '');

  return {
    success: true,
    message: finalMessage,
    // 每日签到部分的数据
    checkInData: {
      consecutiveDays: transactionResult.player.连续签到天数,
      checkedInDays: checkedInDaysRaw.map(Number) // 已签到的日期数组 [1, 2, 5]
    },
    dailyRewards: transactionResult.dailyRewards, // 每日奖励的详情
    // 累计签到部分的数据
    cumulativeData: {
      monthly_cumulative_days: transactionResult.player.sign_in_info.monthly_cumulative_days,
      claimed_monthly_rewards: transactionResult.player.sign_in_info.claimed_monthly_rewards
    },
    cumulativeRewards: transactionResult.cumulativeRewards // 本次签到实际获得的累计奖励物品
  };
}