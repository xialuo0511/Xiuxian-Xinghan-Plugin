import fs from 'fs';
import path from 'path';
import mysql from 'mysql';
import { __PATH } from './apps/Xiuxian/xiuxian.js';
import config from './model/Config.js';

const databaseConfigData = config.getConfig("database", "database");
const db = mysql.createPool({
  host: 'localhost',
  user: databaseConfigData.Database.username,
  password: databaseConfigData.Database.password,
  database: 'xiuxiandatabase'
});

async function migrate() {
  console.log("开始数据迁移...");

  // --- 1. 迁移玩家 JSON 文件 ---
  const playerFiles = fs.readdirSync(__PATH.player_path).filter(file => file.endsWith(".json"));
  console.log(`发现 ${playerFiles.length} 个玩家文件需要迁移。`);

  for (const file of playerFiles) {
    const userId = path.basename(file, '.json');

    try {
      // 从所有三个 JSON 文件中读取数据
      const playerData = JSON.parse(fs.readFileSync(path.join(__PATH.player_path, file), 'utf-8'));
      const najieData = JSON.parse(fs.readFileSync(path.join(__PATH.najie_path, file), 'utf-8'));
      const equipmentData = JSON.parse(fs.readFileSync(path.join(__PATH.equipment_path, file), 'utf-8'));

      // 准备用于 Redis HASH 的数据
      const redisPlayerData = {...playerData };

      // [更新] 定义所有需要JSON.stringify的字段列表
      const complexFields = [
        '宗门', '仙宠', '灵根', 'occupation', 'lunhui',
        'all_touxiangkuang', 'zb_touxiangkuang', '学习的功法'
      ];

      // 循环处理需要序列化的字段
      for (const field of complexFields) {
        if (redisPlayerData[field]) {
          redisPlayerData[field] = JSON.stringify(redisPlayerData[field]);
        }
      }

      const redisNajieData = {};
      for (const category in najieData) {
        redisNajieData[category] = JSON.stringify(najieData[category]);
      }

      const redisEquipmentData = {};
      for (const slot in equipmentData) {
        redisEquipmentData[slot] = JSON.stringify(equipmentData[slot]);
      }

      // 使用 pipeline 提高效率，写入 Redis
      await redis.pipeline()
        .del(`player:${userId}`) // 清除旧数据（如有）
        .del(`player:${userId}:najie`)
        .del(`player:${userId}:equipment`)
        .hset(`player:${userId}`, redisPlayerData)
        .hset(`player:${userId}:najie`, redisNajieData)
        .hset(`player:${userId}:equipment`, redisEquipmentData)
        .exec();

    } catch (error) {
      console.error(`迁移用户 ${userId} 失败:`, error);
    }
  }
  console.log("玩家 JSON 文件迁移完成。");

  // --- 2. 从 MySQL 迁移活动任务 ---
  console.log("正在从 MySQL 'action' 表迁移任务...");
  db.query('SELECT * FROM action', async (error, results) => {
    if (error) {
      console.error("查询 MySQL 失败:", error);
      db.end(); // 确保在出错时也关闭连接
      return;
    }

    console.log(`发现 ${results.length} 个活动任务需要迁移。`);
    if (results && results.length > 0) {
      for (const action of results) {
        const taskPayload = {
          type: action.action_name, // 或映射到一个新的任务名
          userId: action.usr_id,
          // 从 action 记录中添加任何其他相关数据
        };
        const endTime = new Date(action.end_time).getTime();

        // 添加到新的定时任务 ZSET 中
        await redis.zadd('tasks:scheduled', {
          score: endTime,
          value: JSON.stringify(taskPayload)
        });
      }
    }
    console.log("任务迁移完成。");
    db.end(); // 关闭连接
  });

  console.log("迁移脚本执行完毕。");
}

migrate().catch(console.error);