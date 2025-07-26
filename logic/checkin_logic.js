import * as DAL from '../api/data-access.js';
import {
  shijianc,
  Add_najie_thing,
  Add_yijie_beibao_thing
} from '../apps/Xiuxian/xiuxian.js';
import config from '../model/Config.js';

const xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');

/**
 * 处理玩家的每日签到逻辑
 * @param {string} userId 玩家ID
 * @returns {Promise<{success: boolean, message: string, rewards?: object, checkInData?: object}>}
 */
export async function processDailyCheckIn(userId) {
  const now = new Date();
  const nowTime = now.getTime();
  const today = await shijianc(nowTime);
  const yesterday = await shijianc(nowTime - 24 * 60 * 60 * 1000);

  const lastSignTime = parseInt(await redis.get(`xiuxian:player:${userId}:lastsign_time`)) || 0;
  const lastSignDay = await shijianc(lastSignTime);

  // 检查今天是否已经签到
  if (today.Y === lastSignDay.Y && today.M === lastSignDay.M && today.D === lastSignDay.D) {
    return { success: false, message: '今日已经签到过了' };
  }

  let rewards = {
    修为: 0,
    秘境之匙: 0,
    仙鼎历练券: 0,
    message: []
  };

  let checkInData = {
    consecutiveDays: 0,
    checkedInDays: []
  };

  let updateResult = null;
  const transactionSuccess = await DAL.transaction_update(userId, (player) => {
    const wasYesterday = yesterday.Y === lastSignDay.Y && yesterday.M === lastSignDay.M && yesterday.D === lastSignDay.D;
    if (player.连续签到天数 >= 14 || !wasYesterday) {
      player.连续签到天数 = 0;
    }
    player.连续签到天数 += 1;
    checkInData.consecutiveDays = player.连续签到天数;

    let gift_xiuwei = player.连续签到天数 * 15000;
    let lilian = xiuxianConfigData.Sign.ticket;

    if (player.daofaxianshu_endtime > nowTime) {
      gift_xiuwei *= 2;
      lilian *= 2;
      rewards.message.push('【道法仙术】给予你赐福，签到奖励翻倍！');
    }

    rewards.修为 = gift_xiuwei;
    rewards.秘境之匙 = lilian;
    player.修为 += gift_xiuwei;

    updateResult = { player, rewards };
    return true;
  });

  if (!transactionSuccess) {
    return { success: false, message: '签到失败，数据更新时发生冲突，请重试。' };
  }

  // 事务成功后，执行非事务性操作
  await redis.set(`xiuxian:player:${userId}:lastsign_time`, nowTime);

  // 添加物品奖励
  await Add_najie_thing(userId, '秘境之匙', '道具', rewards.秘境之匙);

  // 记录本月签到日期
  const checkinKey = `XinghanXiuxian:Player:${userId}:Checkin:${today.Y}-${today.M}`;
  await redis.sAdd(checkinKey, String(today.D));
  const checkedInDaysRaw = await redis.sMembers(checkinKey);
  checkInData.checkedInDays = checkedInDaysRaw.map(Number);

  return {
    success: true,
    message: '签到成功！',
    rewards,
    checkInData
  };
}
