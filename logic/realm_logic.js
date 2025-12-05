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
 * @param {boolean} isAddiction 是否为沉迷模式
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function enterRealm(userId, realmName, realmType, e, runCount = 1, isAddiction = false) {
    if (runCount <= 0 || runCount > 10) {
        return { success: false, message: '轮数必须在1到10之间。' };
    }

    const realmDataList = {
        '秘境': data.didian_list,
        '禁地': data.forbiddenarea_list,
        '仙境': data.Fairyrealm_list,
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
        const costMultiplier = totalRuns; // 沉迷模式按总次数算，单次就是1
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
                checkResult = { success: false, message: '你没有足够的[秘境之匙]来进行沉迷探索。'};
                return false;
            }
            keyItem.数量 -= runCount;
        }
        
        player.灵石 -= totalCost;
        if (realmInfo.experience) {
            // 确保修为也乘以正确的倍数
            player.修为 -= (realmInfo.experience * costMultiplier);
        }
        return true;
    });

    if (!transactionSuccess) {
        return checkResult;
    }

    const startTime = Date.now();
    // 最终结束时间无论是沉迷还是单次，都是总时长
    const endTime = startTime + totalDuration; 
    
    const actionName = isAddiction ? `沉迷${realmType}探索` : `${realmType}探索`;

    const actionDetails = {
        action: actionName,
        startTime: startTime,
        endTime: endTime,
        groupId: e.group_id,
        realmInfo: { name: realmName, type: realmType },
    };

    const taskPayload = {
        type: 'settleRealm',
        userId: userId,
        startTime: startTime,
        endTime: startTime + singleDuration,
        groupId: e.group_id,
        realmInfo: { name: realmName, type: realmType },
    };
    
    if (isAddiction && totalRuns > 1) {
        taskPayload.remainingRuns = totalRuns - 1;
    }

    await DAL.setPlayerAction(userId, actionDetails);
    await scheduleTask(taskPayload, startTime + singleDuration);
    
    if (isAddiction) {
        return { success: true, message: `开始在${realmType}【${realmName}】沉迷探索, 共 ${totalRuns} 次, 预计总耗时 ${totalDuration / 60000} 分钟。` };
    }
    return { success: true, message: `开始${realmType}【${realmName}】的探索, ${singleDuration / 60000}分钟后归来!` };
}


/**
 * [任务处理器] 结算探索的核心逻辑
 * @param {object} task - 任务载荷
 */
export async function settleRealm(task) {
  const { userId, realmInfo, groupId } = task;
  let battleResult, rewards, realm;

  try {
    // --- 核心结算逻辑 ---
    const player = (await DAL.getAllPlayerData(userId))?.player;
    if (!player) {
      console.log(`[settleRealm] 玩家 ${userId} 不存在，任务终止。`);
      return;
    }

    const realmDataList = {
        '秘境': data.didian_list,
        '禁地': data.forbiddenarea_list,
        '仙府': data.timeplace_list,
        '仙境': data.Fairyrealm_list,
        '遗迹': data.yiji_list
    };
    realm = realmDataList[realmInfo.type].find(item => item.name === realmInfo.name);
    if (!realm) {
      console.log(`[settleRealm] 地点 ${realmInfo.name} 不存在，任务终止。`);
      return;
    }

    const monster = findEncounterMonster(realm, player);
    const A_battle_data = { ...player, id: userId, equipment: (await DAL.getAllPlayerData(userId)).equipment };
    const B_battle_data = { ...monster, id: 'monster' };
    battleResult = await battleEngine(A_battle_data, B_battle_data);

    rewards = { items: [], xiuwei: 0, xueqi: 0 };
    if (battleResult.A_win) {
        rewards = calculateLoot(realm, player);
    } else {
        rewards.xiuwei = 800;
    }

    await DAL.transaction_update(userId, async (p) => {
        p.修为 += rewards.xiuwei;
        p.血气 += rewards.xueqi;
        p.当前血量 = battleResult.A_player_final.当前血量;
        for (const item of rewards.items) {
            await DAL.updateNajieItem(userId, item.name, item.class, item.amount, item.pinji);
        }
        return true;
    });

  } catch (error) {
    console.error(`[settleRealm] 核心结算逻辑出错 (用户: ${userId}):`, error);
    // 核心逻辑出错，必须清理状态防止卡死
    await DAL.deletePlayerAction(userId);
    // 可以选择通知用户任务异常
    await Notifier.notify(groupId, userId, { message: '探索修行时遇到意外，已强制中断。' });
    return;
  }

  // --- 后续处理：循环或清理 ---
  if (task.remainingRuns && task.remainingRuns > 0) {
    // 是循环任务，先通知，再调度
    try {
      const nextTaskPayload = { ...task, remainingRuns: task.remainingRuns - 1 };
      const singleDuration = task.endTime - task.startTime;
      const nextEndTime = Date.now() + singleDuration;

      await scheduleTask(nextTaskPayload, nextEndTime);

    } catch(e) {
      console.error(`[settleRealm] 循环任务调度或通知出错 (用户: ${userId}):`, e);
      // 此处出错也应中断，防止无限循环
      await DAL.deletePlayerAction(userId);
      await Notifier.notify(groupId, userId, { message: '沉迷探索因意外中断。' });
    }
  } else {
    // 这是最后一次或单次任务，清理状态
    await DAL.deletePlayerAction(userId);
  }

  // 将其包裹在独立的 try-catch 中，防止它失败时影响核心状态
  try {
    const renderData = {
        A_win: battleResult.A_win,
        battleLog: battleResult.msg.slice(-1)[0],
        rewards: rewards,
        realmName: realm.name,
        remainingRuns: task.remainingRuns || 0 // 将剩余次数添加到渲染数据中
    };
    await Notifier.notify(groupId, userId, {
        render: 'secret_place_log',
        data: renderData
    });
  } catch (renderError) {
    console.error(`[settleRealm] 渲染战报图片失败 (用户: ${userId}):`, renderError);
    // 即使图片发送失败，也通知用户已结算
    await Notifier.notify(groupId, userId, {
        message: '探索已结算，但战报生成失败。'
    });
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