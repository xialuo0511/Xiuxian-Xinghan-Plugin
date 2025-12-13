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
        { reg: /^#刷新赐福$/, fnc: 'refreshBuffChoices' },
        { reg: /^#选择路线\s*(\d)$/, fnc: 'selectRoute' }, // 新增
        { reg: /^#事件选择\s*(\d)$/, fnc: 'handleEventChoice' }, // 新增
        { reg: /^#试炼状态$/, fnc: 'showStatus' },
        { reg: /^#退出试炼$/, fnc: 'quitRun' }
      ]
    });
  }

  // --- 核心流程 ---

  async startRun(e) {
    console.log('[Wanxiang] startRun called for user', e.user_id);
    const userId = e.user_id;

    let tempClient = null;
    let existData = null;

    try {
      tempClient = await getTempRedis();
      existData = await tempClient.get(KEY_PREFIX + userId);

      if (existData) {
        await tempClient.disconnect();
        return e.reply('你当前已有正在进行的试炼，请先 #挑战 或 #退出试炼。');
      }

      // 获取玩家数据
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

      // 构建星魂状态
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
              is_dead: false
            });
          }
        }
      }

      // 初始 RunData
      const runData = {
        layer: 1,
        souls: soulsState,
        buffs: [],
        start_time: Date.now(),
        refresh_count: 3,
        // 第一层默认为战斗
        current_node: { type: 'COMBAT', name: '激战', desc: '普通的战斗试炼。' },
        routes: [] // 待选路线
      };

      await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
      await tempClient.disconnect();

      e.reply([
        '【万象天机·无尽试炼】已开启！',
        `当前出战星魂：${soulsState.map(s => s.name).join('、')}`,
        '第 1 层为【激战】节点，发送 #挑战 即可开始。'
      ]);

    } catch (err) {
      console.error('[Wanxiang] Error:', err);
      if (tempClient) await tempClient.disconnect();
      return e.reply('系统错误：' + err.message);
    }
  }

  // --- 路线生成逻辑 ---
  generateRoutes(layer) {
    // Boss层 (5, 10...) 强制单一Boss节点
    if (layer % 5 === 0) {
        return [{ type: 'BOSS', name: '首领降临', desc: '极为危险的强敌，击败后可获得双倍赐福。', rarity: 5 }];
    }

    // 随机生成 2-3 个选项
    const options = [];
    const count = 2 + (Math.random() > 0.5 ? 1 : 0); // 2 or 3 options
    
    // 节点池定义
    const types = [
        { type: 'COMBAT', name: '激战', desc: '普通的战斗，胜利获得赐福。', weight: 50 },
        { type: 'ELITE', name: '精英', desc: '强敌出没！属性提升30%，必掉高级赐福。', weight: 20 },
        { type: 'REST', name: '修整', desc: '一处安全的营地，可恢复状态。', weight: 15 },
        { type: 'EVENT', name: '奇遇', desc: '未知的机遇或风险。', weight: 15 }
    ];

    // 简单的权重随机
    const getWeightedType = () => {
        let total = types.reduce((acc, t) => acc + t.weight, 0);
        let r = Math.random() * total;
        for (let t of types) {
            r -= t.weight;
            if (r <= 0) return t;
        }
        return types[0];
    };

    for(let i=0; i<count; i++) {
        // 避免完全重复的类型 (可选优化，目前暂允许重复)
        const t = getWeightedType();
        options.push({ ...t }); // Clone
    }
    
    // 每一层至少要有一个战斗选项，防止连续修整导致无聊? 
    // 不强制，因为几率低。
    return options;
  }

  // --- 选择路线 ---
  async selectRoute(e) {
    const userId = e.user_id;
    const match = e.msg.match(/^#选择路线\s*(\d)$/);
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
      
      if (!runData.routes || runData.routes.length === 0) {
        await tempClient.disconnect();
        return e.reply('当前无需选择路线。若刚结束战斗，请先完成 #选择赐福。');
      }

      if (selection < 1 || selection > runData.routes.length) {
        await tempClient.disconnect();
        return e.reply(`请选择 1-${runData.routes.length} 之间的路线。`);
      }

      // 确认选择
      const node = runData.routes[selection - 1];
      runData.current_node = node;
      runData.routes = []; // 清空待选
      
      await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
      await tempClient.disconnect();

      // 根据节点类型反馈
      if (node.type === 'COMBAT' || node.type === 'ELITE' || node.type === 'BOSS') {
          e.reply(`你选择了【${node.name}】。\n敌人已在前方，发送 #挑战 开始战斗！`);
      } else if (node.type === 'REST') {
          e.reply([
              '你来到了一处隐蔽的营地，这里似乎很安全。',
              '请做出选择：',
              '1. 【休养生息】 全队恢复 40% 生命值',
              '2. 【招魂仪式】 复活一名随机阵亡队友 (50%血量)',
              '3. 【冥想】 获得 1 次赐福刷新机会',
              '发送 #事件选择 [序号] 确认。'
          ].join('\n'));
      } else if (node.type === 'EVENT') {
          // 暂时做一个简单的通用事件
          e.reply([
              '你在废墟中发现了一台古老的贩卖机。',
              '请做出选择：',
              '1. 【购买补给】 消耗 20% 当前生命值，随机强化一个赐福 (暂未实装，改为回血10%)',
              '2. 【暴力破解】 试图砸开它 (50%获得随机3星赐福，50%受伤)',
              '3. 【离开】 什么都不做',
              '发送 #事件选择 [序号] 确认。'
          ].join('\n'));
      }

    } catch (err) {
      console.error(err);
      if (tempClient) await tempClient.disconnect();
    }
  }

  // --- 处理事件/修整选择 ---
  async handleEventChoice(e) {
    const userId = e.user_id;
    const match = e.msg.match(/^#事件选择\s*(\d)$/);
    const selection = parseInt(match[1]);
    
    let tempClient = null;
    try {
      tempClient = await getTempRedis();
      const dataStr = await tempClient.get(KEY_PREFIX + userId);
      if (!dataStr) { await tempClient.disconnect(); return; }

      const runData = JSON.parse(dataStr);
      const node = runData.current_node;

      if (!node || (node.type !== 'REST' && node.type !== 'EVENT')) {
          await tempClient.disconnect();
          return e.reply('当前不在事件节点，无法选择。');
      }

      let replyMsg = '';
      let isDone = false;

      // 简单的逻辑处理
      if (node.type === 'REST') {
          if (selection === 1) { // 回血
              runData.souls.forEach(s => {
                  if (!s.is_dead) s.current_hp = Math.min(s.max_hp, s.current_hp + Math.floor(s.max_hp * 0.4));
              });
              replyMsg = '全员恢复了大量生命值。';
              isDone = true;
          } else if (selection === 2) { // 复活
              const deadSouls = runData.souls.filter(s => s.is_dead);
              if (deadSouls.length > 0) {
                  const luckydog = deadSouls[Math.floor(Math.random() * deadSouls.length)];
                  luckydog.is_dead = false;
                  luckydog.current_hp = Math.floor(luckydog.max_hp * 0.5);
                  replyMsg = `【${luckydog.name}】被复活了！`;
              } else {
                  replyMsg = '没有阵亡的队友，但你还是休息了一会儿。';
              }
              isDone = true;
          } else if (selection === 3) { // 刷新次数
              runData.refresh_count = (runData.refresh_count || 0) + 1;
              replyMsg = '你的思维变得更加敏捷了 (+1 刷新次数)。';
              isDone = true;
          }
      } else if (node.type === 'EVENT') {
          // 贩卖机逻辑
          if (selection === 1) {
             // 假装买补给 (回血小)
             runData.souls.forEach(s => {
                 if (!s.is_dead) s.current_hp = Math.min(s.max_hp, s.current_hp + Math.floor(s.max_hp * 0.1));
             });
             replyMsg = '你喝下了一瓶过期的能量饮料，感觉好一点了。';
             isDone = true;
          } else if (selection === 2) {
             const rand = Math.random();
             if (rand > 0.5) {
                 // 成功：给一个 Buff (直接塞进去)
                 // 简化：给一个 heal_turn Buff
                 if (!runData.buffs.includes('heal_after_turn_1')) {
                    runData.buffs.push('heal_after_turn_1');
                    replyMsg = '哐当一声，掉出来一个【生命回复·小】赐福！';
                 } else {
                    replyMsg = '贩卖机吐出了一枚硬币，但你不知道有什么用。';
                 }
             } else {
                 // 失败：扣血
                 runData.souls.forEach(s => {
                     if (!s.is_dead) s.current_hp = Math.floor(s.current_hp * 0.8);
                 });
                 replyMsg = '贩卖机爆炸了！全员受到伤害。';
             }
             isDone = true;
          } else {
             replyMsg = '你谨慎地离开了。';
             isDone = true;
          }
      }

      if (isDone) {
          e.reply(replyMsg);
          // 事件结束，层数+1，生成新路线
          runData.layer++;
          runData.routes = this.generateRoutes(runData.layer);
          runData.current_node = null; // 清空当前节点，等待选择

          let routeMsg = `\n\n即将进入第 ${runData.layer} 层。\n请选择前行方向：\n`;
          runData.routes.forEach((r, i) => {
              routeMsg += `${i+1}. 【${r.name}】 ${r.desc}\n`;
          });
          routeMsg += '发送 #选择路线 [序号] 确认。';
          
          await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
          e.reply(routeMsg);
      } else {
          e.reply('无效的选项。');
      }

      await tempClient.disconnect();

    } catch (err) {
      console.error(err);
      if (tempClient) await tempClient.disconnect();
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
      refreshCount: data.refresh_count,
      currentNode: data.current_node, // 新增：传递当前节点信息
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

      // --- 节点检查 ---
      const node = runData.current_node;
      if (!node) {
          await tempClient.disconnect();
          return e.reply('请先 #选择路线。');
      }
      if (node.type !== 'COMBAT' && node.type !== 'ELITE' && node.type !== 'BOSS') {
          await tempClient.disconnect();
          return e.reply(`当前是【${node.name}】节点，无法进行战斗。请发送 #事件选择 进行互动。`);
      }

      const layerConfig = STAGES.find(s => s.layer === runData.layer);
      // Fallback logic if layer config not found (loop monsters or generic)
      // For now assume config exists or we reuse last available
      const safeLayerConfig = layerConfig || STAGES[STAGES.length - 1];

      if (!safeLayerConfig) {
        await tempClient.del(KEY_PREFIX + userId);
        await tempClient.disconnect();
        return e.reply('数据配置错误，无法加载关卡。');
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

          // 记录原始属性，用于计算百分比加成 (防止指数级膨胀)
          const originalStats = {
              health: battleConfig.base_stats.health,
              attack: battleConfig.base_stats.attack,
              defense: battleConfig.base_stats.defense
          };

          // 注入 Buff
          const activeBuffs = runData.buffs || [];
          activeBuffs.forEach(buffId => {
            const buff = BUFFS.find(b => b.id === buffId);
            if (!buff) return;

            if (buff.type === 'atk_pct') {
              battleConfig.base_stats.attack += Math.floor(originalStats.attack * buff.value);
            } else if (buff.type === 'def_pct') {
              battleConfig.base_stats.defense += Math.floor(originalStats.defense * buff.value);
            } else if (buff.type === 'max_hp_pct') {
              const hpAdd = Math.floor(originalStats.health * buff.value);
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
              battleConfig.passive_skills.push({ type: 'heal_turn', value: buff.value, name: buff.name });
            } else if (buff.type === 'energy_regen_pct') {
              // 充能效率
              if (!battleConfig.base_stats.energy_regen) battleConfig.base_stats.energy_regen = 20;
              battleConfig.base_stats.energy_regen = Math.floor(battleConfig.base_stats.energy_regen * (1 + buff.value));
            } else {
              // 其他类型Buff (如 rainbow_vampire, speed_up_on_hit 等) 存入 global_buffs 供 CombatEngine 处理
              if (!battleConfig.global_buffs) battleConfig.global_buffs = [];
              battleConfig.global_buffs.push(buff.type);
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
      const enemyNames = safeLayerConfig.monsters;
      e.reply(`【${node.name}】第 ${runData.layer} 层挑战开始！\n敌人：${enemyNames.join('、')}`);

      const enemyTeamConfig = enemyNames.map(name => {
        const original = ALL_MONSTERS.find(m => m.name === name);
        if (!original) return null;

        // 深拷贝以应用修改
        const mob = JSON.parse(JSON.stringify(original));

        // 难度系数：基础成长 (每层8%)
        let multiplier = 1 + (runData.layer - 1) * 0.08;
        
        // 节点修正
        if (node.type === 'ELITE') multiplier *= 1.3; // 精英：属性额外+30%
        if (node.type === 'BOSS') multiplier *= 1.5;  // Boss：属性额外+50%

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

      // 渲染日志 (分片输出，每8回合一张图)
      const fullLog = result.log;
      const slices = [];
      let currentSlice = [];
      let roundCountInSlice = 0;

      for (const entry of fullLog) {
        if (entry.type === 'turn') {
          roundCountInSlice++;
          // 如果当前切片已经积累了8个回合，且遇到第9个回合的开始，则切分
          if (roundCountInSlice > 8) {
             if (currentSlice.length > 0) {
                 slices.push(currentSlice);
             }
             currentSlice = [];
             roundCountInSlice = 1; // 新切片的第一回合
          }
        }
        currentSlice.push(entry);
      }
      if (currentSlice.length > 0) {
        slices.push(currentSlice);
      }

      // 逐张发送图片
      for (let i = 0; i < slices.length; i++) {
        const sliceLog = slices[i];
        const renderData = {
            log: sliceLog,
            pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
        };

        const dataForPuppeteer = await new Show(e).get_imgData('astral_combat_log', renderData);
        const img = await puppeteer.screenshot('astral_combat_log', { ...dataForPuppeteer });
        await e.reply(img);
        
        // 简单防刷屏/乱序延时
        if (slices.length > 1 && i < slices.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (result.playerWon) {
        // 胜利后逻辑
        runData.layer++; // 晋升下一层
        
        let pickCount = 1;
        // 精英和Boss节点奖励更多选择次数
        if (node.type === 'ELITE') pickCount = 2;
        if (node.type === 'BOSS') pickCount = 2;

        runData.remaining_picks = pickCount;

        // 随机抽取 3 个 Buff (加权)
        const choices = [];
        const UNIQUE_BUFFS = ['double_act_first_turn', 'heal_after_turn_1', 'heal_after_turn_2', 'heal_after_turn_3', 'shield_heal'];
        const acquiredBuffs = runData.buffs || [];
        
        // 动态调整权重
        // 普通：1星(80), 2星(40), 3星(10)
        // 精英：2星(60), 3星(30), 4星(5)
        // Boss：2星(20), 3星(60), 4星(20)
        
        let currentWeights = { 1: 80, 2: 40, 3: 10, 4: 0 };
        if (node.type === 'ELITE') {
            currentWeights = { 1: 20, 2: 60, 3: 30, 4: 5 };
        } else if (node.type === 'BOSS') {
            currentWeights = { 1: 0, 2: 20, 3: 60, 4: 20 };
        }

        const pool = BUFFS.filter(b => {
             // 唯一性检查
             if (UNIQUE_BUFFS.includes(b.id) && acquiredBuffs.includes(b.id)) return false;
             // 四星唯一性
             if (b.rarity === 4 && acquiredBuffs.includes(b.id)) return false;

             // 权重为0的稀有度不出现
             if (currentWeights[b.rarity] === 0) return false;
             
             return true;
        });

        const getWeightedRandom = (candidates) => {
          let totalWeight = 0;
          candidates.forEach(b => totalWeight += (currentWeights[b.rarity] || 0));
          let r = Math.random() * totalWeight;
          for (const b of candidates) {
            r -= (currentWeights[b.rarity] || 0);
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

        let buffMsg = `【${node.name}】胜利！全队状态已保存。\n\n【天机赐福】${pickCount > 1 ? ` (可选 ${pickCount} 个)` : ''}\n请发送 #选择赐福 [序号] 获取增益：\n`;
        
        choices.forEach((b, i) => {
          const stars = '★'.repeat(b.rarity || 1);
          buffMsg += `${i + 1}. [${stars}] 【${b.name}】\n   ${b.desc}\n`;
        });

        if (runData.refresh_count > 0) {
            buffMsg += `\n你还有 ${runData.refresh_count} 次刷新机会，可发送 #刷新赐福。`;
        }
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
      
      const UNIQUE_BUFFS = ['double_act_first_turn', 'heal_after_turn_1', 'heal_after_turn_2', 'heal_after_turn_3', 'shield_heal'];
      const acquiredBuffs = runData.buffs || [];
      // const pool 定义已移动到下方

      // 动态调整权重：适当提高3星概率
      // 普通层：1星(80), 2星(40), 3星(10)
      // 首领层：2星(80), 3星(15), 4星(5) (不出现1星)
      let currentWeights = { 1: 80, 2: 40, 3: 10, 4: 0 };
      
      const isBossLayer = (runData.layer % 5 === 0);
      if (isBossLayer) {
          currentWeights = { 1: 0, 2: 80, 3: 15, 4: 5 }; // 首领层权重
      }

      // 过滤赐福池
      const pool = BUFFS.filter(b => {
          // 已拥有或唯一性检查
          if (UNIQUE_BUFFS.includes(b.id) && acquiredBuffs.includes(b.id)) return false;
          // 四星唯一性
          if (b.rarity === 4 && acquiredBuffs.includes(b.id)) return false;
          
          // 首领层过滤掉1星，允许4星
          if (isBossLayer) {
              if (b.rarity === 1) return false;
          } else {
              // 普通层过滤掉4星
              if (b.rarity === 4) return false;
          }
          return true;
      });

      const getWeightedRandom = (candidates) => {
        let totalWeight = 0;
        candidates.forEach(b => totalWeight += (currentWeights[b.rarity] || 0));
        let r = Math.random() * totalWeight;
        for (const b of candidates) {
          r -= (currentWeights[b.rarity] || 0);
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

      // max_hp_pct 逻辑 (移除：已在战斗准备阶段通过动态计算实现血量上限提升与当前血量同步增加)
      /*
      if (buffConfig && buffConfig.type === 'max_hp_pct') {
        runData.souls.forEach(soul => {
          if (!soul.is_dead) {
            const healAmount = Math.floor(soul.max_hp * buffConfig.value);
            soul.current_hp += healAmount;
          }
        });
        e.reply(`【${buffConfig.name}】生效！全员恢复了部分生命值。`);
      }
      */

      if (runData.remaining_picks <= 0) {
          runData.pending_buffs = []; // 次数用尽，清空
          
          // --- 所有赐福选择完毕，生成下一层的路线 ---
          const nextRoutes = this.generateRoutes(runData.layer);
          runData.routes = nextRoutes;
          runData.current_node = null; // 确保清空当前节点
      }

      // 统一保存状态
      await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
      await tempClient.disconnect();

      // --- 发送反馈 ---
      if (runData.remaining_picks > 0) {
          let buffMsg = `成功选择了【${buffConfig ? buffConfig.name : '未知'}】！\n★ 还可以再选择 ${runData.remaining_picks} 个赐福：\n`;
          runData.pending_buffs.forEach((bid, i) => {
             const b = BUFFS.find(bf => bf.id === bid);
             if(b) {
                const stars = '★'.repeat(b.rarity || 1);
                buffMsg += `${i + 1}. [${stars}] 【${b.name}】\n`;
             }
          });
          if (runData.refresh_count > 0) {
              buffMsg += `\n你还有 ${runData.refresh_count} 次刷新机会，可发送 #刷新赐福。`;
          }
          e.reply(buffMsg);
      } else {
          // 显示路线选择
          let routeMsg = `成功选择了【${buffConfig ? buffConfig.name : '未知'}】！\n\n即将进入第 ${runData.layer} 层。\n请选择前行方向：\n`;
          
          runData.routes.forEach((r, i) => {
              const icon = r.type === 'COMBAT' ? '⚔️' : (r.type === 'ELITE' ? '💀' : (r.type === 'REST' ? '⛺' : (r.type === 'BOSS' ? '👹' : '🎲')));
              routeMsg += `${i+1}. ${icon} 【${r.name}】 ${r.desc}\n`;
          });
          
          routeMsg += '发送 #选择路线 [序号] 确认。';
          e.reply(routeMsg);
      }

    } catch (err) {
      console.error('[Wanxiang] selectBuff Error:', err);
      if (tempClient) await tempClient.disconnect();
      e.reply('选择失败：' + err.message);
    }
  }
}