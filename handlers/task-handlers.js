import * as DAL from '../api/data-access.js';
import { scheduleTask } from '../api/task-scheduler.js';
import { common } from '../api/api.js';

const LEI_JIE_INTERVAL = 10 * 1000; // 设置每次雷劫的间隔为10秒

/**
 * 处理单次雷劫打击，并决定是否继续任务链
 * @param {object} task - 从工作单元接收到的任务对象
 */
export async function handleTribulationStrike(task) {
  const { userId, current_strike, total_strikes, success_rate, group_id } = task;

  try {
    const data = await DAL.getPlayerData(userId);
    if (!data || !data.player) {
      logger.warn(`[渡劫处理器] 玩家 ${userId} 的数据不存在，渡劫任务链中断。`);
      return;
    }

    let player = data.player;

    // --- 核心逻辑：执行一次雷劫 ---
    const random = Math.random();
    let msg = "";

    // 1. 判断渡劫是否失败
    if (random > success_rate) {
      player.当前血量 = 0;
      player.修为 = Math.floor(player.修为 * 0.5);
      await DAL.savePlayer(userId, player); // 保存失败状态

      msg = `第${current_strike}道天雷落下，可惜【${player.名号}】未能抵挡，身死道消，渡劫失败！`;
      if (group_id) {
        common.bot.sendGroupMsg(group_id, msg);
      }
      return; // 失败，任务链在此终结
    }

    // 2. 渡劫未失败，计算伤害
    const damage = Math.floor(player.血量上限 * 0.25); // 示例：每次掉25%血，您可以替换为您自己的复杂伤害计算
    player.当前血量 -= damage;

    msg = `第${current_strike}道天雷轰然落下，对【${player.名号}】造成了 ${damage} 点伤害！剩余血量: ${player.当前血量}`;
    if (group_id) {
      common.bot.sendGroupMsg(group_id, msg);
    }

    // 3. 检查玩家是否存活
    if (player.当前血量 <= 0) {
      player.当前血量 = 0;
      await DAL.savePlayer(userId, player);
      const failMsg = `【${player.名号}】没能抗住第${current_strike}道天雷，遗憾失败！`;
      if (group_id) {
        common.bot.sendGroupMsg(group_id, failMsg);
      }
      return; // 死亡，任务链中断
    }

    // --- 任务链核心：判断是否继续 ---
    if (current_strike < total_strikes) {
      // [接力] 如果不是最后一道雷，调度下一道雷
      const nextStrikeTime = Date.now() + LEI_JIE_INTERVAL;
      const nextTaskPayload = { ...task, current_strike: current_strike + 1 };
      await scheduleTask(nextTaskPayload, nextStrikeTime);

      // [重要] 中间步骤，只保存玩家数据，不删除action信标
      await DAL.savePlayer(userId, player);
    } else {
      // [终结] 这是最后一道雷，渡劫成功！
      player.level_id += 1;
      player.power_place = 0;
      // ... 其他成功后的奖励和状态更新

      // [重要] 结算成功后，保存数据并删除“忙碌信标”
      await DAL.savePlayer(userId, player);
      await redis.del(actionKey);

      const successMsg = `恭喜【${player.名号}】成功渡过所有天劫，羽化登仙！`;
      if (group_id) common.bot.sendGroupMsg(group_id, successMsg);
    }

  } catch (error) {
    logger.error(`[处理器] 处理用户 ${userId} 的雷劫任务 #${current_strike} 时出错:`, error);
    // [重要] 即使出错也要尝试删除信标，防止玩家卡死
    await redis.del(actionKey);
  }
}