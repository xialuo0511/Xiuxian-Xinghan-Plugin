// /api/data-access.js

import redis from 'redis'; // 假设你已经有一个可用的 redis 客户端实例
import { __PATH } from '../apps/Xiuxian/xiuxian.js'; // 用于路径常量

// --- 玩家数据 ---

/**
 * 从 Redis 中检索玩家的完整个人资料。
 * @param {string} userId 玩家的 QQ ID。
 * @returns {Promise<object|null>} 玩家的数据对象，如果未找到则为 null。
 */
export async function getPlayer(userId) {
  const playerKey = `player:${userId}`;
  const playerData = await redis.hgetall(playerKey);

  if (!playerData || Object.keys(playerData).length === 0) {
    return null;
  }

  // 定义所有需要JSON.parse的字段列表 进行序列化
  const complexFields = [
    '宗门', '仙宠', '灵根', 'occupation', 'lunhui',
    'all_touxiangkuang', 'zb_touxiangkuang', '学习的功法'
  ];

  // 循环处理需要反序列化的字段
  for (const field of complexFields) {
    if (playerData[field]) {
      try {
        playerData[field] = JSON.parse(playerData[field]);
      } catch (e) {
        console.error(`Error parsing field ${field} for user ${userId}:`, playerData[field]);
      }
    }
  }

  // 将数字字符串字段转换回数字类型
  for (const key in playerData) {
    // 确保不是对象或数组后再尝试转换数字，避免错误
    if (typeof playerData[key] === 'string' &&!isNaN(playerData[key])) {
      playerData[key] = Number(playerData[key]);
    }
  }

  return playerData;
}

/**
 * 从 Redis 中检索玩家的装备。
 * @param {string} userId 玩家的 QQ ID。
 * @returns {Promise<object|null>} 玩家的装备对象。
 */
export async function getEquipment(userId) {
  const equipmentKey = `player:${userId}:equipment`;
  const equipmentData = await redis.hgetall(equipmentKey);
  if (!equipmentData || Object.keys(equipmentData).length === 0) {
    return null;
  }
  // 所有装备槽位都存储为 JSON 字符串
  for (const key in equipmentData) {
    equipmentData[key] = JSON.parse(equipmentData[key]);
  }
  return equipmentData;
}

/**
 * 从 Redis 中检索玩家的背包（纳戒）内容。
 * @param {string} userId 玩家的 QQ ID。
 * @returns {Promise<object|null>} 玩家的背包对象。
 */
export async function getNajie(userId) {
  const najieKey = `player:${userId}:najie`;
  const najieData = await redis.hgetall(najieKey);
  if (!najieData || Object.keys(najieData).length === 0) {
    return null;
  }
  // 所有物品类别都存储为 JSON 字符串
  for (const key in najieData) {
    najieData[key] = JSON.parse(najieData[key]);
  }
  return najieData;
}


// --- 原子操作 ---

/**
 * 原子性地修改玩家的数字属性（例如货币、统计数据）。
 * @param {string} userId 玩家的 QQ ID。
 * @param {string} field 要修改的属性（例如 "灵石", "修为"）。
 * @param {number} amount 要增加的数量（可以是负数）。
 * @returns {Promise<number>} 属性的新值。
 */
export async function updatePlayerAttribute(userId, field, amount) {
  const playerKey = `player:${userId}`;
  // HINCRBYFLOAT 是原子操作，可以防止竞态条件。
  return await redis.hincrbyfloat(playerKey, field, amount);
}