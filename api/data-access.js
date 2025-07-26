// /api/data-access.js (最终独立版)

import { createClient } from 'redis';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';

// --- 创建独立的 Redis 客户端 ---
const redisConfigPath = path.join(process.cwd(), 'config', 'config', 'redis.yaml');
const redisConfig = YAML.parse(fs.readFileSync(redisConfigPath, 'utf8'));
const redisClient = createClient({
  url: `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`
});
redisClient.connect().catch(err => console.error('[DAL] 独立Redis客户端连接失败:', err));

const ASSOCIATION_KEY_PREFIX = 'XinghanXiuxian:Data:Association:';

// --- 存在性检查 ---
export async function existPlayer(userId) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  const result = await redisClient.exists(mainKey);
  return result === 1;
}

// --- 数据读写 ---
export async function getAllPlayerData(userId) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  const data = await redisClient.hGetAll(mainKey);
  if (!data || Object.keys(data).length === 0) return null;
  try {
    return {
      player: JSON.parse(data.player || '{}'),
      najie: JSON.parse(data.najie || '{}'),
      equipment: JSON.parse(data.equipment || '{}')
    };
  } catch (error) {
    console.error(`[DAL] 解析用户 ${userId} 的数据失败:`, error);
    return null;
  }
}

export async function savePlayer(userId, playerData) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  await redisClient.hSet(mainKey, 'player', JSON.stringify(playerData));
}

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

/**
 * 获取宗门信息
 * @param {string} sectName - 宗门名称
 * @returns {Promise<object|null>}
 */
export async function getAssociation(sectName) {
  const key = `${ASSOCIATION_KEY_PREFIX}${sectName}`;
  const data = await redisClient.get(key);
  if (!data) {
    return null;
  }
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error(`[DAL] 解析宗门数据失败, Sect: ${sectName}`, error);
    return null;
  }
}

/**
 * 保存/更新宗门信息
 * @param {string} sectName - 宗门名称
 * @param {object} sectData - 完整的宗门数据对象
 * @returns {Promise<void>}
 */
export async function saveAssociation(sectName, sectData) {
  const key = `${ASSOCIATION_KEY_PREFIX}${sectName}`;
  await redisClient.set(key, JSON.stringify(sectData));
}