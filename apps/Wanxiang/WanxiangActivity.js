import plugin from '../../../../lib/plugins/plugin.js';
import * as DAL from '../../api/data-access.js';
// import { redisClient } from '../../api/redis.js'; // 暂时注释掉
import { createClient } from 'redis';
import fs from 'fs';
import YAML from 'yaml';
import { loadItemConfig } from '../../model/ConfigLoader.js';
import { runCombat } from '../../logic/combat/CombatEngine.js';
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';

const STAGES = loadItemConfig('wanxiang_stages.yaml') || [];
const BUFFS = loadItemConfig('wanxiang_buffs.yaml') || [];
const ALL_SOULS = loadItemConfig('star_souls.yaml') || [];
const ALL_MONSTERS = loadItemConfig('monsters.yaml') || [];

const KEY_PREFIX = 'xiuxian:wanxiang:play:';

// 临时辅助函数：创建连接
async function getTempRedis() {
    const redisConfigPath = `${process.cwd()}/config/config/redis.yaml`;
    const redisConfig = YAML.parse(fs.readFileSync(redisConfigPath, 'utf8'));
    const client = createClient({
        url: `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`
    });
    await client.connect();
    return client;
}

export class WanxiangActivity extends plugin {
  constructor() {
    super({
      name: '万象天机活动',
      dsc: 'Roguelike爬塔玩法',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^#开启试炼$/, fnc: 'startRun' },
        { reg: /^#挑战$/, fnc: 'challengeLayer' },
        { reg: /^#试炼状态$/, fnc: 'showStatus' },
        { reg: /^#退出试炼$/, fnc: 'quitRun' }
      ]
    });
  }

  async startRun(e) {
    console.log('[Wanxiang] startRun called for user', e.user_id);
    const userId = e.user_id;

    let tempClient = null;
    let existData = null;
    
    try {
        console.log('[Wanxiang] Connecting temp redis...');
        tempClient = await getTempRedis();
        console.log('[Wanxiang] Temp redis connected.');
        
        existData = await tempClient.get(KEY_PREFIX + userId);
        console.log('[Wanxiang] existData check done:', existData);
        
        if (existData) {
            await tempClient.disconnect();
            return e.reply('你当前已有正在进行的试炼，请先 #挑战 或 #退出试炼。');
        }

        // 2. 获取玩家装备的星魂
        const playerData = (await DAL.getAllPlayerData(userId))?.player;
        if (!playerData) {
            await tempClient.disconnect();
            return e.reply('你尚未踏入仙途。');
        }

        const equipped = playerData.equipped_star_souls || {};
        const equippedNames = Object.values(equipped).filter(Boolean);
        
        if (equippedNames.length === 0) {
            await tempClient.disconnect();
            return e.reply('你没有装备任何星魂，无法参加试炼。请先去 #星魂装备。');
        }

        // 3. 构建初始状态快照
        const soulsState = [];
        for (let i = 1; i <= 4; i++) {
            const name = equipped[i];
            if (name) {
                const soulConfig = ALL_SOULS.find(s => s.name === name);
                if (soulConfig) {
                    soulsState.push({
                        slot: i,
                        name: name,
                        max_hp: soulConfig.base_stats.health,
                        current_hp: soulConfig.base_stats.health,
                        is_dead: false,
                        config: soulConfig 
                    });
                }
            }
        }

        if (soulsState.length === 0) {
            await tempClient.disconnect();
            return e.reply('数据异常，无法获取星魂数据。');
        }

        const runData = {
            layer: 1,
            souls: soulsState,
            buffs: [],
            start_time: Date.now()
        };

        await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
        await tempClient.disconnect();
        
        e.reply([
            '【万象天机·无尽试炼】已开启！',
            `当前出战星魂：${soulsState.map(s => s.name).join('、')}`,
            '发送 #挑战 即可开始第 1 层的战斗。'
        ]);

    } catch (err) {
        console.error('[Wanxiang] Error:', err);
        if (tempClient) await tempClient.disconnect();
        return e.reply('系统错误：' + err.message);
    }
  }

  // 需要同步更新 quitRun, showStatus, challengeLayer 以使用临时连接，或者修复 redisClient
  // 为了一次性验证，先只修改 startRun。如果 startRun 能用，我们再考虑如何优雅地修复全局 redisClient。
  
  async quitRun(e) {
      // 占位，避免报错，实际逻辑需要 copy tempClient 逻辑
      return e.reply('维护中，请稍后。');
  }
  async showStatus(e) { return e.reply('维护中。'); }
  async challengeLayer(e) { return e.reply('维护中。'); }
}