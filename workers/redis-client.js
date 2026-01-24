// /workers/redis-client.js

import { createClient } from 'redis';
import fs from 'fs';
import YAML from 'yaml';
import path from 'path';

const redisConfigPath = path.join(process.cwd(), 'config', 'config', 'redis.yaml');
const redisConfig = YAML.parse(fs.readFileSync(redisConfigPath, 'utf8'));

export function createNewClient() {
  return createClient({
    url: `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`,
    socket: {
      connectTimeout: 10000,  // 10 秒连接超时
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('[Worker Redis] 重连超过 10 次，停止重试');
          return false;
        }
        const delay = Math.min(retries * 1000, 5000);
        console.log(`[Worker Redis] 连接失败，${delay}ms 后第 ${retries} 次重试...`);
        return delay;
      }
    }
  });
}