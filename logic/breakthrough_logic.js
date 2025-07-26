// /logic/breakthrough_logic.js

import * as DAL from '../api/data-access.js';
import { redisClient as redis } from '../api/redis.js';
import data from '../model/XiuxianData.js';
import config from '../model/Config.js';

const xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');

/**
 * 处理练气突破
 * @param {string} userId - 玩家 ID
 * @param {boolean} useLuck - 使用增强运气的物品
 * @returns {Promise<{success: boolean, message: string}>}
 */
// 在 handleQiBreakthrough 函数开头添加更多调试信息

export async function handleQiBreakthrough(userId, useLuck = false) {
  console.log('[DEBUG] handleQiBreakthrough 开始执行, userId:', userId, 'useLuck:', useLuck);

  try {
    // 检查配置是否正确加载
    console.log('[DEBUG] xiuxianConfigData 是否存在:', !!xiuxianConfigData);
    console.log('[DEBUG] CD配置:', xiuxianConfigData?.CD);

    // CD 检查
    const nowTime = Date.now();
    console.log('[DEBUG] 当前时间:', nowTime);

    const cdTime = xiuxianConfigData.CD.level_up * 60000;
    console.log('[DEBUG] CD时间(毫秒):', cdTime);

    let lastTime = 0;

    try {
      console.log('[DEBUG] 准备从Redis获取上次突破时间...');
      const redisKey = `xiuxian:player:${userId}:last_Levelup_time`;
      console.log('[DEBUG] Redis key:', redisKey);

      const redisValue = await redis.get(redisKey);
      console.log('[DEBUG] Redis返回值:', redisValue);

      lastTime = parseInt(redisValue) || 0;
      console.log('[DEBUG] 解析后的lastTime:', lastTime);
    } catch (redisError) {
      console.error('[ERROR] Redis读取错误:', redisError);
      console.error('[ERROR] Redis错误详情:', redisError.stack);
    }

    if (nowTime < lastTime + cdTime) {
      const remaining = lastTime + cdTime - nowTime;
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      console.log('[DEBUG] 在CD中，返回CD消息');
      return { success: false, message: `突破正在CD中，剩余cd: ${m}分 ${s}秒` };
    }

    console.log('[DEBUG] CD检查通过，准备执行突破逻辑');

    // 检查 DAL 和 data 是否正确导入
    console.log('[DEBUG] DAL 是否存在:', !!DAL);
    console.log('[DEBUG] DAL.transaction_update 是否存在:', !!DAL.transaction_update);
    console.log('[DEBUG] data 是否存在:', !!data);
    console.log('[DEBUG] data.Level_list 是否存在:', !!data.Level_list);
    console.log('[DEBUG] data.Level_list 长度:', data.Level_list?.length);

    // 突破逻辑
    let resultMessage = '突破失败，请稍后再试。';
    let actualSuccess = false;

    console.log('[DEBUG] 准备调用 DAL.transaction_update...');

    const transactionResult = await DAL.transaction_update(userId, (player, equipment, najie) => {
      console.log('[DEBUG] transaction_update 回调开始执行');
      console.log('[DEBUG] player 数据:', JSON.stringify(player, null, 2));
      console.log('[DEBUG] player.level_id:', player.level_id, '类型:', typeof player.level_id);

      const levelInfo = data.Level_list.find(item => item.level_id == player.level_id);
      console.log('[DEBUG] 查找到的 levelInfo:', levelInfo);

      if (!levelInfo) {
        console.error('[ERROR] 找不到当前等级信息，level_id:', player.level_id);
        console.log('[DEBUG] Level_list 前几项:', data.Level_list.slice(0, 5));
        resultMessage = '无法找到当前等级信息';
        return false;
      }

      // ... 其余逻辑保持不变
    });

    console.log('[DEBUG] transaction_update 返回结果:', transactionResult);

    // ... 其余代码

  } catch (error) {
    console.error('[ERROR] handleQiBreakthrough 发生异常:', error);
    console.error('[ERROR] 错误类型:', error.constructor.name);
    console.error('[ERROR] 错误消息:', error.message);
    console.error('[ERROR] 错误堆栈:', error.stack);
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