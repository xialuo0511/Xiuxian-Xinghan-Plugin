import * as DAL from '../api/data-access.js';

/**
 * 执行指定活动key的物品清理任务
 * @param {object} task - 任务负载, 包含 { type: 'cleanupExpiredItems', eventKey: '...' }
 */
export async function cleanupExpiredItems(task) {
  if (!task || !task.eventKey) {
    console.error('[清理任务] 任务负载无效，缺少 eventKey。');
    return;
  }

  const eventKeyToClean = task.eventKey;
  console.log(`[工作单元] 开始为活动 [${eventKeyToClean}] 执行过期物品清理任务...`);

  let cursor = '0';
  let playersScanned = 0;
  do {
    const scanResult = await redis.scan(cursor, 'MATCH', 'XinghanXiuxian:Data:Player:*', 'COUNT', '100');
    cursor = scanResult.cursor ?? scanResult[0];
    const keys = scanResult.keys ?? scanResult[1];

    for (const playerKey of keys) {
      const userId = playerKey.split(':').pop();

      await DAL.transaction_update(userId, (player, equipment, najie) => {
        let itemsRemovedCount = 0;
        for (const category in najie) {
          if (Array.isArray(najie[category])) {
            najie[category] = najie[category].filter(item => {
              // 只移除 eventKey 完全匹配的物品
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
    }
    playersScanned += keys.length;

  } while (cursor !== '0' && cursor !== 0);

  console.log(`[清理任务] 活动 [${eventKeyToClean}] 的清理完成！共扫描了 ${playersScanned} 位玩家。`);
}