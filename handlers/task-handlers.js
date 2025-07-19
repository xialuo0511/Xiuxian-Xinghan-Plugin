// /handlers/task-handlers.js (最终修正版 v2)

import * as DAL from '../api/data-access.js';
import { scheduleTask } from '../api/task-scheduler.js';

const LEI_JIE_INTERVAL = 10 * 1000; // 雷劫间隔10秒

/**
 * 处理单次雷劫打击，并决定是否继续任务链
 * @param {object} task 任务对象
 */
export async function handleTribulationStrike(task) {
  const { userId, current_strike, total_strikes, success_rate, group_id } = task;

  try {
    const data = await DAL.getPlayerData(userId);
    if (!data || !data.player) return;

    let player = data.player;

    const random = Math.random();

    // [修改] 先不发送消息，只在控制台打印日志
    console.log(`[渡劫处理器] 开始处理玩家 ${userId} 的第 ${current_strike} 道雷劫...`);

    if (random > success_rate) {
      player.当前血量 = 0;
      player.修为 = Math.floor(player.修为 * 0.5);
      await DAL.savePlayer(userId, player);
      console.log(`[渡劫处理器] 玩家 ${userId} 渡劫失败！`);
      // [移除] if (group_id) common.bot.sendGroupMsg(...)
      return;
    }

    const damage = Math.floor(player.血量上限 * 0.25);
    player.当前血量 -= damage;

    console.log(`[渡劫处理器] 玩家 ${userId} 成功抗下第 ${current_strike} 道雷，剩余血量 ${player.当前血量}`);

    if (player.当前血量 <= 0) {
      player.当前血量 = 0;
      await DAL.savePlayer(userId, player);
      console.log(`[渡劫处理器] 玩家 ${userId} 在第 ${current_strike} 道雷后力竭，渡劫失败！`);
      // [移除] if (group_id) common.bot.sendGroupMsg(...)
      return;
    }

    if (current_strike < total_strikes) {
      // [接力] 调度下一道雷
      const nextStrikeTime = Date.now() + LEI_JIE_INTERVAL;
      const nextTaskPayload = { ...task, current_strike: current_strike + 1 };
      await scheduleTask(nextTaskPayload, nextStrikeTime);
    } else {
      // [终结] 渡劫成功
      player.level_id += 1;
      player.power_place = 0;
      console.log(`[渡劫处理器] 恭喜玩家 ${userId} 成功渡过所有天劫！`);
      // [移除] if (group_id) common.bot.sendGroupMsg(...)
    }

    await DAL.savePlayer(userId, player);

  } catch (error) {
    console.error(`[渡劫处理器] 处理用户 ${userId} 的雷劫任务 #${current_strike} 时出错:`, error);
  }
}