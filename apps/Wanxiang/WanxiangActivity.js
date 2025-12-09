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
    let tempClient = null;
    try {
        tempClient = await getTempRedis();
        await tempClient.del(KEY_PREFIX + e.user_id);
        await tempClient.disconnect();
        e.reply('已放弃当前的试炼进度。');
    } catch (err) {
        console.error('[Wanxiang] quitRun Redis Error:', err);
        if (tempClient) await tempClient.disconnect();
        e.reply('退出试炼失败：' + err.message);
    }
  }
  async showStatus(e) {
    const userId = e.user_id;
    let tempClient = null;
    let dataStr = null;
    try {
        tempClient = await getTempRedis();
        dataStr = await tempClient.get(KEY_PREFIX + userId);
        await tempClient.disconnect();
    } catch (err) {
        console.error('[Wanxiang] showStatus Redis Error:', err);
        if (tempClient) await tempClient.disconnect();
        return e.reply('查询状态失败：' + err.message);
    }

    if (!dataStr) return e.reply('你当前没有进行中的试炼。发送 #开启试炼 来开始。');
    
    const data = JSON.parse(dataStr);
    
    let msg = `【万象天机】 第 ${data.layer} 层\n`;
    msg += `----------------\n`;
    data.souls.forEach(s => {
        const status = s.is_dead ? '已阵亡' : `${s.current_hp}/${s.max_hp}`;
        msg += `${s.name}: ${status}\n`;
    });
    msg += `----------------\n`;
    msg += `已获赐福: ${data.buffs.length > 0 ? data.buffs.map(b => BUFFS.find(cb => cb.id === b)?.name || b).join(', ') : '暂无'}`;
    
    e.reply(msg);
  }
  async challengeLayer(e) {
    const userId = e.user_id;
    let tempClient = null;
    let runData = null;
    let dataStr = null;

    try {
        tempClient = await getTempRedis();
        dataStr = await tempClient.get(KEY_PREFIX + userId);
        if (!dataStr) {
            await tempClient.disconnect();
            return e.reply('请先 #开启试炼。');
        }
        
        runData = JSON.parse(dataStr);
        const layerConfig = STAGES.find(s => s.layer === runData.layer);
        
        if (!layerConfig) {
            // 如果找不到配置，说明通关了所有配置的层数
            await tempClient.del(KEY_PREFIX + userId);
            await tempClient.disconnect();
            return e.reply('恭喜你！你已经通关了目前开放的所有试炼层数！');
        }

        // 1. 准备我方战斗单位 (应用血量继承)
        const battleSouls = [];
        const deadSouls = [];
        
        for (const soulState of runData.souls) {
            if (soulState.is_dead) {
                deadSouls.push(soulState.name);
                continue;
            }
            
            // 找到原始配置
            const originalConfig = ALL_SOULS.find(s => s.name === soulState.name);
            if (originalConfig) {
                // 浅拷贝配置，以免修改原始数据
                const battleConfig = { ...originalConfig };
                // 注入当前血量，这需要 Combatant 能支持
                battleConfig.current_hp_inherit = soulState.current_hp;
                // 注入 Buff (暂时略，后续实现)
                
                battleSouls.push(battleConfig);
            }
        }

        if (battleSouls.length === 0) {
            // 全员阵亡，试炼结束
            await tempClient.del(KEY_PREFIX + userId);
            await tempClient.disconnect();
            return e.reply('你的队伍已全军覆没，试炼失败！请 #退出试炼 重新开始。');
        }

        // 2. 准备敌方
        const enemyNames = layerConfig.monsters;

        e.reply(`第 ${runData.layer} 层挑战开始！\n敌人：${enemyNames.join('、')}`);

        // 3. 运行战斗
        const result = await runCombat(battleSouls, enemyNames);
        
        // 4. 结算逻辑
        const finalPlayerCombatants = result.playerTeam;

        // 更新 Redis 中的状态
        for (const soulState of runData.souls) {
            const combatant = finalPlayerCombatants.find(c => c.name === soulState.name);
            
            if (combatant) {
                soulState.current_hp = combatant.current_hp;
                if (combatant.current_hp <= 0) {
                    soulState.is_dead = true;
                    soulState.current_hp = 0;
                }
            }
        }

        // 渲染日志
        const renderData = {
          log: result.log,
          pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
        };

        const dataForPuppeteer = await new Show(e).get_imgData('astral_combat_log', renderData);
        const img = await puppeteer.screenshot('astral_combat_log', { ...dataForPuppeteer });
        await e.reply(img);

        if (result.playerWon) {
            runData.layer++;
            await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
            await tempClient.disconnect(); // 成功结束时断开
            
            // TODO: 触发 Buff 选择
            e.reply(`战斗胜利！全队状态已保存。\n即将进入第 ${runData.layer} 层。\n发送 #挑战 继续前进！`);
        } else {
            // 失败更新（记录死亡状态）
            await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
            await tempClient.disconnect(); // 失败结束时断开
            e.reply('战斗失败！你的队伍遭受重创。发送 #试炼状态 查看剩余战力，或 #退出试炼 重新开始。');
        }
    } catch (err) {
        console.error('[Wanxiang] challengeLayer Error:', err);
        if (tempClient) await tempClient.disconnect(); // 错误时断开
        return e.reply('挑战失败：' + err.message);
    }
  }
}