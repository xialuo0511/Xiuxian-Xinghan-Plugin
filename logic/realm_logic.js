import * as DAL from '../api/data-access.js';
import * as Notifier from '../handlers/notifier.js';
import { scheduleTask } from '../api/task-scheduler.js';
import data from '../model/XiuxianData.js';
import config from '../model/Config.js';//
// import puppeteer from '../../../lib/puppeteer/puppeteer.js';
// import Show from '../model/show.js';
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
  const playerAllData = await DAL.getAllPlayerData(userId);
  if (!playerAllData) return;

  let player = playerAllData.player;

  const realmDataList = {
    '秘境': data.didian_list, '禁地': data.forbiddenarea_list,
    '仙府': data.timeplace_list, '仙境': data.Fairyrealm_list, '遗迹': data.yiji_list
  };
  const realm = realmDataList[realmInfo.type]?.find(item => item.name === realmInfo.name);
  if (!realm) return;

  const monster = findEncounterMonster(realm, player);
  const A_battle_data = { ...player, id: userId, equipment: playerAllData.equipment, 仙宠: player.仙宠 };
  const B_battle_data = { ...monster, id: 'monster', 学习的功法: [], 仙宠: null };
  const battleResult = await battleEngine(A_battle_data, B_battle_data);

  let rewards = { items: [], xiuwei: 0, xueqi: 0, messages: [] };
  if (battleResult.A_win) {
    rewards = calculateLoot(realm, player);
    rewards.messages.push(`不巧撞见【${monster.名号}】, 经过一番战斗, 你成功击败了对手!`);
  } else {
    rewards.xiuwei = 800;
    rewards.messages.push(`不巧撞见【${monster.名号}】, 经过一番战斗, 你败下阵来, 还好跑得快...`);
  }

  // 【核心修正】: 将所有数据更新都放入一个事务中，并且回调是同步的
  await DAL.transaction_update(userId, (p, eq, najie) => {
    p.修为 += rewards.xiuwei;
    p.血气 += rewards.xueqi;
    p.当前血量 = battleResult.A_player_final.当前血量;

    // 在事务内部直接修改 najie 对象来添加物品
    for (const item of rewards.items) {
      const itemTemplate = data[item.class + '_list']?.find(i => i.name === item.name);
      if (itemTemplate) {
        const existingItem = najie[item.class]?.find(i => i.name === item.name);
        if (existingItem) {
          existingItem.数量 += item.amount;
        } else {
          najie[item.class].push({ ...itemTemplate, 数量: item.amount, islockd: 0 });
        }
      }
    }
    return true;
  });

  // 【修正】: 移除图片生成，改为发送安全的文本通知
  let rewardMsg = rewards.messages.join('\n');
  rewardMsg += `\n获得修为: ${rewards.xiuwei}, 获得血气: ${rewards.xueqi}`;
  rewards.items.forEach(i => rewardMsg += `, 获得 [${i.name}]*${i.amount}`);
  await Notifier.notify(groupId, userId, `在【${realm.name}】的探索结束！\n${rewardMsg}`);
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