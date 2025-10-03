import { createClient } from 'redis';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';

function initializeClient() {
  const redisConfigPath = path.join(process.cwd(), 'config', 'config', 'redis.yaml');
  const redisConfig = YAML.parse(fs.readFileSync(redisConfigPath, 'utf8'));

  const client = createClient({
    url: `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`
  });

  client.on('error', (err) => {
    if (typeof logger !== 'undefined') {
      logger.error('[星瀚修仙-Redis] 专属客户端发生错误:', err);
    } else {
      console.error('[星瀚修仙-Redis] 专属客户端发生错误:', err);
    }
  });

  client.connect().then(() => {
    if (typeof logger !== 'undefined') {
      logger.info('[星瀚修仙-Redis] 专属客户端连接成功。');
    } else {
      console.log('[星瀚修仙-Redis] 专属客户端连接成功。');
    }
  }).catch((err) => {
    if (typeof logger !== 'undefined') {
      logger.error('[星瀚修仙-Redis] 专属客户端连接失败:', err);
    } else {
      console.error('[星瀚修仙-Redis] 专属客户端连接失败:', err);
    }
  });

  return client;
}

// Export the single, created instance for other modules to use
export const redisClient = initializeClient();