import { createClient } from 'redis';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';

function initializeClient() {

  const redisConfigPath = path.join(process.cwd(), 'config', 'config', 'redis.yaml');
  const redisConfig = YAML.parse(fs.readFileSync(redisConfigPath, 'utf8'));

  const client = createClient({
    url: `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`,
    socket: {
      connectTimeout: 10000,  // 10 秒连接超时
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('[星瀚修仙-Redis] 重连超过 10 次，停止重试');
          return false;
        }
        const delay = Math.min(retries * 1000, 5000);
        console.log(`[星瀚修仙-Redis] 连接失败，${delay}ms 后第 ${retries} 次重试...`);
        return delay;
      }
    }
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