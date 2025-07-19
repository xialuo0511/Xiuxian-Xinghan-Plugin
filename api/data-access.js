// /api/data-access.js (最终决定版 v5 - 包含独立的全局Redis客户端)

import { createClient } from 'redis';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';
import { __PATH } from '../apps/Xiuxian/xiuxian.js';

// --- [核心修正] 创建插件专属的、全局的 Redis 客户端 ---
const redisConfigPath = path.join(process.cwd(), 'config', 'config', 'redis.yaml');
const redisConfig = YAML.parse(fs.readFileSync(redisConfigPath, 'utf8'));

// 创建客户端实例
export const redisClient = createClient({
  url: `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`,
});

// 监听错误事件
redisClient.on('error', (err) => {
  logger.error('[星瀚修仙DAL] Redis 客户端发生错误:', err);
});

// 立即连接，并在后台保持连接
redisClient.connect().then(() => {
  logger.info('[星瀚修仙DAL] 专属Redis客户端连接成功。');
}).catch((err) => {
  logger.error('[星瀚修仙DAL] 专属Redis客户端连接失败:', err);
});

// --- 状态与存在性检查 ---

/**
 * [新] 检查玩家存档是否存在于 Redis 中
 * @param {string} userId 玩家QQ号
 * @returns {Promise<boolean>}
 */
export async function existPlayer(userId) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  // [修正] 使用我们自己创建的 redisClient
  const result = await redisClient.exists(mainKey);
  return result === 1;
}

/**
 * [新] 获取玩家当前正在执行的动作。
 * @param {string} userId 玩家QQ号
 * @returns {Promise<object|null>}
 */
export async function getPlayerAction(userId) {
  const actionKey = `XinghanXiuxian:Player:${userId}:action`;
  const actionJson = await redisClient.get(actionKey);

  if (!actionJson) return null;

  try {
    const actionDetails = JSON.parse(actionJson);
    if (Date.now() > actionDetails.end_time) {
      await redisClient.del(actionKey);
      return null;
    }
    return actionDetails;
  } catch (e) {
    logger.error(`[DAL] 解析玩家 ${userId} 的 action 数据失败:`, actionJson, e);
    await redisClient.del(actionKey);
    return null;
  }
}

// --- 数据读取 (GET) ---

/**
 * 获取并完整解析一个玩家的所有数据
 * @param {string} userId 玩家QQ号
 * @returns {Promise<{player: object, najie: object, equipment: object}|null>}
 */
export async function getAllPlayerData(userId) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  const data = await redisClient.hGetAll(mainKey);
  if (!data || Object.keys(data).length === 0) return null;
  try {
    return {
      player: data.player ? JSON.parse(data.player) : {},
      najie: data.najie ? JSON.parse(data.najie) : {},
      equipment: data.equipment ? JSON.parse(data.equipment) : {}
    };
  } catch (error) {
    logger.error(`[DAL] 解析用户 ${userId} 的数据失败:`, error);
    return null;
  }
}

// --- 数据写入 (SET/UPDATE) ---

/**
 * 覆写式保存玩家的核心数据
 * @param {string} userId 玩家QQ号
 * @param {object} playerData 完整的玩家核心数据对象
 */
export async function savePlayer(userId, playerData) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  await redisClient.hSet(mainKey, 'player', JSON.stringify(playerData));
}

// ... saveNajie 和 saveEquipment 函数也应使用 redisClient ...
// 为确保完整性，我将它们也一并提供

/**
 * 覆写式保存玩家的纳戒数据
 * @param {string} userId 玩家QQ号
 * @param {object} najieData 完整的纳戒数据对象
 */
export async function saveNajie(userId, najieData) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  await redisClient.hSet(mainKey, 'najie', JSON.stringify(najieData));
}

/**
 * 覆写式保存玩家的装备数据
 * @param {string} userId 玩家QQ号
 * @param {object} equipmentData 完整的装备数据对象
 */
export async function saveEquipment(userId, equipmentData) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  await redisClient.hSet(mainKey, 'equipment', JSON.stringify(equipmentData));
}


/**
 * 使用事务安全地更新玩家数据
 * @param {string} userId 玩家QQ号
 * @param {(playerData: object) => void} updateFunction
 * @returns {Promise<boolean>}
 */
export async function transaction_update(userId, updateFunction) {
  // 事务需要一个独立的连接来执行 WATCH
  const transactionClient = redisClient.duplicate();
  await transactionClient.connect();

  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  const fieldName = 'player';

  try {
    await transactionClient.watch(mainKey);

    const playerJson = await transactionClient.hGet(mainKey, fieldName);
    if (!playerJson) {
      return false;
    }

    const playerData = JSON.parse(playerJson);
    updateFunction(playerData);

    const multi = transactionClient.multi();
    multi.hSet(mainKey, fieldName, JSON.stringify(playerData));

    const result = await multi.exec();

    if (result === null) {
      return await transaction_update(userId, updateFunction);
    }
    return true;

  } catch (error) {
    logger.error(`[DAL-TX] 更新用户 ${userId} 数据时发生错误:`, error);
    return false;
  } finally {
    await transactionClient.quit();
  }
}