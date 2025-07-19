import * as DAL from '../api/data-access.js';
import * as Notifier from '../handlers/notifier.js';
import { createNewClient } from '../workers/redis-client.js'; // 使用共享客户端
import fs from 'fs';
import path from 'path';

// 独立加载所需的数据
const pluginRoot = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin');
const dataPath = path.join(pluginRoot, 'resources', 'data');
const Level_list = JSON.parse(fs.readFileSync(path.join(dataPath, 'Level', '练气境界.json'), 'utf-8'));

// 独立调度任务的函数
async function scheduleTask(payload, endTime) {
  const client = createNewClient();
  await client.connect();
  await client.zAdd('tasks:scheduled', { score: endTime, value: JSON.stringify(payload) });
  await client.quit();
}

const LEI_JIE_INTERVAL = 10 * 1000; // 雷劫间隔，10秒

/**
 * 这是一个纯粹的雷抗计算函数，不依赖外部模块
 * @param {object} player 玩家数据对象
 * @returns {number} 雷抗值
 */
function calculateDujieResistance(player) {
  if (!player || !player.灵根) return 0;

  let new_blood = (player.当前血量 || 0) / 100000;
  let new_defense = (player.防御 || 0) / 100000;
  let new_attack = (player.攻击 || 0) / 100000;

  new_blood = (new_blood * 4) / 10;
  new_defense = (new_defense * 6) / 10;
  new_attack = (new_attack * 2) / 10;

  let N = new_blood + new_defense;
  let x = N * new_attack;

  if (player.灵根.type == "真灵根") x *= 1.5;
  else if (player.灵根.type == "天灵根") x *= 1.75;
  else x *= 2;

  return x.toFixed(2);
}

/**
 * 处理单次雷劫打击，并决定是否继续任务链
 * @param {object} task 任务对象
 */
export async function handleTribulationStrike(task) {
  const { userId, current_strike, total_strikes, group_id } = task;

  try {
    const data = await DAL.getAllPlayerData(userId);
    if (!data || !data.player) return;

    let player = data.player;

    const resistance = calculateDujieResistance(player);
    const power_n = 1380, power_m = 280;
    const variable = Math.random() * (power_m - power_n) + power_n + current_strike / 10;

    if (resistance < variable) {
      player.当前血量 = 0;
      player.修为 = Math.floor(player.修为 * 0.5);
      await DAL.savePlayer(userId, player);
      const failMsg = `第${current_strike}道天雷落下(雷伤:${variable.toFixed(2)} | 你的雷抗:${resistance})，可惜【${player.名号}】未能抵挡，身死道消，渡劫失败！`;
      await Notifier.notify(group_id, userId, failMsg);
      return;
    }

    const damage = Math.floor(player.血量上限 * 0.25);
    player.当前血量 -= damage;
    await Notifier.notify(group_id, userId, `第${current_strike}道天雷落下(雷伤:${variable.toFixed(2)} | 你的雷抗:${resistance})，【${player.名号}】成功抵挡！但仍受重创，剩余血量: ${player.当前血量}`);

    if (player.当前血量 <= 0) {
      player.当前血量 = 0;
      await DAL.savePlayer(userId, player);
      await Notifier.notify(group_id, userId, `【${player.名号}】虽抗下天雷，但已力竭，遗憾失败！`);
      return;
    }

    if (current_strike < total_strikes) {
      const nextStrikeTime = Date.now() + LEI_JIE_INTERVAL;
      const nextTaskPayload = { ...task, current_strike: current_strike + 1 };
      await scheduleTask(nextTaskPayload, nextStrikeTime);
    } else {
      const oldLevel = Level_list.find(item => item.level_id == player.level_id)?.level || '未知境界';
      player.level_id += 1;
      player.power_place = 0;
      const newLevel = Level_list.find(item => item.level_id == player.level_id)?.level || '飞升成仙';
      await Notifier.notify(group_id, userId, `恭喜【${player.名号}】成功渡过所有天劫，从【${oldLevel}】突破至【${newLevel}】！`);
    }

    await DAL.savePlayer(userId, player);

  } catch (error) {
    // 在独立进程中，我们只能用 console.error
    console.error(`[渡劫逻辑] 处理用户 ${userId} 的第 ${current_strike} 道雷劫时出错:`, error);
  }
}