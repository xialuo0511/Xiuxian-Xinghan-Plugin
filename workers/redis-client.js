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
  });
}