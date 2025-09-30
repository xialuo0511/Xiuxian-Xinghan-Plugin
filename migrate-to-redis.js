import fs from 'fs';
import path from 'path';
import redis from 'redis';
import mysql from 'mysql';
import YAML from 'yaml';
import util from 'util';

// --- 定义路径和配置 ---
const __dirname = process.cwd();
const pluginRoot = path.join(__dirname, 'plugins', 'xiuxian-emulator-plugin');
const __PATH = {
  player_path: path.join(pluginRoot, '/resources/data/xiuxian_player'),
  najie_path: path.join(pluginRoot, '/resources/data/xiuxian_najie'),
  equipment_path: path.join(pluginRoot, '/resources/data/xiuxian_equipment'),
  // 宗门文件路径
  association_path: path.join(pluginRoot, '/resources/data/association'),
  db_config_path: path.join(pluginRoot, 'config', 'database', 'database.yaml')
};

async function migrate() {
  console.log('开始独立数据迁移 (包含宗门)...');

  // --- 建立数据库和Redis连接 ---
  let db, redisClient;
  try {
    const dbConfigYaml = fs.readFileSync(__PATH.db_config_path, 'utf8');
    const dbConfig = YAML.parse(dbConfigYaml);

    db = mysql.createPool({
      host: dbConfig.Database.host || 'localhost',
      user: dbConfig.Database.username,
      password: dbConfig.Database.password,
      database: dbConfig.Database.database || 'xiuxiandatabase'
    });
    const query = util.promisify(db.query).bind(db);

    const redisConfig = dbConfig.Redis || {};
    const redisUrl = `redis://${redisConfig.password ? `${redisConfig.password}@` : ''}${redisConfig.host || '127.0.0.1'}:${redisConfig.port || 6379}/${redisConfig.database || 0}`;

    console.log(`正在尝试连接到 Redis: ${redisConfig.host || '127.0.0.1'}:${redisConfig.port || 6379}`);

    // 使用配置创建 Redis 客户端
    redisClient = redis.createClient({
      url: redisUrl
    });

    redisClient.on('error', err => console.log('Redis Client Error', err));
    await redisClient.connect();

    console.log('数据库和Redis连接已建立。');

    // --- 迁移玩家JSON文件 (此部分不变) ---
    const playerFiles = fs.readdirSync(__PATH.player_path).filter(file => file.endsWith('.json'));
    console.log(`发现 ${playerFiles.length} 个玩家文件需要迁移。`);

    for (const file of playerFiles) {
      const userId = path.basename(file, '.json');
      try {
        const playerData = JSON.parse(fs.readFileSync(path.join(__PATH.player_path, file), 'utf-8'));
        const najieData = JSON.parse(fs.readFileSync(path.join(__PATH.najie_path, file), 'utf-8'));
        const equipmentData = JSON.parse(fs.readFileSync(path.join(__PATH.equipment_path, file), 'utf-8'));

        const mainKey = `XinghanXiuxian:Data:Player:${userId}`;
        const pipeline = redisClient.multi();
        pipeline.hSet(mainKey, {
          'player': JSON.stringify(playerData),
          'najie': JSON.stringify(najieData),
          'equipment': JSON.stringify(equipmentData)
        });
        await pipeline.exec();

      } catch (error) {
        console.error(`迁移用户 ${userId} 失败:`, error);
      }
    }
    console.log('玩家JSON文件迁移完成。');

    // --- 迁移宗门JSON文件 ---
    const associationFiles = fs.readdirSync(__PATH.association_path).filter(file => file.endsWith('.json'));
    console.log(`发现 ${associationFiles.length} 个宗门文件需要迁移。`);

    for (const file of associationFiles) {
      const sectName = path.basename(file, '.json');
      try {
        const sectData = JSON.parse(fs.readFileSync(path.join(__PATH.association_path, file), 'utf-8'));

        // 宗门数据直接以字符串形式存入一个独立的Key中
        const sectKey = `XinghanXiuxian:Data:Association:${sectName}`;
        await redisClient.set(sectKey, JSON.stringify(sectData));

      } catch (error) {
        console.error(`迁移宗门 ${sectName} 失败:`, error);
      }
    }
    console.log('宗门JSON文件迁移完成。');

  } catch (error) {
    console.error('迁移过程中发生严重错误:', error);
  } finally {
    // --- 关闭连接 ---
    if (redisClient) {
      await redisClient.quit();
    }
    if (db) {
      db.end();
    }
    console.log('迁移脚本执行完毕，连接已关闭。');
  }
}

migrate();
