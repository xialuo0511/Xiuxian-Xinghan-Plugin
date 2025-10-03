import * as DAL from '../api/data-access.js';
import { shijianc } from '../apps/Xiuxian/xiuxian.js';
import config from '../model/Config.js';

// 加载月度累计签到奖励配置
let monthlyRewardsConfig = config.getConfig('xiuxian', 'sign_in_rewards');
const xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');

monthlyRewardsConfig = Object.values(monthlyRewardsConfig);

/**
 * 处理玩家的每日签到逻辑
 * @param {string} userId 玩家ID
 * @returns {Promise<object>} 返回一个包含签到结果、各类数据和奖励的丰富对象
 */
export async function processDailyCheckIn(userId) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`; // 使用唯一的日期字符串作为凭证

  let transactionResult = null;
  let signinError = null; // 用于从事务中传递错误信息

  const transactionSuccess = await DAL.transaction_update(userId, (player) => {
    // 使用 player 对象中的 last_sign_in_date 作为唯一凭证
    if (player.last_sign_in_date === todayStr) {
      signinError = '今日已经签到过了';
      return false; // 返回 false 来中断事务并向外传递失败信号
    }

    // 如果检查通过，则立即更新签到日期，锁定签到状态
    player.last_sign_in_date = todayStr;

    const wasYesterday = player.last_sign_in_date_yesterday === `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate() - 1}`;
    if (player.连续签到天数 >= 14 || !wasYesterday) {
      player.连续签到天数 = 0;
    }
    player.连续签到天数 += 1;
    player.last_sign_in_date_yesterday = todayStr; // 记录本次签到日期，供下次判断
    player.total_sign_in_days = (player.total_sign_in_days || 0) + 1;

    const currentMonth = `${now.getFullYear()}-${now.getMonth() + 1}`;
    if (!player.sign_in_info || player.sign_in_info.last_sign_in_month !== currentMonth) {
      player.sign_in_info = {
        last_sign_in_month: currentMonth,
        monthly_cumulative_days: 0,
        claimed_monthly_rewards: []
      };
    }
    player.sign_in_info.monthly_cumulative_days += 1;


    let daily_gift_xiuxwei = player.连续签到天数 * 15000;
    let daily_gift_key = xiuxianConfigData.Sign.ticket;
    let dailyRewardsMessages = [];
    if (player.daofaxianshu_endtime > now.getTime()) {
      daily_gift_xiuxwei *= 2;
      daily_gift_key *= 2;
      dailyRewardsMessages.push('【道法仙术】给予你赐福，签到奖励翻倍！');
    }
    player.修为 += daily_gift_xiuxwei;

    let cumulativeRewardsToGrant = [];
    let cumulativeRewardsMsgs = [];
    for (const rewardTier of monthlyRewardsConfig) {
      if (player.sign_in_info.monthly_cumulative_days >= rewardTier.days && !player.sign_in_info.claimed_monthly_rewards.includes(rewardTier.days)) {
        player.sign_in_info.claimed_monthly_rewards.push(rewardTier.days);
        cumulativeRewardsToGrant.push(...rewardTier.rewards);
        cumulativeRewardsMsgs.push(`达成[${rewardTier.days}天]累计签到，获得额外奖励！`);
      }
    }

    transactionResult = {
      player,
      dailyRewards: { 修为: daily_gift_xiuxwei, 秘境之匙: daily_gift_key, message: dailyRewardsMessages },
      cumulativeRewards: cumulativeRewardsToGrant,
      cumulativeMessages: cumulativeRewardsMsgs
    };
    return true;
  });

  // 根据事务执行结果进行响应
  if (!transactionSuccess) {
    // 如果是我们自己设置的签到错误，就返回对应的消息，否则返回通用冲突消息
    return { success: false, message: signinError || '签到失败，数据更新时发生冲突，请重试。' };
  }

  // 【重要】不再需要单独的 redis.set 来记录签到时间，因为 player 数据已是最新

  // 发放奖励物品 (事务成功后执行)
  await DAL.updateNajieItem(userId, '秘境之匙', '道具', transactionResult.dailyRewards.秘境之匙);
  for (const item of transactionResult.cumulativeRewards) {
    if (item.name === '修为') {
      logger.info(`[签到] 发放累计奖励：${item.name} x ${item.amount}`);
      await DAL.transaction_update(userId, (p) => {
        p.修为 += item.amount;
      });
    } else {
      await DAL.updateNajieItem(userId, item.name, item.class, item.amount, item.pinji);
    }
  }

  const checkinKey = `XinghanXiuxian:Player:${userId}:Checkin:${now.getFullYear()}-${now.getMonth() + 1}`;
  await redis.sAdd(checkinKey, String(now.getDate()));
  const checkedInDaysRaw = await redis.sMembers(checkinKey);

  const finalMessage = '签到成功！' + (transactionResult.cumulativeMessages.length > 0 ? `\n${transactionResult.cumulativeMessages.join('\n')}` : '');
  return {
    success: true,
    message: finalMessage,
    checkInData: {
      consecutiveDays: transactionResult.player.连续签到天数,
      checkedInDays: checkedInDaysRaw.map(Number)
    },
    dailyRewards: transactionResult.dailyRewards,
    cumulativeData: {
      monthly_cumulative_days: transactionResult.player.sign_in_info.monthly_cumulative_days,
      claimed_monthly_rewards: transactionResult.player.sign_in_info.claimed_monthly_rewards
    },
    cumulativeRewards: transactionResult.cumulativeRewards
  };
}