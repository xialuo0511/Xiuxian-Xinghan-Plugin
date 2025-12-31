import plugin from '../../../../lib/plugins/plugin.js';
import { createClient } from 'redis';
import fs from 'fs';
import YAML from 'yaml';

async function getTempRedis() {
  const redisConfigPath = `${process.cwd()}/config/config/redis.yaml`;
  const redisConfig = YAML.parse(fs.readFileSync(redisConfigPath, 'utf8'));
  const client = createClient({
    url: `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`
  });
  await client.connect();
  return client;
}

export class WanxiangScheduler extends plugin {
    constructor() {
        super({
            name: '万象天机周结算',
            dsc: '每周一结算排行榜奖励',
            event: 'message',
            priority: 1000,
            rule: []
        });
        this.task = null;
    }

    async init() {
        this.scheduleNextSettlement();
    }

    scheduleNextSettlement() {
        const now = new Date();
        const nextMonday = new Date();
        nextMonday.setDate(now.getDate() + (1 + 7 - now.getDay()) % 7);
        nextMonday.setHours(10, 0, 0, 0);
        
        // 如果计算出的时间是今天且已经过了10点，或者是过去的时间，则推到下周
        if (nextMonday <= now) {
            nextMonday.setDate(nextMonday.getDate() + 7);
        }
        
        const delay = nextMonday.getTime() - now.getTime();
        logger.mark(`[万象天机] 下次结算时间: ${nextMonday.toLocaleString()} (将在 ${Math.floor(delay/1000/60)} 分钟后)`);
        
        if (this.task) clearTimeout(this.task);
        this.task = setTimeout(() => {
            this.runSettlement();
            this.scheduleNextSettlement();
        }, delay);
    }

    async runSettlement() {
        logger.mark('[万象天机] 开始执行周榜结算...');
        let client = null;
        try {
            client = await getTempRedis();
            const key = 'xiuxian:wanxiang:rank:weekly';
            // Manual ZREVRANGE for compatibility
            const rawList = await client.sendCommand(['ZREVRANGE', key, '0', '-1', 'WITHSCORES']);
            const users = [];
            if (rawList && rawList.length > 0) {
                for (let i = 0; i < rawList.length; i += 2) {
                    users.push({ value: rawList[i], score: parseInt(rawList[i + 1]) });
                }
            }
            
            if (!users || users.length === 0) {
                logger.mark('[万象天机] 本周无人上榜。');
                await client.disconnect();
                return;
            }

            for (let i = 0; i < users.length; i++) {
                const userId = users[i].value;
                const rank = i + 1;
                let reward = 0;
                
                if (rank === 1) reward = 3000;
                else if (rank === 2) reward = 2000;
                else if (rank === 3) reward = 1200;
                else if (rank <= 5) reward = 800;
                else if (rank <= 10) reward = 500;
                else reward = 300;
                
                // Grant Reward
                // User Data Key: xiuxian:wanxiang:userdata:userId
                const userDataKey = `xiuxian:wanxiang:userdata:${userId}`;
                await client.hIncrBy(userDataKey, 'jade', reward);
                
                // Optional: Notify user
                try {
                    if (global.Bot) {
                        const msg = `【万象天机·周结】\n恭喜！您在本周试炼中排名第 ${rank}，获得奖励：${reward} 天机玉。`;
                        let u = Bot.pickUser(userId);
                        if (u && u.sendMsg) await u.sendMsg(msg);
                    }
                } catch (e) { /* ignore */ }
            }
            
            // Clear Leaderboard
            await client.del(key);
            logger.mark(`[万象天机] 结算完成，发放奖励人数: ${users.length}`);
            
        } catch (err) {
            logger.error('[万象天机] 结算失败:', err);
        } finally {
            if (client) await client.disconnect();
        }
    }
}
