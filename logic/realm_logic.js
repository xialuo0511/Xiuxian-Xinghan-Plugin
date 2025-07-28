import * as DAL from '../api/data-access.js';
import * as Notifier from '../handlers/notifier.js';
import { scheduleTask } from '../api/task-scheduler.js';
import data from '../model/XiuxianData.js';
import config from '../model/Config.js';
import { battleEngine } from './battle_logic.js';

const xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');

/**
 * 玩家进入探索地点（秘境、禁地等）的核心逻辑
 * @param {string} userId 玩家ID
 * @param {string} realmName 地点名称
 * @param {'秘境'|'禁地'|'仙府'|'仙境'|'遗迹'} realmType 地点类型
 * @param {object} e 消息对象
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function enterRealm(userId, realmName, realmType, e) {
  const realmDataList = {
    '秘境': data.didian_list,
    '禁地': data.forbiddenarea_list,
    '仙府': data.timeplace_list,
    '仙境': data.Fairyrealm_list,
    '遗迹': data.yiji_list
  };

  const realmInfo = realmDataList[realmType].find(item => item.name === realmName);
  if (!realmInfo) {
    return { success: false, message: `未知的${realmType}：${realmName}` };
  }

  let checkResult = { success: true, message: '' };
  const transactionSuccess = await DAL.transaction_update(userId, (player) => {
    // --- 前置条件检查 ---
    if (player.灵石 < realmInfo.Price) {
      checkResult = { success: false, message: `没有灵石寸步难行,攒到${realmInfo.Price}灵石才够哦~` };
      return false;
    }
    if (realmInfo.experience && player.修为 < realmInfo.experience) {
      checkResult = { success: false, message: `你需要积累${realmInfo.experience}修为，才能抵抗此地威压！` };
      return false;
    }
    // ... 可在此添加更多如等级、职业等特定检查 ...

    // 扣除门票
    player.灵石 -= realmInfo.Price;
    if (realmInfo.experience) {
      player.修为 -= realmInfo.experience;
    }
    return true;
  });

  if (!transactionSuccess) {
    return checkResult;
  }

  // const duration = xiuxianConfigData.CD.secretplace * 60 * 1000;
  const duration = 60 * 1000;
  const startTime = Date.now();
  const endTime = startTime + duration;

  // 设置玩家行动状态
  const taskPayload = {
    type: 'settleRealm',
    userId: userId,
    startTime: startTime,
    endTime: endTime,
    groupId: e.group_id,
    realmInfo: { name: realmName, type: realmType }
  };

  // 2. 将其字符串化，用于后续的存储和删除
  const taskPayloadString = JSON.stringify(taskPayload);

  // 3. 设置玩家行动状态时，把这个字符串也存进去
  const actionDetails = {
    action: `${realmType}探索`,
    startTime: startTime,
    endTime: endTime,
    groupId: e.group_id,
    realmInfo: { name: realmName, type: realmType },
    taskPayloadString: taskPayloadString // <-- 关键改动
  };
  await redis.set(`XinghanXiuxian:Player:${userId}:action`, JSON.stringify(actionDetails));

  // 4. 调度后台任务
  await scheduleTask(taskPayload, endTime);

  return { success: true, message: `开始${realmType}【${realmName}】的探索, ${duration / 60000}分钟后归来!` };
}


/**
 * [任务处理器] 结算探索的核心逻辑
 * @param {object} task - 任务载荷
 */
export async function settleRealm(task) {
  const { userId, realmInfo, groupId } = task;
  const player = (await DAL.getAllPlayerData(userId))?.player;
  if (!player) return;

  const realmDataList = {
    '秘境': data.didian_list,
    '禁地': data.forbiddenarea_list,
    '仙府': data.timeplace_list,
    '仙境': data.Fairyrealm_list,
    '遗迹': data.yiji_list
  };
  const realm = realmDataList[realmInfo.type].find(item => item.name === realmInfo.name);
  if (!realm) return;

  // 1. 遭遇怪物并战斗
  const monster = findEncounterMonster(realm, player); // 查找遭遇的怪物
  const A_battle_data = { ...player, id: userId, equipment: (await DAL.getAllPlayerData(userId)).equipment };
  const B_battle_data = { ...monster, id: 'monster' };
  const battleResult = await battleEngine(A_battle_data, B_battle_data);

  // 2. 计算掉落和奖励
  let rewards = { items: [], xiuwei: 0, xueqi: 0 };
  if (battleResult.A_win) {
    rewards = calculateLoot(realm, player);
  } else {
    rewards.xiuwei = 800; // 失败保底奖励
  }

  // 3. 更新玩家数据
  await DAL.transaction_update(userId, async (p) => {
    p.修为 += rewards.xiuwei;
    p.血气 += rewards.xueqi;
    p.当前血量 = battleResult.A_player_final.当前血量;

    // 在事务内部处理物品添加，确保数据一致性
    for (const item of rewards.items) {
      await DAL.updateNajieItem(userId, item.name, item.class, item.amount, item.pinji);
    }
    return true;
  });

  const renderData = {
    A_win: battleResult.A_win,
    battleLog: battleResult.msg.slice(-1)[0], // 只取最后一句总结
    rewards: rewards,
    realmName: realm.name
  };

  // 4. 将“渲染请求”通过 Notifier 发送出去
  await Notifier.notify(groupId, userId, {
    render: 'secret_place_log', // 告诉接收方要使用哪个模板
    data: renderData // 绘图所需的数据
  });
}


function findEncounterMonster(realm, player) {
  return data.monster_list[0];
}

function calculateLoot(realm, player) {
  let items = [];
  let messages = [];

  const x = xiuxianConfigData.SecretPlace.one;
  const y = xiuxianConfigData.SecretPlace.two;
  const z = xiuxianConfigData.SecretPlace.three;
  const rand = Math.random();

  let chosenTier, tierName;
  if (rand < z && realm.three.length > 0) {
    chosenTier = realm.three;
    tierName = '高级';
  } else if (rand < y && realm.two.length > 0) {
    chosenTier = realm.two;
    tierName = '中级';
  } else if (rand < x && realm.one.length > 0) {
    chosenTier = realm.one;
    tierName = '低级';
  }

  if (chosenTier) {
    const loot = chosenTier[Math.floor(Math.random() * chosenTier.length)];
    let amount = 1;
    // ... 可根据物品类型和玩家幸运值等计算数量 n ...
    if (player.幸运 > Math.random()) {
      amount *= 2;
      messages.push('你感到福源深厚，获得了双倍奖励！');
    }

    items.push({ ...loot, amount: amount });
    messages.push(`你在秘境深处发现了${tierName}奖励: [${loot.name}]!`);
  } else {
    messages.push('你仔细探索了一番，结果一无所获...');
  }

  return {
    items: items,
    xiuwei: 2000 + 100 * player.level_id,
    xueqi: 2000 + 100 * player.Physique_id,
    messages: messages
  };
}