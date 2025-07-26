// /logic/breakthrough_logic.js

import * as DAL from '../api/data-access.js';
import data from '../model/XiuxianData.js';
import config from '../model/Config.js';

const xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');

/**
 * 处理练气突破
 * @param {string} userId - 玩家 ID
 * @param {boolean} useLuck - 使用增强运气的物品
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function handleQiBreakthrough(userId, useLuck = false) {
  try {
    // CD 检查
    const nowTime = Date.now();
    const cdTime = xiuxianConfigData.CD.level_up * 60000;
    let lastTime = 0;

    try {
      const redisValue = await redis.get(`xiuxian:player:${userId}:last_Levelup_time`);
      lastTime = parseInt(redisValue) || 0;
    } catch (redisError) {
      console.error('Redis读取错误:', redisError);
      // 继续执行，使用默认值0
    }

    if (nowTime < lastTime + cdTime) {
      const remaining = lastTime + cdTime - nowTime;
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      return { success: false, message: `突破正在CD中，剩余cd: ${m}分 ${s}秒` };
    }

    // 突破逻辑
    let resultMessage = '突破失败，请稍后再试。';
    let actualSuccess = false;

    const transactionResult = await DAL.transaction_update(userId, (player, equipment, najie) => {
      console.log('[DEBUG] 开始突破事务，玩家等级:', player.level_id);

      const levelInfo = data.Level_list.find(item => item.level_id == player.level_id);
      if (!levelInfo) {
        console.error('[ERROR] 找不到当前等级信息，level_id:', player.level_id);
        resultMessage = '无法找到当前等级信息';
        return false;
      }

      const nextLevelInfo = data.Level_list.find(item => item.level_id == (Number(player.level_id) + 1));

      if (!nextLevelInfo) {
        resultMessage = '您已达到当前等级上限';
        return false;
      }

      if (levelInfo.level === '渡劫期') {
        resultMessage = player.power_place === 0 ? '你已度过雷劫，请感应仙门#羽化登仙' : '请先渡劫！';
        return false;
      }

      if (player.修为 < levelInfo.exp) {
        resultMessage = `修为不足,再积累${levelInfo.exp - player.修为}修为后方可突破`;
        return false;
      }

      if (levelInfo.level_id >= 51 && !['天五灵根', '垃圾五灵根', '九转轮回体', '九重魔功', '仙之心·火', '仙之心·水', '仙之心·雷', '仙之心·冰', '仙之心·岩', '仙之心·风', '仙之心·木'].includes(player.灵根.name)) {
        resultMessage = `你灵根不齐，无成帝的资格！请先夺天地之造化，修补灵根后再来突破吧`;
        return false;
      }

      let prob = 1 - levelInfo.level_id / 80;
      if (useLuck) {
        prob += (1 - prob) * 0.5;
      }
      if (player.breakthrough) {
        prob += 0.2;
        player.breakthrough = false;
      }

      const rand = Math.random();
      console.log(`[DEBUG] 突破概率: ${(prob * 100).toFixed(2)}%, 随机数: ${rand}`);

      if (rand > prob) {
        // 突破失败
        const bad_time = Math.random();
        let lostExp = 0;
        if (bad_time > 0.9) {
          lostExp = Math.floor(levelInfo.exp * 0.3);
          resultMessage = `（本次成功率: ${(prob * 100).toFixed(2)}%）\n突然听到一声鸡叫...是翠翎恐蕈！此地不宜久留，险些走火入魔，丧失了${lostExp}修为`;
        } else if (bad_time > 0.8) {
          lostExp = Math.floor(levelInfo.exp * 0.2);
          resultMessage = `（本次成功率: ${(prob * 100).toFixed(2)}%）\n突破瓶颈时想到树脂满了,险些走火入魔，丧失了${lostExp}修为`;
        } else {
          resultMessage = `（本次成功率: ${(prob * 100).toFixed(2)}%）\n突破失败，不要气馁,等到${xiuxianConfigData.CD.level_up}分钟后再尝试吧`;
        }
        if (lostExp > 0) {
          player.修为 = Math.max(0, player.修为 - lostExp);
        }
        return true; // 失败也要保存数据
      }

      // 突破成功
      player.level_id += 1;
      player.修为 -= levelInfo.exp;
      resultMessage = `（本次成功率: ${(prob * 100).toFixed(2)}%）\n突破成功,当前境界为${nextLevelInfo.level}`;
      actualSuccess = true;
      return true;
    });

    console.log('[DEBUG] 事务结果:', transactionResult, '实际成功:', actualSuccess);

    if (transactionResult) {
      // 更新CD时间
      try {
        await redis.set(`xiuxian:player:${userId}:last_Levelup_time`, nowTime.toString());
      } catch (redisError) {
        console.error('Redis写入错误:', redisError);
      }
      return { success: actualSuccess, message: resultMessage };
    }

    return { success: false, message: resultMessage };

  } catch (error) {
    console.error('[ERROR] handleQiBreakthrough 发生异常:', error);
    return {
      success: false,
      message: '突破过程中发生错误，请稍后再试。'
    };
  }
}

/**
 * 处理炼体突破的逻辑
 * @param {string} userId - 玩家 ID
 * @param {boolean} useLuck - 气运物
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function handleBodyBreakthrough(userId, useLuck = false) {
  try {
    const nowTime = Date.now();
    const cdTime = xiuxianConfigData.CD.level_up * 60000;
    let lastTime = 0;

    try {
      const redisValue = await redis.get(`xiuxian:player:${userId}:last_LevelMaxup_time`);
      lastTime = parseInt(redisValue) || 0;
    } catch (redisError) {
      console.error('Redis读取错误:', redisError);
    }

    if (nowTime < lastTime + cdTime) {
      const remaining = lastTime + cdTime - nowTime;
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      return { success: false, message: `破体正在CD中，剩余cd: ${m}分 ${s}秒` };
    }

    let resultMessage = '破体失败，请稍后再试。';
    let actualSuccess = false;

    const transactionResult = await DAL.transaction_update(userId, (player) => {
      const levelInfo = data.LevelMax_list.find(item => item.level_id == player.Physique_id);
      if (!levelInfo) {
        console.error('[ERROR] 找不到当前炼体等级信息，Physique_id:', player.Physique_id);
        resultMessage = '无法找到当前炼体等级信息';
        return false;
      }

      const nextLevelInfo = data.LevelMax_list.find(item => item.level_id == (Number(player.Physique_id) + 1));

      if (!nextLevelInfo) {
        resultMessage = '你已突破至最高肉身境界';
        return false;
      }

      if (player.血气 < levelInfo.exp) {
        resultMessage = `血气不足,再积累${levelInfo.exp - player.血气}血气后方可破体`;
        return false;
      }

      let prob = 1 - levelInfo.level_id / 80;
      if (useLuck) {
        prob += (1 - prob) * 0.5;
      }

      const rand = Math.random();
      if (rand > prob) {
        let lostExp = 0;
        const bad_time = Math.random();
        if (bad_time > 0.8) {
          lostExp = Math.floor(levelInfo.exp * 0.2);
          resultMessage = `破体瓶颈时心魔入侵,险些走火入魔，丧失了${lostExp}血气`;
        } else {
          resultMessage = `破体失败，不要气馁,等到${xiuxianConfigData.CD.level_up}分钟后再尝试吧`;
        }
        if (lostExp > 0) {
          player.血气 = Math.max(0, player.血气 - lostExp);
        }
        return true; // 失败也要保存
      }

      // 成功
      player.Physique_id += 1;
      player.血气 -= levelInfo.exp;
      resultMessage = `破体成功至${nextLevelInfo.level}`;
      actualSuccess = true;
      return true;
    });

    if (transactionResult) {
      try {
        await redis.set(`xiuxian:player:${userId}:last_LevelMaxup_time`, nowTime.toString());
      } catch (redisError) {
        console.error('Redis写入错误:', redisError);
      }
      return { success: actualSuccess, message: resultMessage };
    }

    return { success: false, message: resultMessage };

  } catch (error) {
    console.error('[ERROR] handleBodyBreakthrough 发生异常:', error);
    return {
      success: false,
      message: '破体过程中发生错误，请稍后再试。'
    };
  }
}