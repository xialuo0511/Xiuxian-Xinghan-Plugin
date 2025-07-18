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
  // 数据库配置文件路径
  db_config_path: path.join(pluginRoot, "config", "database", "database.yaml")
};

async function migrate() {
  console.log("开始独立数据迁移 (定制版)...");

  // --- 2. 建立独立的数据库和Redis连接 ---
  let db, redisClient;
  try {
    // 直接读取数据库配置文件
    const dbConfigYaml = fs.readFileSync(__PATH.db_config_path, 'utf8');
    const dbConfig = YAML.parse(dbConfigYaml);

    db = mysql.createPool({
      host: dbConfig.Database.host || 'localhost',
      user: dbConfig.Database.username,
      password: dbConfig.Database.password,
      database: dbConfig.Database.database || 'xiuxiandatabase'
    });
    const query = util.promisify(db.query).bind(db); // 将db.query转换为Promise函数

    // 创建并连接Redis客户端
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

        // 定义Redis主键
        const mainKey = `XinghanXiuxian:Data:Player:${userId}`;

        // 将整个对象转换为JSON字符串，用于存入Hash的字段中
        const playerString = JSON.stringify(playerData);
        const najieString = JSON.stringify(najieData);
        const equipmentString = JSON.stringify(equipmentData);

        // 使用pipeline将所有数据写入同一个Key的不同字段中
        const pipeline = redisClient.multi();
        pipeline.del(mainKey); // 清理旧数据，确保幂等性
        pipeline.hSet(mainKey, {
          'player': playerString,
          'najie': najieString,
          'equipment': equipmentString
        });
        await pipeline.exec();

      } catch (error) {
        console.error(`迁移用户 ${userId} 失败:`, error);
      }
    }
    console.log("玩家JSON文件迁移完成。");

    // --- 4. 从MySQL迁移活动任务 (这部分保持不变) ---
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