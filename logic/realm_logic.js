import * as DAL from '../api/data-access.js';
import * as Notifier from '../handlers/notifier.js';
import { scheduleTask } from '../api/task-scheduler.js';
import data from '../model/XiuxianData.js';
import config from '../model/Config.js';
import { battleEngine } from './battle_logic.js';

const xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');

/**

 * [统一函数] 玩家进入探索地点（秘境、禁地等）的核心逻辑

 * @param {string} userId 玩家ID

 * @param {string} realmName 地点名称

 * @param {'秘境'|'禁地'|'仙境'} realmType 地点类型

 * @param {object} e 消息对象

 * @param {number} runCount 轮数 (沉迷功能)

 * @returns {Promise<{success: boolean, message: string}>}

 */

export async function enterRealm(userId, realmName, realmType, e, runCount = 1) {

  if (runCount <= 0 || runCount > 10) {

    return { success: false, message: '轮数必须在1到10之间。' };

  }


  const isAddiction = runCount > 1;

  const realmDataList = {

    '秘境': data.didian_list,

    '禁地': data.forbiddenarea_list,

    '仙境': data.Fairyrealm_list

  };


  const realmInfo = realmDataList[realmType]?.find(item => item.name === realmName);

  if (!realmInfo) {

    return { success: false, message: `未知的${realmType}：${realmName}` };

  }


  const singleDuration = xiuxianConfigData.CD.secretplace * 60 * 1000;

  const totalRuns = isAddiction ? 10 * runCount : 1;

  const totalDuration = singleDuration * totalRuns;


  let checkResult = { success: true, message: '' };

  const transactionSuccess = await DAL.transaction_update(userId, (player, equipment, najie) => {

    const costMultiplier = isAddiction ? totalRuns : 1;

    const totalCost = realmInfo.Price * costMultiplier;


    if (player.灵石 < totalCost) {

      checkResult = { success: false, message: `灵石不足, 需要${totalCost}灵石。` };

      return false;

    }


    if (isAddiction) {

      const keyName = '秘境之匙';

      const keyCategory = '道具';

      const keyItem = najie[keyCategory]?.find(item => item.name === keyName);

      if (!keyItem || keyItem.数量 < runCount) {

        checkResult = { success: false, message: '你没有足够的[秘境之匙]来进行沉迷探索。' };

        return false;

      }

      keyItem.数量 -= runCount;

    }


    player.灵石 -= totalCost;

    if (realmInfo.experience) {

      player.修为 -= (realmInfo.experience * costMultiplier);

    }

    return true;

  });


  if (!transactionSuccess) {

    return checkResult;

  }


  const startTime = Date.now();

  const endTime = isAddiction ? startTime + totalDuration : startTime + singleDuration;


  const actionName = isAddiction ? `沉迷${realmType}探索` : `${realmType}探索`;


  const actionDetails = {

    action: actionName,

    startTime: startTime,

    endTime: endTime,

    groupId: e.group_id,

    realmInfo: { name: realmName, type: realmType }

  };


  const taskPayload = {

    type: 'settleRealm',

    userId: userId,

    startTime: startTime,

    endTime: startTime + singleDuration,

    groupId: e.group_id,

    realmInfo: { name: realmName, type: realmType }

  };


  if (isAddiction) {

    taskPayload.remainingRuns = totalRuns - 1;

  }


  await DAL.setPlayerAction(userId, actionDetails);

  await scheduleTask(taskPayload, startTime + singleDuration);


  if (isAddiction) {

    return {
      success: true,
      message: `开始在${realmType}【${realmName}】沉迷探索, 共 ${totalRuns} 次, 预计总耗时 ${totalDuration / 60000} 分钟。`
    };

  }

  return { success: true, message: `开始${realmType}【${realmName}】的探索, ${singleDuration / 60000}分钟后归来!` };

}


/**

 * [任务处理器] 结算探索的核心逻辑

 * @param {object} task - 任务载荷

 */
export async function settleRealm(task) {
  const { userId, realmInfo, groupId } = task;
  const actionKey = `XinghanXiuxian:Player:${userId}:action`;
  try {
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

    // 5. [新增] 检查并处理循环任务
    if (task.remainingRuns && task.remainingRuns > 0) {
      const nextTaskPayload = { ...task, remainingRuns: task.remainingRuns - 1 };
      const singleDuration = task.endTime - task.startTime;
      const nextEndTime = Date.now() + singleDuration;

      await scheduleTask(nextTaskPayload, nextEndTime);

      // 更新总状态的结束时间
      const currentAction = await DAL.getPlayerAction(userId);
      if (currentAction) {
        currentAction.endTime = nextEndTime;
        await DAL.setPlayerAction(userId, currentAction);
      }

      // 发送进度通知
      await Notifier.notify(groupId, userId, {
        message: `本次探索结算完成，剩余 ${task.remainingRuns} 次探索。`
      });

      return; // 提前返回，不执行 finally 中的清理
    }

  } finally {
    // 无论成功与否，都删除对应的动作
    await DAL.deletePlayerAction(userId);
  }
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