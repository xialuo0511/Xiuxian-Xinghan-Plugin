// /plugins/xiuxian-emulator-plugin/migrate-to-redis.js

import fs from 'fs';
import path from 'path';
import redis from 'redis';
import mysql from 'mysql';
import YAML from 'yaml';
import util from 'util';

// --- 1. 手动定义路径和配置 ---
const __dirname = process.cwd();
const pluginRoot = path.join(__dirname, 'plugins', 'xiuxian-emulator-plugin');
const __PATH = {
  player_path: path.join(pluginRoot, "/resources/data/xiuxian_player"),
  najie_path: path.join(pluginRoot, "/resources/data/xiuxian_najie"),
  equipment_path: path.join(pluginRoot, "/resources/data/xiuxian_equipment"),
  config_path: path.join(pluginRoot, "/config")
};

async function migrate() {
  console.log("开始独立数据迁移...");

  // --- 2. 建立独立的数据库和Redis连接 ---
  let db, redisClient;
  try {
    // 直接读取数据库配置文件
    const dbConfigYaml = fs.readFileSync(path.join(__PATH.config_path, 'database.yaml'), 'utf8');
    const dbConfig = YAML.parse(dbConfigYaml);

    db = mysql.createPool({
      host: dbConfig.Database.host || 'localhost',
      user: dbConfig.Database.username,
      password: dbConfig.Database.password,
      database: dbConfig.Database.database || 'xiuxiandatabase'
    });
    const query = util.promisify(db.query).bind(db); // 将db.query转换为Promise函数

    // 创建并连接Redis客户端 (请确保您的Redis服务正在运行)
    redisClient = redis.createClient();
    redisClient.on('error', err => console.log('Redis Client Error', err));
    await redisClient.connect();

    console.log("数据库和Redis连接已建立。");

    // --- 3. 迁移玩家JSON文件 ---
    const playerFiles = fs.readdirSync(__PATH.player_path).filter(file => file.endsWith(".json"));
    console.log(`发现 ${playerFiles.length} 个玩家文件需要迁移。`);

    for (const file of playerFiles) {
      const userId = path.basename(file, '.json');
      try {
        const playerData = JSON.parse(fs.readFileSync(path.join(__PATH.player_path, file), 'utf-8'));
        const najieData = JSON.parse(fs.readFileSync(path.join(__PATH.najie_path, file), 'utf-8'));
        const equipmentData = JSON.parse(fs.readFileSync(path.join(__PATH.equipment_path, file), 'utf-8'));

        const redisPlayerData = {...playerData };
        //定义需额外进行序列化的key
        const complexFields = ['宗门', '仙宠', '灵根', 'occupation', 'lunhui', 'all_touxiangkuang', 'zb_touxiangkuang', '学习的功法'];

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

        const pipeline = redisClient.multi();
        pipeline.del(`player:${userId}`);
        pipeline.del(`player:${userId}:najie`);
        pipeline.del(`player:${userId}:equipment`);
        if (Object.keys(redisPlayerData).length > 0) pipeline.hSet(`player:${userId}`, redisPlayerData);
        if (Object.keys(redisNajieData).length > 0) pipeline.hSet(`player:${userId}:najie`, redisNajieData);
        if (Object.keys(redisEquipmentData).length > 0) pipeline.hSet(`player:${userId}:equipment`, redisEquipmentData);
        await pipeline.exec();

      } catch (error) {
        console.error(`迁移用户 ${userId} 失败:`, error);
      }
    }
    console.log("玩家JSON文件迁移完成。");

    // --- 4. 从MySQL迁移活动任务 ---
    console.log("正在从 MySQL 'action' 表迁移任务...");
    const results = await query('SELECT * FROM action');
    console.log(`发现 ${results.length} 个活动任务需要迁移。`);

    if (results && results.length > 0) {
      for (const action of results) {
        const taskPayload = {
          type: action.action_name,
          userId: action.usr_id,
        };
        const endTime = new Date(action.end_time).getTime();
        await redisClient.zAdd('tasks:scheduled', {
          score: endTime,
          value: JSON.stringify(taskPayload)
        });
      }
    }
    console.log("任务迁移完成。");

  } catch (error) {
    console.error("迁移过程中发生严重错误:", error);
  } finally {
    // --- 5. 关闭连接 ---
    if (redisClient) {
      await redisClient.quit();
    }
    if (db) {
      db.end();
    }
    console.log("迁移脚本执行完毕，连接已关闭。");
  }
}

migrate();