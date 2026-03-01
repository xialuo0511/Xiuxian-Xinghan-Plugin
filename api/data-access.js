// /api/data-access.js (延迟初始化版)

import { createClient } from 'redis';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';
import data from '../model/XiuxianData.js';
import XiuxianData from '../model/XiuxianData.js';

// --- 延迟初始化的 Redis 客户端 ---
let redisClient = null;
let connectionPromise = null;

/**
 * 获取 Redis 客户端（延迟初始化）
 * 第一次调用时才创建连接，避免启动时竞争
 */
export async function getRedisClient() {
  // 如果已经有连接，直接返回
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  // 如果正在连接中，等待连接完成
  if (connectionPromise) {
    return connectionPromise;
  }

  // 开始建立连接
  connectionPromise = (async () => {
    try {
      const redisConfigPath = path.join(process.cwd(), 'config', 'config', 'redis.yaml');

      if (!fs.existsSync(redisConfigPath)) {
        console.error('[DAL] ❌ Redis 配置文件不存在:', redisConfigPath);
        throw new Error('Redis 配置文件不存在');
      }

      const redisConfigRaw = fs.readFileSync(redisConfigPath, 'utf8');
      const redisConfig = YAML.parse(redisConfigRaw);

      const redisUrl = `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`;
      console.log('[DAL] 延迟初始化 Redis 连接:', redisUrl.replace(/:([^:@]+)@/, ':****@'));

      redisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 10000,
          reconnectStrategy: (retries) => {
            if (retries > 5) {
              console.error('[DAL] ❌ Redis 重连超过 5 次，停止重试');
              return false;
            }
            const delay = Math.min(retries * 1000, 5000);
            console.log(`[DAL] Redis 连接失败，${delay}ms 后第 ${retries} 次重试...`);
            return delay;
          }
        }
      });

      redisClient.on('error', (err) => {
        console.error('[DAL] Redis 错误:', err.message);
      });

      await redisClient.connect();
      console.log('[DAL] ✅ Redis 客户端连接成功');

      return redisClient;
    } catch (err) {
      console.error('[DAL] ❌ Redis 连接失败:', err.message);
      connectionPromise = null; // 允许重试
      throw err;
    }
  })();

  return connectionPromise;
}

const ASSOCIATION_KEY_PREFIX = 'XinghanXiuxian:Data:Association:';

// --- 存在性检查 ---
export async function existPlayer(userId) {
  const client = await getRedisClient();
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  const result = await client.exists(mainKey);
  return result === 1;
}

/**
 * 通用锁执行器
 * 自动获取锁（带重试），执行任务，最后释放锁
 * @param {string} key 资源标识
 * @param {Function} task 异步任务函数
 * @returns {Promise<any>}
 */
async function executeWithLock(key, task) {
  // 1. 尝试获取锁
  const lockToken = await acquireLock(key, 5000);
  if (!lockToken) {
    // 获取失败，等待后递归重试 (自旋)
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
    return executeWithLock(key, task);
  }

  try {
    // 2. 执行业务逻辑
    return await task();
  } finally {
    // 3. 释放锁
    await releaseLock(key, lockToken);
  }
}

// --- 数据读写 ---
export async function getAllPlayerData(userId) {
  try {
    const client = await getRedisClient();
    const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
    const data = await client.hGetAll(mainKey);
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
  await executeWithLock(userId, async () => {
    const client = await getRedisClient();
    const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
    await client.hSet(mainKey, 'player', JSON.stringify(playerData));
  });
}

/**
 * 覆写式保存玩家的纳戒数据 (已加锁)
 * @param {string} userId 玩家QQ号
 * @param {object} najieData 完整的纳戒数据对象
 */
export async function saveNajie(userId, najieData) {
  await executeWithLock(userId, async () => {
    const client = await getRedisClient();
    const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
    await client.hSet(mainKey, 'najie', JSON.stringify(najieData));
  });
}

/**
 * 覆写式保存玩家的装备数据 (已加锁)
 * @param {string} userId 玩家QQ号
 * @param {object} equipmentData 完整的装备数据对象
 */
export async function saveEquipment(userId, equipmentData) {
  await executeWithLock(userId, async () => {
    const client = await getRedisClient();
    const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
    await client.hSet(mainKey, 'equipment', JSON.stringify(equipmentData));
  });
}


// --- 分布式锁机制 ---

/**
 * 尝试获取分布式锁
 * @param {string} key 锁的资源标识
 * @param {number} ttl 锁的自动过期时间(毫秒)
 * @returns {Promise<string|null>} 成功返回锁的token，失败返回null
 */
async function acquireLock(key, ttl = 5000) {
  const client = await getRedisClient();
  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const lockKey = `XinghanXiuxian:Lock:${key}`;
  try {
    const result = await client.set(lockKey, token, {
      NX: true,
      PX: ttl
    });
    return result === 'OK' ? token : null;
  } catch (err) {
    console.error(`[Lock] 获取锁失败 ${key}:`, err);
    return null;
  }
}

/**
 * 释放分布式锁
 * @param {string} key 锁的资源标识
 * @param {string} token 获取锁时得到的token
 */
async function releaseLock(key, token) {
  const client = await getRedisClient();
  const lockKey = `XinghanXiuxian:Lock:${key}`;
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  try {
    await client.eval(script, {
      keys: [lockKey],
      arguments: [token]
    });
  } catch (err) {
    console.error(`[Lock] 释放锁失败 ${key}:`, err);
  }
}

/**
 * 使用事务安全地更新玩家数据包 (主要入口)
 * 集成了分布式锁 + Optimistic Lock (WATCH) 双重保障
 * @param {string} userId 玩家QQ号
 * @param {(player: object, equipment: object, najie: object) => boolean | void} updateFunction
 * @returns {Promise<boolean>}
 */
export async function transaction_update(userId, updateFunction) {
  // 1. 尝试获取分布式锁 (防止多进程并发冲突)
  const lockToken = await acquireLock(userId, 5000);
  if (!lockToken) {
    // 获取锁失败，说明有其他进程正在操作该用户，等待后重试
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
    return transaction_update(userId, updateFunction);
  }

  // 事务需要一个独立的连接来执行 WATCH
  const mainClient = await getRedisClient();
  const transactionClient = mainClient.duplicate();
  await transactionClient.connect();
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;

  try {
    await transactionClient.watch(mainKey);

    const allData = await transactionClient.hGetAll(mainKey);
    if (!allData || Object.keys(allData).length === 0) {
      console.log('warn', `[TX] 尝试更新不存在的玩家: ${userId}`);
      return false; // 玩家不存在
    }

    // 完整地解析出所有数据
    const playerData = JSON.parse(allData.player || '{}');
    const equipmentData = JSON.parse(allData.equipment || '{}');
    const najieData = JSON.parse(allData.najie || '{}');

    // 创建一个原始数据的深拷贝，用于对比变更
    const originalNajie = JSON.stringify(najieData);
    const originalPlayer = JSON.stringify(playerData);
    const originalEquipment = JSON.stringify(equipmentData);

    // 将所有数据作为独立参数传递给回调函数 (增加await)
    const result = await updateFunction(playerData, equipmentData, najieData);

    // 如果更新函数明确返回 false，则中止事务
    if (result === false) {
      await transactionClient.unwatch();
      return false;
    }

    const multi = transactionClient.multi();
    let hasChanges = false;

    // 检查所有数据部分是否有变动，并保存
    if (originalPlayer !== JSON.stringify(playerData)) {
      multi.hSet(mainKey, 'player', JSON.stringify(playerData));
      hasChanges = true;
    }
    if (originalEquipment !== JSON.stringify(equipmentData)) {
      multi.hSet(mainKey, 'equipment', JSON.stringify(equipmentData));
      hasChanges = true;
    }
    if (originalNajie !== JSON.stringify(najieData)) {
      multi.hSet(mainKey, 'najie', JSON.stringify(najieData));
      hasChanges = true;
    }

    if (!hasChanges) {
      await transactionClient.unwatch();
      return true; // 没有变化，直接成功返回
    }

    const execResult = await multi.exec();

    if (execResult === null) {
      console.info(`[TX] 用户 ${userId} 数据发生写入冲突 (CAS失败)，正在重试...`);
      // 释放当前资源的锁，然后重试
      await releaseLock(userId, lockToken);
      return await transaction_update(userId, updateFunction);
    }
    return true;

  } catch (error) {
    console.error(`[TX] 更新用户 ${userId} 数据时发生错误:`, error);
    return false;
  } finally {
    await transactionClient.quit();
    // 务必释放锁
    await releaseLock(userId, lockToken);
  }
}

/**
 * [新] 获取玩家当前正在执行的动作。
 * @param {string} userId 玩家QQ号
 * @returns {Promise<object|null>}
 */
export async function getPlayerAction(userId) {
  const client = await getRedisClient();
  const actionKey = `XinghanXiuxian:Player:${userId}:action`;
  const actionJson = await client.get(actionKey);

  if (!actionJson) return null;

  try {
    const actionDetails = JSON.parse(actionJson);
    const endTime = actionDetails.endTime || actionDetails.end_time;
    if (Date.now() > endTime) {
      await client.del(actionKey);
      return null;
    }
    return actionDetails;
  } catch (e) {
    console.error(`[DAL] 解析玩家 ${userId} 的 action 数据失败:`, actionJson, e);
    await client.del(actionKey);
    return null;
  }
}

/**
 * [新增] 设置玩家的动作状态
 * @param {string} userId 玩家ID
 * @param {object} actionDetails 动作详情
 * @returns {Promise<void>}
 */
export async function setPlayerAction(userId, actionDetails) {
  const client = await getRedisClient();
  const actionKey = `XinghanXiuxian:Player:${userId}:action`;
  await client.set(actionKey, JSON.stringify(actionDetails));
}

/**
 * [新增] 删除玩家的动作状态
 * @param {string} userId 玩家ID
 * @returns {Promise<void>}
 */
export async function deletePlayerAction(userId) {
  const client = await getRedisClient();
  const actionKey = `XinghanXiuxian:Player:${userId}:action`;
  await client.del(actionKey);
}

/**
 * 获取宗门信息
 * @param {string} sectName - 宗门名称
 * @returns {Promise<object|null>}
 */
export async function getAssociation(sectName) {
  const client = await getRedisClient();
  const key = `${ASSOCIATION_KEY_PREFIX}${sectName}`;
  const data = await client.get(key);
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
 * 保存/更新宗门信息 (已加锁)
 * @param {string} sectName - 宗门名称
 * @param {object} sectData - 完整的宗门数据对象
 * @returns {Promise<void>}
 */
export async function saveAssociation(sectName, sectData) {
  const lockKey = `Association:${sectName}`;
  await executeWithLock(lockKey, async () => {
    const client = await getRedisClient();
    const key = `${ASSOCIATION_KEY_PREFIX}${sectName}`;
    await client.set(key, JSON.stringify(sectData));
  });
}

/**
 * [同步辅助函数] 在内存中更新纳戒数据（不涉及Redis操作）
 * 可用于 transaction_update 的回调中
 */
export function updateNajieSync(najie, itemName, itemClass, quantity, pinji = null) {
  if (quantity === 0) return true;
  quantity = Number(quantity);

  const findItemTemplate = (name, className) => {
    const listMap = XiuxianData.itemListMap;
    const listsToSearch = listMap[className] || listMap['默认'];
    for (const listName of listsToSearch) {
      const item = data[listName]?.find(i => i.name === name);
      if (item) return item;
    }
    return null;
  };

  if (!najie[itemClass]) {
    najie[itemClass] = [];
  }

  if (itemClass === '装备') {
    let targetPinji = pinji;
    if (quantity > 0) { // 增加装备
      if (targetPinji === null) {
        const random = Math.random();
        if (random > 0.99) targetPinji = 6;
        else if (random > 0.95) targetPinji = 5;
        else if (random > 0.60) targetPinji = 4;
        else if (random > 0.20) targetPinji = 3;
        else targetPinji = Math.floor(Math.random() * 3);
      }

      const existingItem = najie.装备.find(item => item.name === itemName && item.pinji === targetPinji);
      if (existingItem) {
        existingItem.数量 = Number(existingItem.数量 || 0) + quantity;
      } else {
        const baseItem = findItemTemplate(itemName, '装备');
        if (!baseItem) {
          console.warn(`找不到装备模板: ${itemName}`);
          return false;
        }
        const newItem = JSON.parse(JSON.stringify(baseItem));
        newItem.pinji = targetPinji;
        const z = [0.8, 1, 1.1, 1.2, 1.3, 1.5, 2.0][targetPinji];
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
      if (pinji === null) {
        console.warn(`减少装备 [${itemName}] 时必须指定品级`);
        return false;
      }
      const itemIndex = najie.装备.findIndex(item => item.name === itemName && item.pinji === pinji);
      if (itemIndex !== -1) {
        if (najie.装备[itemIndex].数量 < -quantity) {
          console.warn(`玩家没有足够的 [${itemName}] 进行扣除`);
          return false;
        }
        najie.装备[itemIndex].数量 += quantity;
        if (najie.装备[itemIndex].数量 <= 0) {
          najie.装备.splice(itemIndex, 1);
        }
      } else {
        console.warn(`玩家没有 [${itemName}] (品级: ${pinji}) 无法扣除`);
        return false;
      }
    }
    return true;
  }

  // --- 所有其他可堆叠物品的通用逻辑 ---
  const categoryMap = { '仙米': '仙宠口粮' };
  const najieKey = categoryMap[itemClass] || itemClass;
  if (!najie[najieKey]) {
    // 自动创建分类
    najie[najieKey] = [];
  }

  const itemIndex = najie[najieKey].findIndex(item => item.name === itemName);
  if (itemIndex !== -1) { // 物品已存在
    if (quantity < 0 && najie[najieKey][itemIndex].数量 < -quantity) {
      console.warn(`玩家没有足够的 [${itemName}] 进行扣除`);
      return false;
    }
    najie[najieKey][itemIndex].数量 += quantity;
    if (najie[najieKey][itemIndex].数量 <= 0) {
      najie[najieKey].splice(itemIndex, 1);
    }
  } else if (quantity > 0) { // 物品不存在，且是增加操作
    const itemTemplate = findItemTemplate(itemName, itemClass);
    if (!itemTemplate) {
      console.warn(`找不到物品模板: [${itemName}] 在类别 [${itemClass}] 中`);
      return false;
    }
    const newItem = { ...itemTemplate, 数量: quantity, islockd: 0 };
    najie[najieKey].push(newItem);
  } else {
    console.warn(`玩家没有 [${itemName}] 无法扣除`);
    return false; // 物品不存在，无法减少
  }
  return true;
}

/**
 * 更新纳戒物品（增加/减少），这是一个可以在任何地方安全调用的函数
 * @param {string} userId 玩家ID
 * @param {string} itemName 物品名称
 * @param {string} itemClass 物品类别
 * @param {number} quantity 数量 (正数增加, 负数减少)
 * @param {number|null} pinji 品级 (数字0-6), 仅对装备有效
 * @returns {Promise<boolean>} 操作是否成功
 */
export async function updateNajieItem(userId, itemName, itemClass, quantity, pinji = null) {
  const transactionSuccess = await transaction_update(userId, (player, equipment, najie) => {
    return updateNajieSync(najie, itemName, itemClass, quantity, pinji);
  });

  if (!transactionSuccess) {
    console.warn(`存档 ${userId} 操作物品 [${itemName}]*${quantity} 失败`);
    return false;
  }
  return true;
}

/**
 * 获取玩家纳戒中指定物品的数量
 * @param {string|number} userId - 玩家ID
 * @param {string} itemName - 物品名称
 * @param {string} itemClass - 物品分类
 * @returns {Promise<number>} - 返回物品的数量，如果不存在则返回 0
 */
export async function getNajieItemAmount(userId, itemName, itemClass) {
  try {
    const playerData = await getAllPlayerData(userId);

    if (!playerData || !playerData.najie) {
      return 0;
    }

    const category = playerData.najie[itemClass];

    // 检查分类是否存在且为数组
    if (!Array.isArray(category)) {
      return 0;
    }

    // 在数组中查找物品
    const item = category.find(i => i && i.name === itemName);

    return item?.数量 || 0;

  } catch (error) {
    console.error(`[getNajieItemAmount] 获取玩家 ${userId} 物品 ${itemName} 数量时出错:`, error);
    return 0;
  }
}

// 为向后兼容性创建一个 Proxy，自动调用 getRedisClient()
// 使用方式: await redisClient.get(...) 会自动等待连接
const redisClientProxy = new Proxy({}, {
  get(target, prop) {
    return async (...args) => {
      const client = await getRedisClient();
      if (typeof client[prop] === 'function') {
        return client[prop](...args);
      }
      return client[prop];
    };
  }
});

// =========================
// 沉迷收获记录系统
// =========================
const ADDICTION_HISTORY_KEY_PREFIX = 'XinghanXiuxian:Player:';
const ADDICTION_HISTORY_KEY_SUFFIX = ':addictionHistory';

/**
 * 创建沉迷记录
 * @param {string} userId 玩家ID
 * @param {object} data 初始数据 { location, locationType, totalRuns }
 * @returns {Promise<void>}
 */
export async function createAddictionHistory(userId, historyData) {
  const client = await getRedisClient();
  const key = `${ADDICTION_HISTORY_KEY_PREFIX}${userId}${ADDICTION_HISTORY_KEY_SUFFIX}`;
  const record = {
    startTime: Date.now(),
    location: historyData.location,
    locationType: historyData.locationType,
    totalRuns: historyData.totalRuns,
    completedRuns: 0,
    failedRuns: 0,
    xiuweiGained: 0,
    xueqiGained: 0,
    itemsGained: [],
    status: 'in_progress',
    endTime: null
  };
  await client.set(key, JSON.stringify(record));
}

/**
 * 获取沉迷记录
 * @param {string} userId 玩家ID
 * @returns {Promise<object|null>}
 */
export async function getAddictionHistory(userId) {
  const client = await getRedisClient();
  const key = `${ADDICTION_HISTORY_KEY_PREFIX}${userId}${ADDICTION_HISTORY_KEY_SUFFIX}`;
  const data = await client.get(key);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error(`[DAL] 解析沉迷记录失败, userId: ${userId}`, e);
    return null;
  }
}

/**
 * 更新沉迷记录（累加收益）
 * @param {string} userId 玩家ID
 * @param {object} rewards { xiuwei, xueqi, items: [{name, class, amount}] }
 * @param {boolean} failed 本次是否失败
 * @returns {Promise<boolean>}
 */
export async function updateAddictionHistory(userId, rewards, failed = false) {
  const client = await getRedisClient();
  const key = `${ADDICTION_HISTORY_KEY_PREFIX}${userId}${ADDICTION_HISTORY_KEY_SUFFIX}`;
  const data = await client.get(key);
  if (!data) return false;

  try {
    const record = JSON.parse(data);
    record.completedRuns += 1;
    if (failed) {
      record.failedRuns += 1;
    }
    record.xiuweiGained += (rewards.xiuwei || 0);
    record.xueqiGained += (rewards.xueqi || 0);

    // 合并物品
    if (rewards.items && rewards.items.length > 0) {
      for (const newItem of rewards.items) {
        const existing = record.itemsGained.find(
          i => i.name === newItem.name && i.class === newItem.class
        );
        if (existing) {
          existing.amount += (newItem.amount || 1);
        } else {
          record.itemsGained.push({
            name: newItem.name,
            class: newItem.class || newItem.classx || '未知',
            amount: newItem.amount || 1
          });
        }
      }
    }

    await client.set(key, JSON.stringify(record));
    return true;
  } catch (e) {
    console.error(`[DAL] 更新沉迷记录失败, userId: ${userId}`, e);
    return false;
  }
}

/**
 * 标记沉迷记录为已完成
 * @param {string} userId 玩家ID
 * @returns {Promise<boolean>}
 */
export async function completeAddictionHistory(userId) {
  const client = await getRedisClient();
  const key = `${ADDICTION_HISTORY_KEY_PREFIX}${userId}${ADDICTION_HISTORY_KEY_SUFFIX}`;
  const data = await client.get(key);
  if (!data) return false;

  try {
    const record = JSON.parse(data);
    record.status = 'completed';
    record.endTime = Date.now();
    await client.set(key, JSON.stringify(record));
    return true;
  } catch (e) {
    console.error(`[DAL] 完成沉迷记录失败, userId: ${userId}`, e);
    return false;
  }
}

/**
 * 清除沉迷记录
 * @param {string} userId 玩家ID
 * @returns {Promise<boolean>}
 */
export async function clearAddictionHistory(userId) {
  const client = await getRedisClient();
  const key = `${ADDICTION_HISTORY_KEY_PREFIX}${userId}${ADDICTION_HISTORY_KEY_SUFFIX}`;
  const result = await client.del(key);
  return result > 0;
}

// =========================
// 成就系统
// =========================
const ACHIEVEMENT_KEY_PREFIX = 'XinghanXiuxian:Player:';
const ACHIEVEMENT_KEY_SUFFIX = ':achievements';

/**
 * 获取玩家成就数据
 * @param {string} userId 玩家ID
 * @returns {Promise<object>}
 */
export async function getPlayerAchievements(userId) {
  const client = await getRedisClient();
  const key = `${ACHIEVEMENT_KEY_PREFIX}${userId}${ACHIEVEMENT_KEY_SUFFIX}`;
  const data = await client.get(key);
  if (!data) {
    return {
      unlocked: [],
      progress: {},
      claimedRewards: []
    };
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error(`[DAL] 解析成就数据失败, userId: ${userId}`, e);
    return { unlocked: [], progress: {}, claimedRewards: [] };
  }
}

/**
 * 保存玩家成就数据
 * @param {string} userId 玩家ID
 * @param {object} achievementData 成就数据
 * @returns {Promise<void>}
 */
export async function savePlayerAchievements(userId, achievementData) {
  const client = await getRedisClient();
  const key = `${ACHIEVEMENT_KEY_PREFIX}${userId}${ACHIEVEMENT_KEY_SUFFIX}`;
  await client.set(key, JSON.stringify(achievementData));
}

/**
 * 解锁成就
 * @param {string} userId 玩家ID
 * @param {string} achievementId 成就ID
 * @returns {Promise<boolean>} 是否是新解锁
 */
export async function unlockAchievement(userId, achievementId) {
  const achievements = await getPlayerAchievements(userId);
  if (achievements.unlocked.includes(achievementId)) {
    return false; // 已解锁
  }
  achievements.unlocked.push(achievementId);
  await savePlayerAchievements(userId, achievements);
  return true;
}

/**
 * 更新成就进度
 * @param {string} userId 玩家ID
 * @param {string} progressKey 进度键（如 explore_count）
 * @param {number} value 增加的值
 * @returns {Promise<number>} 更新后的进度值
 */
export async function updateAchievementProgress(userId, progressKey, value) {
  const achievements = await getPlayerAchievements(userId);
  achievements.progress[progressKey] = (achievements.progress[progressKey] || 0) + value;
  await savePlayerAchievements(userId, achievements);
  return achievements.progress[progressKey];
}

/**
 * 设置成就进度（绝对值）
 * @param {string} userId 玩家ID
 * @param {string} progressKey 进度键
 * @param {number} value 设置的值
 * @returns {Promise<void>}
 */
export async function setAchievementProgress(userId, progressKey, value) {
  const achievements = await getPlayerAchievements(userId);
  achievements.progress[progressKey] = value;
  await savePlayerAchievements(userId, achievements);
}

/**
 * 标记成就奖励已领取
 * @param {string} userId 玩家ID
 * @param {string} achievementId 成就ID
 * @returns {Promise<boolean>} 是否成功领取（false表示已领取过）
 */
export async function claimAchievementReward(userId, achievementId) {
  const achievements = await getPlayerAchievements(userId);
  if (!achievements.unlocked.includes(achievementId)) {
    return false; // 未解锁
  }
  if (achievements.claimedRewards.includes(achievementId)) {
    return false; // 已领取
  }
  achievements.claimedRewards.push(achievementId);
  await savePlayerAchievements(userId, achievements);
  return true;
}

// =========================
// 位面系统
// =========================
const PLANE_KEY_PREFIX = 'XinghanXiuxian:Player:';
const PLANE_KEY_SUFFIX = ':plane';

/**
 * 获取玩家位面数据
 * @param {string} userId 玩家ID
 * @returns {Promise<object>}
 */
export async function getPlayerPlaneData(userId) {
  const client = await getRedisClient();
  const key = `${PLANE_KEY_PREFIX}${userId}${PLANE_KEY_SUFFIX}`;
  const data = await client.get(key);
  if (!data) {
    return {
      currentPlane: 'mortal_realm',
      unlockedPlanes: ['mortal_realm'],
      planeProgress: {},
      lastTeleport: 0
    };
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error(`[DAL] 解析位面数据失败, userId: ${userId}`, e);
    return { currentPlane: 'mortal_realm', unlockedPlanes: ['mortal_realm'], planeProgress: {}, lastTeleport: 0 };
  }
}

/**
 * 保存玩家位面数据
 * @param {string} userId 玩家ID
 * @param {object} planeData 位面数据
 * @returns {Promise<void>}
 */
export async function savePlayerPlaneData(userId, planeData) {
  const client = await getRedisClient();
  const key = `${PLANE_KEY_PREFIX}${userId}${PLANE_KEY_SUFFIX}`;
  await client.set(key, JSON.stringify(planeData));
}

/**
 * 传送到指定位面
 * @param {string} userId 玩家ID
 * @param {string} planeId 位面ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function teleportToPlane(userId, planeId) {
  const planeData = await getPlayerPlaneData(userId);
  if (!planeData.unlockedPlanes.includes(planeId)) {
    return false; // 未解锁
  }
  planeData.currentPlane = planeId;
  planeData.lastTeleport = Date.now();
  await savePlayerPlaneData(userId, planeData);
  return true;
}

/**
 * 解锁位面
 * @param {string} userId 玩家ID
 * @param {string} planeId 位面ID
 * @returns {Promise<boolean>} 是否是新解锁
 */
export async function unlockPlane(userId, planeId) {
  const planeData = await getPlayerPlaneData(userId);
  if (planeData.unlockedPlanes.includes(planeId)) {
    return false; // 已解锁
  }
  planeData.unlockedPlanes.push(planeId);
  // 初始化进阶进度
  planeData.planeProgress[planeId] = {
    stage: 1,
    currency: 0,
    stats: {}
  };
  await savePlayerPlaneData(userId, planeData);
  return true;
}

/**
 * 更新位面货币
 * @param {string} userId 玩家ID
 * @param {string} planeId 位面ID
 * @param {number} amount 增加的货币量
 * @returns {Promise<number>} 更新后的货币量
 */
export async function updatePlaneCurrency(userId, planeId, amount) {
  const planeData = await getPlayerPlaneData(userId);
  if (!planeData.planeProgress[planeId]) {
    planeData.planeProgress[planeId] = { stage: 1, currency: 0, stats: {} };
  }
  planeData.planeProgress[planeId].currency += amount;
  await savePlayerPlaneData(userId, planeData);
  return planeData.planeProgress[planeId].currency;
}

export { redisClientProxy as redisClient };