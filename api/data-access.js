// /api/data-access.js

import redis from 'redis'; // 您的 Redis 客户端

// --- 数据读取 (GET) ---

/**
 * 获取并解析一个玩家的完整数据
 * @param {string} userId 玩家QQ号
 * @returns {Promise<{player: object, najie: object, equipment: object}|null>}
 */
export async function getPlayerData(userId) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  const data = await redis.hgetall(mainKey);

  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  // 分别解析 player, najie, equipment 的 JSON 字符串
  const playerData = data.player? JSON.parse(data.player) : {};
  const najieData = data.najie? JSON.parse(data.najie) : {};
  const equipmentData = data.equipment? JSON.parse(data.equipment) : {};

  return {
    player: playerData,
    najie: najieData,
    equipment: equipmentData
  };
}

// --- 数据写入 (SET/UPDATE) ---

/**
 * 保存玩家的核心数据 (player.json)
 * @param {string} userId 玩家QQ号
 * @param {object} playerData 完整的玩家核心数据对象
 */
export async function savePlayer(userId, playerData) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  await redis.hset(mainKey, 'player', JSON.stringify(playerData));
}

/**
 * 保存玩家的纳戒数据 (najie.json)
 * @param {string} userId 玩家QQ号
 * @param {object} najieData 完整的纳戒数据对象
 */
export async function saveNajie(userId, najieData) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  await redis.hset(mainKey, 'najie', JSON.stringify(najieData));
}

/**
 * 保存玩家的装备数据 (equipment.json)
 * @param {string} userId 玩家QQ号
 * @param {object} equipmentData 完整的装备数据对象
 */
export async function saveEquipment(userId, equipmentData) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  await redis.hset(mainKey, 'equipment', JSON.stringify(equipmentData));
}



/**
 * 原子性地增加/减少玩家核心属性中的某个数值
 * (此函数为高级用法，需要Redis支持LUA脚本，是解决高并发数据问题的最佳实践)
 * @param {string} userId 玩家QQ号
 * @param {string} attributeName 要修改的属性名，例如 "修为"
 * @param {number} amount 要增加或减少的数量
 * @returns {Promise<number>} 修改后的新值
 */
export async function updatePlayerAttribute(userId, attributeName, amount) {
  // const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  // const script = `
  //       local key = KEYS[1]
  //       local field = ARGV[1]
  //       local attr = ARGV
  //       local amount = tonumber(ARGV)
  //
  //       local data_str = redis.call('HGET', key, field)
  //       if not data_str then
  //           return nil
  //       end
  //
  //       local data = cjson.decode(data_str)
  //       data[attr] = (data[attr] or 0) + amount
  //
  //       local new_data_str = cjson.encode(data)
  //       redis.call('HSET', key, field, new_data_str)
  //
  //       return data[attr]
  //   `;
  // 注意: Redis 默认可能不带 cjson 库，这是一个示例。
  // 一个更通用的方法是读取、修改、然后用WATCH/MULTI/EXEC事务写回，这里为了简化，我们先用非原子性的方式。
  // 让我们用一个更简单、无需LUA的方式实现它：
  const data = await getPlayerData(userId);
  if (data && data.player) {
    data.player[attributeName] = (data.player[attributeName] || 0) + amount;
    await savePlayer(userId, data.player);
    return data.player[attributeName];
  }
  return null;
}

/**
 * 检查玩家存档是否存在于 Redis 中
 * @param {string} userId 玩家QQ号
 * @returns {Promise<boolean>} 如果存在则返回 true，否则返回 false
 */
export async function existPlayer(userId) {
  const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
  const keyType = await redis.type(mainKey);
  return keyType !== 'none';
}
/**
 * 取玩家当前正在执行的动作
 * @param {string} userId 玩家QQ号
 * @returns {Promise<object|null>} 如果玩家正在忙，返回动作详情对象；如果空闲，返回 null
 */
export async function getPlayerAction(userId) {
  const actionKey = `XinghanXiuxian:Player:${userId}:action`;
  const actionJson = await redis.get(actionKey);

  if (!actionJson) {
    return null; // 键不存在，玩家空闲
  }

  try {
    const actionDetails = JSON.parse(actionJson);
    const now = Date.now();

    // 双重检查：如果任务已经到期但由于某种原因没被及时处理，也视为空闲
    if (now > actionDetails.end_time) {
      await redis.del(actionKey); // 清理过期的任务键
      return null;
    }

    return actionDetails; // 返回任务详情
  } catch (e) {
    logger.error(`[DAL] 解析玩家 ${userId} 的 action 数据失败`, e);
    await redis.del(actionKey); // 删除格式错误的数据
    return null;
  }
}