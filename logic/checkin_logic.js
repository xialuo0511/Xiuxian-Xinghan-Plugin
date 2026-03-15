import * as DAL from '../api/data-access.js';
import * as partnerLogic from './partner_logic.js';
import config from '../model/Config.js';
import { loadItemConfig, loadSystemConfig } from '../model/ConfigLoader.js';
import { getActivityStatus } from './fishing_logic.js';
import { incrementProgressAndCheck, formatUnlockNotification } from './achievement_logic.js';
import { grantActivityReward } from './activity_reward_logic.js';

// 加载月度累计签到奖励配置
let monthlyRewardsConfig = loadItemConfig('sign_in_rewards.yaml');
const xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');

monthlyRewardsConfig = Object.values(monthlyRewardsConfig);

// 加载2026马年春节活动签到配置
let springFestivalSigninConfig = null;
try {
  springFestivalSigninConfig = loadSystemConfig('spring_festival_signin.yaml');
} catch (err) {
  logger.warn('[签到] 春节活动配置加载失败，活动签到功能将不可用:', err.message);
}

// 加载2026清明活动签到配置
let qingmingSigninConfig = null;
try {
  qingmingSigninConfig = loadSystemConfig('qingming_signin.yaml');
} catch (err) {
  logger.warn('[签到] 清明活动配置加载失败，活动签到功能将不可用:', err.message);
}

function parseActivityTimestamp(dateTime) {
  if (!dateTime) return 0;
  return new Date(dateTime).getTime();
}

function buildSeasonalEventRenderData(eventName, totalDays, count, claimed, rewardTiers, theme = 'spring') {
  return {
    eventName,
    totalDays,
    count,
    claimed,
    theme,
    tiers: rewardTiers.map(tier => ({
      days: tier.days,
      name: tier.name,
      isClaimed: claimed.includes(tier.days),
      canClaim: count >= tier.days && !claimed.includes(tier.days)
    }))
  };
}


/**
 * 为指定用户清除今日的签到记录
 * @param {string} userId 目标用户ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function clearTodaySignIn(userId) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayDateStr = `${yesterdayStr.getFullYear()}-${yesterdayStr.getMonth() + 1}-${yesterdayStr.getDate()}`;

  const playerData = await DAL.getAllPlayerData(userId);
  if (!playerData || !playerData.player) {
    return { success: false, message: '找不到该玩家。' };
  }

  // 1. 验证玩家今天是否真的签到了
  if (playerData.player.last_sign_in_date !== todayStr) {
    return { success: false, message: '该玩家今天尚未签到，无需消除。' };
  }

  const oldMonthlyCount = playerData.player.sign_in_info?.monthly_cumulative_days || 0;

  // 2. 在数据库事务中回滚玩家核心数据
  const transactionSuccess = await DAL.transaction_update(userId, (player) => {
    // a. 上次签到日期恢复到昨天（为了不中断连续签到）
    player.last_sign_in_date = yesterdayDateStr;

    // b. 连续签到天数 -1
    if (player.连续签到天数 > 0) {
      player.连续签到天数 -= 1;
    }

    // c. 个人月度累计天数 -1
    if (player.sign_in_info && player.sign_in_info.monthly_cumulative_days > 0) {
      player.sign_in_info.monthly_cumulative_days -= 1;
    }

    // d. 如果今天签到刚好达到了某个奖励档位，则撤销该奖励的“已领取”状态
    const personalRewardsConfig = loadItemConfig('sign_in_rewards.yaml');
    const triggeredTier = personalRewardsConfig.find(tier => tier.days === oldMonthlyCount);
    if (triggeredTier && player.sign_in_info.claimed_monthly_rewards) {
      player.sign_in_info.claimed_monthly_rewards = player.sign_in_info.claimed_monthly_rewards.filter(
        day => day !== oldMonthlyCount
      );
    }
  });

  if (!transactionSuccess) {
    return { success: false, message: '消除签到失败，更新数据库时发生冲突。' };
  }

  // 3. 回滚 Redis 中的日历记录
  const calendarKey = `XinghanXiuxian:Player:${userId}:Checkin:${now.getFullYear()}-${now.getMonth() + 1}`;
  await redis.sRem(calendarKey, String(now.getDate()));

  // 4. 回滚协同签到相关数据
  const partnerId = await partnerLogic.getPartnerId(userId);
  if (partnerId) {
    const relationshipKey = partnerLogic.getRelationshipKey(userId, partnerId);
    const yyyymmdd = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const dailyTrackerKey = `XinghanXiuxian:co_signin_tracker:${yyyymmdd}:${relationshipKey}`;

    // 检查今天是否完成了协同签到（即双方都已签到）
    const didCoopSignIn = (await redis.sCard(dailyTrackerKey)) === 2;

    // 从今日协同记录中移除自己
    await redis.sRem(dailyTrackerKey, userId);

    // 如果今天确实完成了协同签到，则需要回滚月度协同计数和奖励状态
    if (didCoopSignIn) {
      const yyyymm = `${now.getFullYear()}-${now.getMonth() + 1}`;
      const monthlyProgressKey = `XinghanXiuxian:co_signin:${yyyymm}:${relationshipKey}`;

      const oldCoopCount = parseInt(await redis.hGet(monthlyProgressKey, 'count') || '0');
      await redis.hIncrBy(monthlyProgressKey, 'count', -1);

      const coopRewardsConfig = loadItemConfig('collaborative_signin.yaml');
      const triggeredCoopTier = coopRewardsConfig.find(tier => tier.days === oldCoopCount);
      if (triggeredCoopTier) {
        let claimedRewards = JSON.parse(await redis.hGet(monthlyProgressKey, 'claimed') || '[]');
        claimedRewards = claimedRewards.filter(day => day !== oldCoopCount);
        await redis.hSet(monthlyProgressKey, 'claimed', JSON.stringify(claimedRewards));
      }
    }
  }

  return { success: true, message: `已成功消除玩家 [${playerData.player.名号}] 今日的签到记录，TA现在可以重新签到了。` };
}

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

  let extraRewards = [];
  let extraMessages = [];

  // 添加本次获得的【个人月度累计奖励】
  if (transactionResult.cumulativeRewards && transactionResult.cumulativeRewards.length > 0) {
    extraRewards.push(...transactionResult.cumulativeRewards);
    extraMessages.push(...transactionResult.cumulativeMessages);
  }

  // 检查并添加【钓鱼活动】的每日签到奖励
  const fishingActivity = getActivityStatus('hanjiang_fishing_2025_10');
  if (fishingActivity) {
    const fishingRewards = [
      { name: '青玉蚯蚓', class: '活动', amount: 10 },
      { name: '龙须灵虾', class: '活动', amount: 10 },
      { name: '灵泉面团', class: '活动', amount: 5 },
      { name: '七彩香丸', class: '活动', amount: 5 }
    ];
    extraRewards.push(...fishingRewards);
    extraMessages.push('【寒江独钓】活动福利');

    // 为玩家发放活动签到奖励
    for (const reward of fishingRewards) {
      await DAL.updateNajieItem(userId, reward.name, reward.class, reward.amount, reward);
    }
  }

  // 检查并添加【2026马年春节活动】和【2026清明活动】签到奖励
  const currentTime = Date.now();
  let springFestivalData = null;
  let qingmingData = null;
  let seasonalEventData = null;

  const springFestivalStart = parseActivityTimestamp(springFestivalSigninConfig?.activity?.start_time)
    || new Date('2026-02-02 00:00:00').getTime();
  const springFestivalEnd = parseActivityTimestamp(springFestivalSigninConfig?.activity?.end_time)
    || new Date('2026-03-08 23:59:59').getTime();

  if (currentTime >= springFestivalStart && currentTime <= springFestivalEnd) {
    const festivalRewards = [{ name: '马年福袋', class: '活动', amount: 1 }];
    const festivalLingshi = 2000;

    for (const reward of festivalRewards) {
      const grantResult = await grantActivityReward(userId, reward);
      extraRewards.push(...grantResult.granted);
      extraMessages.push(...grantResult.messages);
    }

    const lingshiResult = await grantActivityReward(userId, { name: '灵石', class: '资源', amount: festivalLingshi });
    extraRewards.push(...lingshiResult.granted);
    extraMessages.push(...lingshiResult.messages);
    extraMessages.push('【万马奔腾】新春签到福利');

    // 新春加成：额外修为+100%
    const bonusXiuwei = transactionResult.dailyRewards.修为;
    const xiuweiResult = await grantActivityReward(userId, { name: '修为', class: '资源', amount: bonusXiuwei });
    extraRewards.push(...xiuweiResult.granted);
    extraMessages.push(...xiuweiResult.messages);
    extraMessages.push(`新春加成：额外修为+${bonusXiuwei}`);

    if (springFestivalSigninConfig && Array.isArray(springFestivalSigninConfig.rewards)) {
      const rewardTiers = springFestivalSigninConfig.rewards;
      const springTotalDays = Number(springFestivalSigninConfig?.activity?.progress_total_days) || 21;
      const activitySigninKey = `XinghanXiuxian:SpringFestival:2026:SignIn:${userId}`;
      const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

      const lastActivitySignDate = await redis.hGet(activitySigninKey, 'last_date');
      let activitySignCount = parseInt(await redis.hGet(activitySigninKey, 'count') || '0');
      let claimedActivityRewards = JSON.parse(await redis.hGet(activitySigninKey, 'claimed') || '[]');

      if (lastActivitySignDate !== todayStr) {
        activitySignCount += 1;
        await redis.hSet(activitySigninKey, 'count', String(activitySignCount));
        await redis.hSet(activitySigninKey, 'last_date', todayStr);

        const expireAt = Math.floor((springFestivalEnd + 7 * 24 * 60 * 60 * 1000) / 1000);
        await redis.expireAt(activitySigninKey, expireAt);
      }

      for (const tier of rewardTiers) {
        if (activitySignCount >= tier.days && !claimedActivityRewards.includes(tier.days)) {
          claimedActivityRewards.push(tier.days);

          for (const reward of tier.rewards || []) {
            const grantResult = await grantActivityReward(userId, reward);
            extraRewards.push(...grantResult.granted);
            extraMessages.push(...grantResult.messages);
          }
          extraMessages.push(`🏮「${tier.name}」累计${tier.days}天奖励`);
        }
      }

      await redis.hSet(activitySigninKey, 'claimed', JSON.stringify(claimedActivityRewards));

      springFestivalData = buildSeasonalEventRenderData(
        `${springFestivalSigninConfig?.activity?.name || '万马奔腾'} · 新春签到`,
        springTotalDays,
        activitySignCount,
        claimedActivityRewards,
        rewardTiers,
        'spring'
      );
      seasonalEventData = springFestivalData;
    }
  }

  const qingmingStart = parseActivityTimestamp(qingmingSigninConfig?.activity?.start_time);
  const qingmingEnd = parseActivityTimestamp(qingmingSigninConfig?.activity?.end_time);
  if (qingmingStart && qingmingEnd && currentTime >= qingmingStart && currentTime <= qingmingEnd) {
    const activityInfo = qingmingSigninConfig.activity || {};
    const dailyItems = qingmingSigninConfig?.daily_rewards?.items || [];
    const dailyResources = qingmingSigninConfig?.daily_rewards?.resources || [];
    const rewardTiers = Array.isArray(qingmingSigninConfig.rewards) ? qingmingSigninConfig.rewards : [];
    const maxTierDays = rewardTiers.length > 0 ? Math.max(...rewardTiers.map(t => Number(t.days) || 0)) : 1;
    const progressTotalDays = Number(activityInfo.progress_total_days) || maxTierDays;

    for (const reward of dailyItems) {
      const grantResult = await grantActivityReward(userId, reward);
      extraRewards.push(...grantResult.granted);
      extraMessages.push(...grantResult.messages);
    }
    for (const reward of dailyResources) {
      const grantResult = await grantActivityReward(userId, { ...reward, class: '资源' });
      extraRewards.push(...grantResult.granted);
      extraMessages.push(...grantResult.messages);
    }
    if (dailyItems.length > 0 || dailyResources.length > 0) {
      extraMessages.push(`【${activityInfo.name || '清明活动'}】每日签到福利`);
    }

    const activityId = activityInfo.id || 'qingming_2026';
    const activitySigninKey = `XinghanXiuxian:Activity:${activityId}:SignIn:${userId}`;
    const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

    const lastActivitySignDate = await redis.hGet(activitySigninKey, 'last_date');
    let activitySignCount = parseInt(await redis.hGet(activitySigninKey, 'count') || '0');
    let claimedActivityRewards = JSON.parse(await redis.hGet(activitySigninKey, 'claimed') || '[]');

    if (lastActivitySignDate !== todayStr) {
      activitySignCount += 1;
      await redis.hSet(activitySigninKey, 'count', String(activitySignCount));
      await redis.hSet(activitySigninKey, 'last_date', todayStr);

      const expireAt = Math.floor((qingmingEnd + 7 * 24 * 60 * 60 * 1000) / 1000);
      await redis.expireAt(activitySigninKey, expireAt);
    }

    for (const tier of rewardTiers) {
      if (activitySignCount >= tier.days && !claimedActivityRewards.includes(tier.days)) {
        claimedActivityRewards.push(tier.days);

        for (const reward of tier.rewards || []) {
          const grantResult = await grantActivityReward(userId, reward);
          extraRewards.push(...grantResult.granted);
          extraMessages.push(...grantResult.messages);
        }
        extraMessages.push(`🌿「${tier.name}」累计${tier.days}天奖励`);
      }
    }

    await redis.hSet(activitySigninKey, 'claimed', JSON.stringify(claimedActivityRewards));

    qingmingData = buildSeasonalEventRenderData(
      `${activityInfo.name || '清明活动'} · 累计签到`,
      progressTotalDays,
      activitySignCount,
      claimedActivityRewards,
      rewardTiers,
      'qingming'
    );
    seasonalEventData = qingmingData;
  }


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

  let finalReturn = {
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
    cumulativeRewards: transactionResult.cumulativeRewards,
    coopRewardMsg: '',
    extraRewardsInfo: {
      messages: [...new Set(extraMessages)], // 消息去重
      items: extraRewards
    },
    // 新春活动签到数据（用于UI展示）
    springFestivalData: springFestivalData,
    // 清明活动签到数据（用于UI展示）
    qingmingData: qingmingData,
    // 当前活动签到数据（统一面板）
    seasonalEventData: seasonalEventData
  };


  try {
    const partnerId = await partnerLogic.getPartnerId(userId);
    if (partnerId) {
      const relationshipKey = partnerLogic.getRelationshipKey(userId, partnerId);
      const partnerLevel = parseInt(await redis.hGet(relationshipKey, 'level') || '0');

      // 检查是否解锁
      if (partnerLevel >= 2) {
        const now = new Date();
        const yyyymm = `${now.getFullYear()}-${now.getMonth() + 1}`;
        const yyyymmdd = `${yyyymm}-${now.getDate()}`;

        const dailyTrackerKey = `XinghanXiuxian:co_signin_tracker:${yyyymmdd}:${relationshipKey}`;

        // 检查对方今天是否已签到
        const isPartnerAlreadySigned = await redis.sIsMember(dailyTrackerKey, partnerId);

        // 将自己加入今天的签到记录，并设置25小时过期
        await redis.sAdd(dailyTrackerKey, userId);
        await redis.expire(dailyTrackerKey, 3600 * 25);

        // 如果对方今天已经签到，那么今天协同签到完成！
        if (isPartnerAlreadySigned) {
          const monthlyProgressKey = `XinghanXiuxian:co_signin:${yyyymm}:${relationshipKey}`;
          const newCount = await redis.hIncrBy(monthlyProgressKey, 'count', 1);

          // 检查奖励
          const claimedRewards = JSON.parse(await redis.hGet(monthlyProgressKey, 'claimed') || '[]');
          const collaborativeSigninConfig = loadItemConfig('collaborative_signin.yaml');
          for (const tier of collaborativeSigninConfig) {
            if (newCount >= tier.days && !claimedRewards.includes(tier.days)) {
              // 发放奖励给双方
              for (const reward of tier.rewards) {
                if (reward.name === '道侣币') {
                  await redis.hIncrBy(relationshipKey, 'coins', reward.amount);
                } else {
                  await DAL.updateNajieItem(userId, reward.name, reward.class, reward.amount, reward);
                  await DAL.updateNajieItem(partnerId, reward.name, reward.class, reward.amount, reward);
                }
              }
              claimedRewards.push(tier.days);

              // 构造奖励消息
              const rewardText = tier.rewards.map(r => `[${r.name}]x${r.amount}`).join('、');
              finalReturn.coopRewardMsg = `\n[同心]你们协同签到已达${tier.days}天，双方获得奖励：${rewardText}！`;
            }
          }
          await redis.hSet(monthlyProgressKey, 'claimed', JSON.stringify(claimedRewards));
        }
      }
    }
  } catch (error) {
    logger.error('[协同签到] 处理时发生错误:', error);
  }

  // 成就触发器 - 检查签到相关成就
  try {
    const totalSigninDays = transactionResult.player.total_sign_in_days || 1;
    const consecutiveDays = transactionResult.player.连续签到天数 || 1;

    // 触发累计签到成就
    const signinAchievements = await incrementProgressAndCheck(userId, 'signin_count', 0);
    // 直接设置进度值（累计签到）
    const { checkAndUnlockAchievements } = await import('./achievement_logic.js');
    const totalUnlocked = await checkAndUnlockAchievements(userId, 'signin_count', totalSigninDays);

    // 触发连续签到成就
    const streakUnlocked = await checkAndUnlockAchievements(userId, 'signin_streak', consecutiveDays);

    const allUnlocked = [...totalUnlocked, ...streakUnlocked];
    if (allUnlocked.length > 0) {
      finalReturn.achievementMsg = formatUnlockNotification(allUnlocked);
    }
  } catch (err) {
    logger.error('[成就系统] 签到成就检查失败:', err);
  }

  return finalReturn;
}
