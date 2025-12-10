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
        { reg: /^#选择赐福\s*(\d)$/, fnc: 'selectBuff' },
        { reg: /^#刷新赐福$/, fnc: 'refreshBuffChoices' }, // 新增
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
        start_time: Date.now(),
        refresh_count: 3 // 初始化刷新次数
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

    // 准备渲染数据
    const soulsData = data.souls.map(s => ({
      ...s,
      hp_percent: s.max_hp > 0 ? (s.current_hp / s.max_hp * 100).toFixed(1) : 0
    }));

    const buffsData = (data.buffs || []).map(buffId => {
      const config = BUFFS.find(b => b.id === buffId);
      return config || { name: buffId, desc: '未知效果', rarity: 1 };
    });

    const renderData = {
      layer: data.layer,
      souls: soulsData,
      buffs: buffsData,
      refreshCount: data.refresh_count, // 传递刷新次数给模板
      pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
    };

    const dataForPuppeteer = await new Show(e).get_imgData('wanxiang_status', renderData);
    const img = await puppeteer.screenshot('wanxiang_status', { ...dataForPuppeteer });
    await e.reply(img);
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
          // 浅拷贝配置
          const battleConfig = { ...originalConfig };
          // 【修复】深拷贝 base_stats，防止污染全局配置导致 Buff 无限叠加
          battleConfig.base_stats = { ...originalConfig.base_stats };

          // 注入当前血量，这需要 Combatant 类支持
          battleConfig.current_hp_inherit = soulState.current_hp;
          // 注入 Buff
          const activeBuffs = runData.buffs || [];
          activeBuffs.forEach(buffId => {
            const buff = BUFFS.find(b => b.id === buffId);
            if (!buff) return;

            if (buff.type === 'atk_pct') {
              battleConfig.base_stats.attack = Math.floor(battleConfig.base_stats.attack * (1 + buff.value));
            } else if (buff.type === 'def_pct') {
              battleConfig.base_stats.defense = Math.floor(battleConfig.base_stats.defense * (1 + buff.value));
            } else if (buff.type === 'max_hp_pct') {
              const hpAdd = Math.floor(battleConfig.base_stats.health * buff.value);
              battleConfig.base_stats.health += hpAdd;
              if (battleConfig.current_hp_inherit !== undefined) {
                battleConfig.current_hp_inherit += hpAdd;
              }
            } else if (buff.type === 'crit_rate') {
              battleConfig.crit_rate = (battleConfig.crit_rate || 0) + buff.value;
            } else if (buff.type === 'crit_dmg') {
              battleConfig.crit_dmg = (battleConfig.crit_dmg || 1.5) + buff.value;
            } else if (buff.type === 'element_dmg') {
              if (!battleConfig.elemental_buffs) battleConfig.elemental_buffs = {};
              if (!battleConfig.elemental_buffs[buff.element]) battleConfig.elemental_buffs[buff.element] = 0;
              battleConfig.elemental_buffs[buff.element] += buff.value;
            } else if (buff.type === 'heal_turn') {
              if (!battleConfig.passive_skills) battleConfig.passive_skills = [];
              battleConfig.passive_skills.push({ type: 'heal_turn', value: buff.value });
            }
          });
          battleSouls.push(battleConfig);
        }
      }

      if (battleSouls.length === 0) {
        // 全员阵亡，试炼结束
        await tempClient.del(KEY_PREFIX + userId);
        await tempClient.disconnect();
        return e.reply('你的队伍已全军覆没，试炼失败！请 #退出试炼 重新开始。');
      }

      // 2. 准备敌方 (应用动态难度缩放)
      const enemyNames = layerConfig.monsters;
      e.reply(`第 ${runData.layer} 层挑战开始！\n敌人：${enemyNames.join('、')}`);

      const enemyTeamConfig = enemyNames.map(name => {
        const original = ALL_MONSTERS.find(m => m.name === name);
        if (!original) return null;

        // 深拷贝以应用修改
        const mob = JSON.parse(JSON.stringify(original));

        // 难度系数：基础成长 (每层8%) + Boss层修正
        let multiplier = 1 + (runData.layer - 1) * 0.08;
        if (runData.layer % 5 === 0) multiplier *= 1.2; // Boss层额外增强 20%

        mob.base_stats.health = Math.floor(mob.base_stats.health * multiplier);
        mob.base_stats.attack = Math.floor(mob.base_stats.attack * multiplier);
        mob.base_stats.defense = Math.floor(mob.base_stats.defense * multiplier);

        return mob;
      }).filter(Boolean);

      // 3. 运行战斗 (限制 10 回合)
      const result = await runCombat(battleSouls, enemyTeamConfig, runData.buffs, 10);

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
        const justClearedLayer = runData.layer;
        runData.layer++;
        
        // Boss层 (5的倍数) 奖励双倍选择次数
        let pickCount = 1;
        if (justClearedLayer % 5 === 0) {
            pickCount = 2;
        }
        runData.remaining_picks = pickCount;

        // 随机抽取 3 个 Buff (加权)
        const choices = [];
        const pool = [...BUFFS];
        const RARITY_WEIGHTS = { 1: 100, 2: 30, 3: 5 };

        const getWeightedRandom = (candidates) => {
          let totalWeight = 0;
          candidates.forEach(b => totalWeight += (RARITY_WEIGHTS[b.rarity] || 100));
          let r = Math.random() * totalWeight;
          for (const b of candidates) {
            r -= (RARITY_WEIGHTS[b.rarity] || 100);
            if (r <= 0) return b;
          }
          return candidates[0];
        };

        for (let i = 0; i < 3; i++) {
          if (pool.length === 0) break;
          const selected = getWeightedRandom(pool);
          choices.push(selected);
          const idx = pool.indexOf(selected);
          if (idx > -1) pool.splice(idx, 1);
        }

        runData.pending_buffs = choices.map(b => b.id);

        await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
        await tempClient.disconnect();

        let buffMsg = `战斗胜利！全队状态已保存。\n即将进入第 ${runData.layer} 层。\n\n【天机赐福】${pickCount > 1 ? ` (本层可选 ${pickCount} 个)` : ''}\n请发送 #选择赐福 [序号] 获取增益：\n`;
        choices.forEach((b, i) => {
          const stars = '★'.repeat(b.rarity || 1);
          buffMsg += `${i + 1}. [${stars}] 【${b.name}】\n   ${b.desc}\n`;
        });

        e.reply(buffMsg);
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

  async refreshBuffChoices(e) {
    const userId = e.user_id;
    let tempClient = null;
    let dataStr = null;

    try {
      tempClient = await getTempRedis();
      dataStr = await tempClient.get(KEY_PREFIX + userId);
      if (!dataStr) {
        await tempClient.disconnect();
        return e.reply('请先 #开启试炼。');
      }

      const runData = JSON.parse(dataStr);

      if (!runData.pending_buffs || runData.pending_buffs.length === 0) {
        await tempClient.disconnect();
        return e.reply('当前没有待选择的赐福，无法刷新。请先 #挑战。');
      }

      if (runData.refresh_count <= 0) {
        await tempClient.disconnect();
        return e.reply('刷新赐福的机会已用尽！');
      }

      runData.refresh_count--; // 消耗一次刷新机会

      // 重新生成 3 个赐福选项 (复用 challengeLayer 中的逻辑)
      const choices = [];
      const pool = [...BUFFS]; // 确保这里是全局 BUFFS
      const RARITY_WEIGHTS = { 1: 100, 2: 30, 3: 5 };

      const getWeightedRandom = (candidates) => {
        let totalWeight = 0;
        candidates.forEach(b => totalWeight += (RARITY_WEIGHTS[b.rarity] || 100));
        let r = Math.random() * totalWeight;
        for (const b of candidates) {
          r -= (RARITY_WEIGHTS[b.rarity] || 100);
          if (r <= 0) return b;
        }
        return candidates[0];
      };

      for (let i = 0; i < 3; i++) {
        if (pool.length === 0) break;
        const selected = getWeightedRandom(pool);
        choices.push(selected);
        const idx = pool.indexOf(selected);
        if (idx > -1) pool.splice(idx, 1);
      }

      runData.pending_buffs = choices.map(b => b.id); // 更新待选赐福列表

      await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
      await tempClient.disconnect();

      let buffMsg = `赐福已刷新！剩余刷新机会：${runData.refresh_count} 次。\n\n【天机赐福】\n请发送 #选择赐福 [序号] 获取增益：\n`;
      choices.forEach((b, i) => {
        const stars = '★'.repeat(b.rarity || 1);
        buffMsg += `${i + 1}. [${stars}] 【${b.name}】\n   ${b.desc}\n`;
      });
      e.reply(buffMsg);

    } catch (err) {
      console.error('[Wanxiang] refreshBuffChoices Error:', err);
      if (tempClient) await tempClient.disconnect();
      e.reply('刷新赐福失败：' + err.message);
    }
  }

  async selectBuff(e) {
    const userId = e.user_id;
    const match = e.msg.match(/^#选择赐福\s*(\d)$/);
    const selection = parseInt(match[1]);

    let tempClient = null;
    try {
      tempClient = await getTempRedis();
      const dataStr = await tempClient.get(KEY_PREFIX + userId);

      if (!dataStr) {
        await tempClient.disconnect();
        return e.reply('请先 #开启试炼。');
      }

      const runData = JSON.parse(dataStr);
      if (!runData.pending_buffs || runData.pending_buffs.length === 0) {
        await tempClient.disconnect();
        return e.reply('当前没有待选择的赐福。请先 #挑战 获取胜利。');
      }

      if (selection < 1 || selection > runData.pending_buffs.length) {
        await tempClient.disconnect();
        return e.reply(`请选择 1-${runData.pending_buffs.length} 之间的序号。`);
      }

      const selectedBuffId = runData.pending_buffs[selection - 1];
      const buffConfig = BUFFS.find(b => b.id === selectedBuffId);

      // 加入已生效 Buff 列表
      runData.buffs.push(selectedBuffId);

      // 移除已选 (防止重复)
      const idxToRemove = selection - 1;
      runData.pending_buffs.splice(idxToRemove, 1);
      
      // 扣除次数
      runData.remaining_picks = (runData.remaining_picks || 1) - 1;

      // max_hp_pct 逻辑
      if (buffConfig && buffConfig.type === 'max_hp_pct') {
        runData.souls.forEach(soul => {
          if (!soul.is_dead) {
            const healAmount = Math.floor(soul.max_hp * buffConfig.value);
            soul.current_hp += healAmount;
          }
        });
        e.reply(`【${buffConfig.name}】生效！全员恢复了部分生命值。`);
      }

      if (runData.remaining_picks <= 0) {
          runData.pending_buffs = []; // 次数用尽，清空
      }

      await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
      await tempClient.disconnect();

      if (runData.remaining_picks > 0) {
          let buffMsg = `成功选择了【${buffConfig ? buffConfig.name : '未知'}】！\n★ 还可以再选择 ${runData.remaining_picks} 个赐福：\n`;
          runData.pending_buffs.forEach((bid, i) => {
             const b = BUFFS.find(bf => bf.id === bid);
             if(b) {
                const stars = '★'.repeat(b.rarity || 1);
                buffMsg += `${i + 1}. [${stars}] 【${b.name}】\n`;
             }
          });
          e.reply(buffMsg);
      } else {
          e.reply(`成功选择了【${buffConfig ? buffConfig.name : '未知'}】！\n发送 #挑战 继续前往下一层。`);
      }

    } catch (err) {
      console.error('[Wanxiang] selectBuff Error:', err);
      if (tempClient) await tempClient.disconnect();
      e.reply('选择失败：' + err.message);
    }
  }
}