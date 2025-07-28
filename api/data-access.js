// /api/data-access.js (最终独立版)

import { createClient } from 'redis';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';
import data from '../model/XiuxianData.js';


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
  try {
    const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
    const data = await redisClient.hGetAll(mainKey);
    if (!data || Object.keys(data).length === 0) return null;
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

/**
 * 【全新】更新纳戒物品（增加/减少），这是一个可以在任何地方安全调用的函数
 * @param {string} userId 玩家ID
 * @param {string} itemName 物品名称
 * @param {string} itemClass 物品类别
 * @param {number} quantity 数量 (正数增加, 负数减少)
 * @param {number|null} pinji 品级 (数字0-6), 仅对装备有效
 * @returns {Promise<boolean>} 操作是否成功
 */
export async function updateNajieItem(userId, itemName, itemClass, quantity, pinji = null) {
  if (quantity === 0) return true;

  const transactionSuccess = await transaction_update(userId, (player, equipment, najie) => {

    if (itemClass === '装备') {
      let targetPinji = pinji;
      if (quantity > 0) { // 增加装备
        if (targetPinji === null) { // 未指定品级则随机
          const random = Math.random();
          if (random > 0.99) targetPinji = 6;
          else if (random > 0.95) targetPinji = 5;
          else if (random > 0.60) targetPinji = 4;
          else if (random > 0.20) targetPinji = 3;
          else targetPinji = Math.floor(Math.random() * 3);
        }
        const existingItem = najie.装备.find(item => item.name === itemName && item.pinji === targetPinji);
        if (existingItem) {
          existingItem.数量 = (existingItem.数量 || 1) + quantity;
        } else {
          const baseItem = data.equipment_list.find(item => item.name === itemName) || data.timeequipmen_list.find(item => item.name === itemName);
          if (!baseItem) return false;
          const newItem = JSON.parse(JSON.stringify(baseItem));
          newItem.pinji = targetPinji;
          const z = [0.8,
            1,
            1.1,
            1.2,
            1.3,
            1.5,
            2.0][targetPinji];
          if (newItem.加成) {
            newItem.加成 = Number((baseItem.加成 * z).toFixed(2));
          } else {
            newItem.atk = Math.floor(baseItem.atk * z);
            newItem.def = Math.floor(baseItem.def * z);
            newItem.HP = Math.floor(baseItem.HP * z);
          }
          newItem.数量 = quantity;
          newItem.islockd = 0;
          najie.装备.push(newItem);
        }
      } else { // 减少装备
        if (targetPinji === null) return false; // 减少装备必须指定品级
        const itemIndex = najie.装备.findIndex(item => item.name === itemName && item.pinji === targetPinji);
        if (itemIndex !== -1) {
          najie.装备[itemIndex].数量 += quantity;
          if (najie.装备[itemIndex].数量 <= 0) {
            najie.装备.splice(itemIndex, 1);
          }
        } else {
          return false;
        }
      }
      return true;
    }

    // --- 所有其他可堆叠物品的通用逻辑 ---
    const categoryMap = { '仙米': '仙宠口粮' }; // 类别名和纳戒键名的映射
    const najieKey = categoryMap[itemClass] || itemClass;
    if (!najie[najieKey]) return false;

    const itemIndex = najie[najieKey].findIndex(item => item.name === itemName);
    if (itemIndex !== -1) { // 物品已存在
      najie[najieKey][itemIndex].数量 += quantity;
      if (najie[najieKey][itemIndex].数量 <= 0) {
        najie[najieKey].splice(itemIndex, 1);
      }
    } else if (quantity > 0) { // 物品不存在，且是增加操作
      const itemTemplate = data[`${itemClass}_list`]?.find(item => item.name === itemName);
      if (!itemTemplate) return false; // 物品模板不存在
      const newItem = { ...itemTemplate, 数量: quantity, islockd: 0 };
      najie[najieKey].push(newItem);
    } else {
      return false; // 物品不存在，无法减少
    }
    return true;
  });

  if (!transactionSuccess) {
    console.error(`[DAL] 存档 ${userId} 操作物品 [${itemName}]*${quantity} 失败`);
    return false;
  }
  return true;
}