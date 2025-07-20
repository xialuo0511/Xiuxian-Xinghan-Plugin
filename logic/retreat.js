import * as DAL from '../api/data-access.js';
import * as Notifier from '../handlers/notifier.js';
import fs from 'fs';
import path from 'path';
const pluginRoot = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin');
const dataPath = path.join(pluginRoot, 'resources', 'data');
const configPath = path.join(pluginRoot, 'config', 'config');

const Level_list = JSON.parse(fs.readFileSync(path.join(dataPath, 'Level', '练气境界.json'), 'utf-8'));
const xiuxianConfigData = JSON.parse(fs.readFileSync(path.join(configPath, 'xiuxian.json'), 'utf-8'));

/**
 * [新增] 从 xiuxian.js 中剥离出来的、纯净的 player_efficiency 函数
 * @param {object} player 玩家数据对象
 */
function calculate_player_efficiency(player) {
  let efficiency = player.修炼效率提升 || 0;
  return efficiency;
}

/**
 * 闭关结算的核心逻辑
 * @param {object} task - 任务载荷
 * @param {boolean} [isRandom=true] - 是否触发随机事件（提前出关时不触发）
 */
export async function settleBiguan(task, isRandom = true) {
  const { userId, startTime, endTime, groupId } = task;

  // 计算实际闭关时长
  const actualEndTime = isRandom ? endTime : Date.now(); // 正常结束用计划时间，提前结束用当前时间
  let durationMinutes = Math.floor((actualEndTime - startTime) / 60000);

  // 沿用旧逻辑，确保收益计算方式一致
  const y = xiuxianConfigData.biguan.time;
  const x = xiuxianConfigData.biguan.cycle;
  for (var i = x; i > 0; i--) {
    if (durationMinutes >= y * i) {
      durationMinutes = y * i;
      break;
    }
  }
  if (durationMinutes < y) {
    await Notifier.notify(groupId, userId, "闭关时间过短，未获得任何收益。");
    return;
  }

  const playerData = (await DAL.getAllPlayerData(userId))?.player;
  if (!playerData) return;

  const now_level_id = Level_list.find(item => item.level_id == playerData.level_id)?.level_id || 1;
  const size = xiuxianConfigData.biguan.size;
  const xiuwei = parseInt((size * now_level_id) * (playerData.修炼效率提升 + 1));
  const blood = parseInt(playerData.血量上限 * 0.02);
  let other_xiuwei = 0;

  let msg = [`【${playerData.名号}】闭关结束！`];

  let rand = Math.random();
  if (isRandom) {
    if (rand < 0.2) {
      rand = Math.trunc(rand * 10) + 45;
      other_xiuwei = rand * durationMinutes;
      // xueqi = Math.trunc(rand * time);
      msg.push("\n本次闭关顿悟,额外增加修为:" + rand * durationMinutes);
    }
    //走火入魔
    else if (rand > 0.8) {
      rand = Math.trunc(rand * 10) + 5;
      other_xiuwei = -1 * rand * durationMinutes;
      // xueqi = Math.trunc(rand * time);
      msg.push("\n由于你闭关时隔壁装修,导致你差点走火入魔,修为下降" + rand * durationMinutes);

    }
  }

  const totalXiuwei = Math.trunc(xiuwei * durationMinutes + other_xiuwei);
  const totalBlood = Math.trunc(blood * durationMinutes);

  // 使用 DAL 更新数据
  await DAL.transaction_update(userId, (player) => {
    player.修为 += totalXiuwei;
    player.当前血量 = Math.min(player.血量上限, player.当前血量 + totalBlood);
  });

  msg.push(`\n增加修为: ${totalXiuwei}`);
  msg.push(`\n恢复血量: ${totalBlood}`);

  await Notifier.notify(groupId, userId, msg.join(''));
}