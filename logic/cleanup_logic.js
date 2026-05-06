import * as DAL from '../api/data-access.js';
import { createNewClient } from '../workers/redis-client.js';
import { loadItemConfig } from '../model/ConfigLoader.js';

// 加载渔获配置，创建渔获物品名称集合（用于区分渔获和鱼竿/鱼饵）
const allCatches = loadItemConfig('fishing_items.yaml');
const catchableItemNames = new Set(allCatches.map(c => c.name));

/**
 * 执行指定活动key的物品和临时数据清理任务
 * @param {object} task - 任务负载, 包含 { type: 'cleanupExpiredItems', eventKey: '...' }
 */
export async function cleanupExpiredItems(task) {
  if (!task || !task.eventKey) {
    console.error('[清理任务] 任务负载无效，缺少 eventKey。');
    return;
  }

  const redisClient = createNewClient();
  await redisClient.connect();

  try {
    const eventKeyToClean = task.eventKey;
    console.log(`[工作单元] 开始为活动 [${eventKeyToClean}] 执行数据清理任务...`);

    let cursor = '0';
    let playersScanned = 0;
    do {
      const scanResult = await redisClient.scan(cursor, 'MATCH', 'XinghanXiuxian:Data:Player:*', 'COUNT', '100');
      cursor = scanResult.cursor ?? scanResult[0];
      const keys = scanResult.keys ?? scanResult[1];

      for (const playerKey of keys) {
        const userId = playerKey.split(':').pop();

        // 1. 统计渔获并兑换灵石，然后清理纳戒中的过期物品
        await DAL.transaction_update(userId, (player, equipment, najie) => {
          let totalFishCount = 0;
          let itemsRemovedCount = 0;

          // 先统计渔获数量（仅统计渔获，不含鱼竿、鱼饵）
          for (const category in najie) {
            if (Array.isArray(najie[category])) {
              for (const item of najie[category]) {
                if (item && item.eventKey === eventKeyToClean && catchableItemNames.has(item.name)) {
                  totalFishCount += item.数量 || 0;
                }
              }
            }
          }

          // 计算并发放灵石奖励（5只鱼 = 1w灵石）
          const lingshiReward = Math.floor(totalFishCount / 5) * 10000;
          if (lingshiReward > 0) {
            player.灵石 = (player.灵石 || 0) + lingshiReward;
            console.log(`[活动结算] 玩家 ${userId} 共有 ${totalFishCount} 个渔获，兑换获得 ${lingshiReward} 灵石。`);
          }

          // 清理所有活动物品
          for (const category in najie) {
            if (Array.isArray(najie[category])) {
              najie[category] = najie[category].filter(item => {
                if (item && item.eventKey === eventKeyToClean) {
                  itemsRemovedCount++;
                  return false;
                }
                return true;
              });
            }
          }
          if (itemsRemovedCount > 0) {
            console.log(`[清理任务] 从玩家 ${userId} 纳戒中移除了 ${itemsRemovedCount} 件 [${eventKeyToClean}] 的物品。`);
          }
        });

        // 2. 清理与该活动相关的其他临时Redis键
        const keysToDelete = [
          // 钓鱼装备记录
          `XinghanXiuxian:player_fishing_gear:${userId}`,
          // 渔友商行购买记录 (包含eventKey，精确匹配)
          `XinghanXiuxian:fish_shop_history:${userId}:${eventKeyToClean}`,
          // 钓鱼冷却记录
          `XinghanXiuxian:fishing_cd:${userId}`,
          // 端午入夏小游戏进度记录
          `XinghanXiuxian:SummerMiniEvent:${eventKeyToClean}:${userId}`
        ];

        const deletedCount = await redisClient.del(keysToDelete);
        if (deletedCount > 0) {
          console.log(`[清理任务] 为玩家 ${userId} 清理了 ${deletedCount} 个与活动相关的临时键。`);
        }
      }
      playersScanned += keys.length;

    } while (cursor !== '0' && cursor !== 0);

    console.log(`[清理任务] 活动 [${eventKeyToClean}] 的清理完成！共扫描了 ${playersScanned} 位玩家。`);
  } catch (error) {
    console.error(`[清理任务] 执行时发生错误:`, error);
  } finally {
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  }
}
