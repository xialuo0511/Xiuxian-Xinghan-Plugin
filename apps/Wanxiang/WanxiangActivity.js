import plugin from '../../../../lib/plugins/plugin.js';
import * as DAL from '../../api/data-access.js';
import { redisClient } from '../../api/redis.js';
import { loadItemConfig } from '../../model/ConfigLoader.js';
import { runCombat } from '../../logic/combat/CombatEngine.js';
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';

const STAGES = loadItemConfig('wanxiang_stages.yaml') || [];
const BUFFS = loadItemConfig('wanxiang_buffs.yaml') || [];
const ALL_SOULS = loadItemConfig('star_souls.yaml') || [];
const ALL_MONSTERS = loadItemConfig('monsters.yaml') || [];

const KEY_PREFIX = 'xiuxian:wanxiang:play:';

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

  /**
   * 开启一次新的试炼 run
   */
  async startRun(e) {
    console.log('[Wanxiang] startRun called for user', e.user_id);
    const userId = e.user_id;

    console.log('[Wanxiang] Checking redis client...');
    if (!redisClient) {
        console.error('[Wanxiang] redisClient is undefined!');
        return e.reply('系统错误：数据库未连接');
    }
    // Node Redis v4 use .isOpen property
    console.log('[Wanxiang] redisClient.isOpen:', redisClient.isOpen);

    let existData = null;
    try {
        const getPromise = redisClient.get(KEY_PREFIX + userId);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 5000));
        
        existData = await Promise.race([getPromise, timeoutPromise]);
        console.log('[Wanxiang] existData check done:', existData);
    } catch (err) {
        console.error('[Wanxiang] Redis Error:', err);
        return e.reply('数据库读取失败：' + err.message);
    }
    
    if (existData) {
        return e.reply('你当前已有正在进行的试炼，请先 #挑战 或 #退出试炼。');
    }

    // 2. 获取玩家装备的星魂
    const playerData = (await DAL.getAllPlayerData(userId))?.player;
    console.log('[Wanxiang] playerData fetched:', !!playerData);
    
    if (!playerData) return e.reply('你尚未踏入仙途。');

    const equipped = playerData.equipped_star_souls || {};
    const equippedNames = Object.values(equipped).filter(Boolean);
    
    if (equippedNames.length === 0) {
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
    console.log('[Wanxiang] soulsState built, length:', soulsState.length);

    if (soulsState.length === 0) return e.reply('数据异常，无法获取星魂数据。');

    const runData = {
        layer: 1,
        souls: soulsState,
        buffs: [],
        start_time: Date.now()
    };

    await redisClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
    console.log('[Wanxiang] redis set done');
    
    e.reply([
        '【万象天机·无尽试炼】已开启！',
        `当前出战星魂：${soulsState.map(s => s.name).join('、')}`,
        '发送 #挑战 即可开始第 1 层的战斗。'
    ]);
  }

  /**
   * 退出/放弃
   */
  async quitRun(e) {
    await redisClient.del(KEY_PREFIX + e.user_id);
    e.reply('已放弃当前的试炼进度。');
  }

  /**
   * 查看状态
   */
  async showStatus(e) {
    const dataStr = await redisClient.get(KEY_PREFIX + e.user_id);
    if (!dataStr) return e.reply('你当前没有进行中的试炼。发送 #开启试炼 来开始。');
    
    const data = JSON.parse(dataStr);
    
    let msg = `【万象天机】 第 ${data.layer} 层\n`;
    msg += `----------------\n`;
    data.souls.forEach(s => {
        const status = s.is_dead ? '已阵亡' : `${s.current_hp}/${s.max_hp}`;
        msg += `${s.name}: ${status}\n`;
    });
    msg += `----------------\n`;
    msg += `已获赐福: ${data.buffs.length > 0 ? data.buffs.join(', ') : '暂无'}`;
    
    e.reply(msg);
  }

  /**
   * 挑战当前层
   */
  async challengeLayer(e) {
    const userId = e.user_id;
    const dataStr = await redisClient.get(KEY_PREFIX + userId);
    if (!dataStr) return e.reply('请先 #开启试炼。');
    
    const runData = JSON.parse(dataStr);
    const layerConfig = STAGES.find(s => s.layer === runData.layer);
    
    if (!layerConfig) {
        // 如果找不到配置，说明通关了所有配置的层数
        // 或者进入了无尽模式（暂时算通关）
        await redisClient.del(KEY_PREFIX + userId);
        return e.reply('恭喜你！你已经通关了目前开放的所有试炼层数！');
    }

    // 1. 准备我方战斗单位 (应用血量继承)
    // 这里我们需要把 runData.souls 转回 CombatEngine 能识别的格式
    // 并且要把 current_hp 塞进去。
    // 注意：目前 CombatEngine 还不支持直接传 current_hp，我们需要先修改 CombatEngine/Combatant
    
    // 构造战斗用的 souls 数组
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
            // 注入当前血量，这需要 Combatant 类支持
            battleConfig.current_hp_inherit = soulState.current_hp;
            // 注入 Buff (暂时略，后续实现)
            
            battleSouls.push(battleConfig);
        }
    }

    if (battleSouls.length === 0) {
        return e.reply('你的队伍已全军覆没，试炼失败！请 #退出试炼 重新开始。');
    }

    // 2. 准备敌方
    const enemyNames = layerConfig.monsters;

    e.reply(`第 ${runData.layer} 层挑战开始！\n敌人：${enemyNames.join('、')}`);

    // 3. 运行战斗
    // 我们需要修改 runCombat 及其 Combatant 逻辑来支持 current_hp_inherit
    const result = await runCombat(battleSouls, enemyNames);
    
        // 4. 结算逻辑
        const finalPlayerCombatants = result.playerTeam;
    
        // 更新 Redis 中的状态
        for (const soulState of runData.souls) {
            // 在战斗结果中找到对应的单位
            const combatant = finalPlayerCombatants.find(c => c.name === soulState.name);
            
            // 如果这个星魂参加了战斗（未阵亡状态），则更新血量
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
            // 保存进度
            await redisClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
            
            // TODO: 触发 Buff 选择
            e.reply(`战斗胜利！全队状态已保存。\n即将进入第 ${runData.layer} 层。\n发送 #挑战 继续前进！`);
        } else {
            // 失败更新（记录死亡状态）
            await redisClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
            e.reply('战斗失败！你的队伍遭受重创。发送 #试炼状态 查看剩余战力，或 #退出试炼 重新开始。');
        }
      }
    }