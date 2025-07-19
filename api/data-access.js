// /api/data-access.js (最终独立版)

import { createClient } from 'redis';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';

// --- 创建独立的 Redis 客户端 ---
const redisConfigPath = path.join(process.cwd(), 'config', 'config', 'redis.yaml');
const redisConfig = YAML.parse(fs.readFileSync(redisConfigPath, 'utf8'));
const redisClient = createClient({
  url: `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`,
});
redisClient.connect().catch(err => console.error('[DAL] 独立Redis客户端连接失败:', err));

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