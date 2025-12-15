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

const CURRENCY_NAME = "天机印"; // 全局货币名称

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
        { reg: /^#选择路线\s*(\d)$/, fnc: 'selectRoute' },
        { reg: /^#事件选择\s*(\d)$/, fnc: 'handleEventChoice' },
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
        jing_yin: 0, // 新增：天机印
        artifacts: [], // 新增：秘宝
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

    const options = [];
    
    // 定义基础节点池 (不含 REST 和 SHOP)
    let availableTypes = [
        { type: 'COMBAT', name: '激战', desc: '普通的战斗，胜利获得赐福。', weight: 60 },
        { type: 'ELITE', name: '精英', desc: '强敌出没！属性提升30%，必掉高级赐福。', weight: 20 },
        { type: 'EVENT', name: '奇遇', desc: '未知的机遇或风险。', weight: 20 }
    ];

    // 特殊逻辑：首领前一层 (4, 9, 14...) 固定生成
    if (layer % 5 === 4) {
        // 固定 1: 修整
        options.push({ type: 'REST', name: '修整', desc: '一处安全的营地，可恢复状态。', weight: 0 });
        // 固定 2: 商店
        options.push({ type: 'SHOP', name: '云游散修', desc: '偶遇云游天下的散修，可用天机印交换宝物。', weight: 0 });
        
        // 随机 3: 激战/精英/奇遇
        const getWeightedRandom = (list) => {
            let total = list.reduce((acc, t) => acc + t.weight, 0);
            let r = Math.random() * total;
            for (let t of list) {
                r -= t.weight;
                if (r <= 0) return t;
            }
            return list[0];
        };
        options.push({ ...getWeightedRandom(availableTypes) });
        
        return options;
    }

    // 随机生成剩余选项 (凑齐 2-3 个)
    // 如果已经有了修整，再随机 1-2 个；否则随机 2-3 个
    const targetCount = 2 + (Math.random() > 0.5 ? 1 : 0); // 总共 2 或 3 个
    const needed = targetCount - options.length;

    const getWeightedRandomAndRemove = (list) => {
        let total = list.reduce((acc, t) => acc + t.weight, 0);
        let r = Math.random() * total;
        for (let i = 0; i < list.length; i++) {
            r -= list[i].weight;
            if (r <= 0) {
                const selected = list[i];
                list.splice(i, 1); // 移除已选，实现去重
                return selected;
            }
        }
        const selected = list[0];
        list.shift();
        return selected;
    };

    for(let i=0; i<needed; i++) {
        if (availableTypes.length === 0) break;
        const t = getWeightedRandomAndRemove(availableTypes);
        options.push({ ...t }); // Clone
    }
    
    // 简单的打乱顺序，避免修整总是第一个 (虽然第一个也没关系)
    return options.sort(() => Math.random() - 0.5);
  }

  // --- 辅助：处理路线生成与反馈 ---
  async processRouteGeneration(e, runData, tempClient, prefixMsg = '') {
      const userId = e.user_id;
      
      // 1. 生成路线
      const nextRoutes = this.generateRoutes(runData.layer);
      runData.routes = nextRoutes;
      runData.current_node = null;

      // 2. 检查是否需要自动锁定 (单条路线，通常是BOSS层)
      if (nextRoutes.length === 1) {
          const autoNode = nextRoutes[0];
          runData.current_node = autoNode;
          runData.routes = []; // 清空待选
          
          // 保存状态
          await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
          
          const icon = autoNode.type === 'BOSS' ? '👹' : '⚔️';
          e.reply(`${prefixMsg}\n\n即将进入第 ${runData.layer} 层。\n⚠️ 前方感应到强大的气息！\n${icon} 已自动锁定路线：【${autoNode.name}】\n发送 #挑战 开始对决！`);
      } else {
          // 3. 多条路线，让用户选
          await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
          
          let routeMsg = `${prefixMsg}\n\n即将进入第 ${runData.layer} 层。\n请选择前行方向：\n`;
          nextRoutes.forEach((r, i) => {
              const icon = r.type === 'COMBAT' ? '⚔️' : (r.type === 'ELITE' ? '💀' : (r.type === 'REST' ? '⛺' : (r.type === 'BOSS' ? '👹' : '🎲')));
              routeMsg += `${i+1}. ${icon} 【${r.name}】 ${r.desc}\n`;
          });
          routeMsg += '发送 #选择路线 [序号] 确认。';
          e.reply(routeMsg);
      }
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
      
      // 特殊初始化：商店
      if (node.type === 'SHOP' && !runData.shop_items) {
             runData.shop_items = [];
             runData.shop_refresh_count = 1; // 免费刷新次数
             
             // 生成 3 个随机赐福
             const weights = { 1: 80, 2: 40, 3: 10, 4: 0 };
             const acquiredBuffs = runData.buffs || [];
             const UNIQUE_BUFFS = ['double_act_first_turn', 'heal_after_turn_1', 'heal_after_turn_2', 'heal_after_turn_3', 'shield_heal'];
             
             const pool = BUFFS.filter(b => {
                 if (UNIQUE_BUFFS.includes(b.id) && acquiredBuffs.includes(b.id)) return false;
                 if (b.rarity === 4) return false;
                 // 排除秘宝
                 if (b.type === 'artifact_passive') return false;
                 return true;
             });

             const getWeightedRandom = () => {
                let total = pool.reduce((acc, b) => acc + (weights[b.rarity] || 0), 0);
                let r = Math.random() * total;
                for (const b of pool) {
                    r -= (weights[b.rarity] || 0);
                    if (r <= 0) return b;
                }
                return pool[0];
             };

             for(let k=0; k<3; k++) {
                 if (pool.length === 0) break;
                 const selected = getWeightedRandom();
                 if (selected) {
                     let price = 30;
                     if (selected.rarity === 2) price = 60;
                     if (selected.rarity === 3) price = 120;
                     
                     runData.shop_items.push({
                         type: 'buff',
                         id: selected.id,
                         name: selected.name,
                         desc: selected.desc,
                         price: price,
                         rarity: selected.rarity,
                         bought: false
                     });
                     
                     const idx = pool.indexOf(selected);
                     if (idx > -1) pool.splice(idx, 1);
                 }
             }
             
             // 生成 1 个秘宝
             if (!runData.artifacts.includes('treasure_bowl')) {
                 runData.shop_items.push({
                     type: 'artifact',
                     id: 'treasure_bowl',
                     name: '聚宝盆',
                     desc: '战斗胜利额外获得30%天机印',
                     price: 100,
                     rarity: 3,
                     bought: false
                 });
             }
      }
      
      // 统一保存状态并断开
      await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
      await tempClient.disconnect();

      // 根据节点类型反馈
      if (node.type === 'COMBAT' || node.type === 'ELITE' || node.type === 'BOSS') {
          e.reply(`你选择了【${node.name}】。\n敌人已在前方，发送 #挑战 开始战斗！`);
      } else if (node.type === 'SHOP') {
          // 构建商店界面
          let shopMsg = `你遇到了云游散修，他向你展示了行囊。\n当前持有${CURRENCY_NAME}：${runData.jing_yin}\n\n`;
          runData.shop_items.forEach((item, i) => {
              const stars = '★'.repeat(item.rarity || 1);
              const status = item.bought ? ' (已售罄)' : ` 💰${item.price}`;
              const typeIcon = item.type === 'artifact' ? '📦' : '📜';
              shopMsg += `${i + 1}. 【${item.name}】${status}\n   ${typeIcon} [${stars}] ${item.desc}\n`;
          });
          shopMsg += `\n${runData.shop_items.length + 1}. 【刷新】 更换一批商品${refreshText}`;
          shopMsg += `\n${runData.shop_items.length + 2}. 【离开】 继续前进`;
          shopMsg += '\n发送 #事件选择 [序号] 购买或离开。';
          e.reply(shopMsg);
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
              '1. 【购买补给】 消耗 20% 当前生命值，随机获得 3 个普通赐福',
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

      if (!node || (node.type !== 'REST' && node.type !== 'EVENT' && node.type !== 'SHOP')) {
          await tempClient.disconnect();
          return e.reply('当前不在事件节点，无法选择。');
      }

      let replyMsg = '';
      let isDone = false;

      // 简单的逻辑处理
      if (node.type === 'SHOP') {
          const items = runData.shop_items || [];
          const leaveIndex = items.length + 2;
          const refreshIndex = items.length + 1;

          if (selection === leaveIndex) {
              replyMsg = '你告别了散修，继续踏上征途。';
              // 清理商店数据，节省空间 (可选)
              delete runData.shop_items;
              delete runData.shop_refresh_count;
              isDone = true;
          } else if (selection === refreshIndex) {
              if (runData.shop_refresh_count > 0) {
                  runData.shop_refresh_count--;
                  runData.shop_items = []; // 重置商品列表
                  
                  // --- 重新生成商品逻辑 (与 selectRoute 一致) ---
                  const weights = { 1: 80, 2: 40, 3: 10, 4: 0 };
                  const acquiredBuffs = runData.buffs || [];
                  const UNIQUE_BUFFS = ['double_act_first_turn', 'heal_after_turn_1', 'heal_after_turn_2', 'heal_after_turn_3', 'shield_heal'];
                  
                  const pool = BUFFS.filter(b => {
                      if (UNIQUE_BUFFS.includes(b.id) && acquiredBuffs.includes(b.id)) return false;
                      if (b.rarity === 4) return false;
                      if (b.type === 'artifact_passive') return false;
                      return true;
                  });

                  const getWeightedRandom = () => {
                      let total = pool.reduce((acc, b) => acc + (weights[b.rarity] || 0), 0);
                      let r = Math.random() * total;
                      for (const b of pool) {
                          r -= (weights[b.rarity] || 0);
                          if (r <= 0) return b;
                      }
                      return pool[0];
                  };

                  for(let k=0; k<3; k++) {
                      if (pool.length === 0) break;
                      const selected = getWeightedRandom();
                      if (selected) {
                          let price = 30;
                          if (selected.rarity === 2) price = 60;
                          if (selected.rarity === 3) price = 120;
                          
                          runData.shop_items.push({
                              type: 'buff',
                              id: selected.id,
                              name: selected.name,
                              desc: selected.desc,
                              price: price,
                              rarity: selected.rarity,
                              bought: false
                          });
                          const idx = pool.indexOf(selected);
                          if (idx > -1) pool.splice(idx, 1);
                      }
                  }
                  // 重新生成秘宝
                  if (!runData.artifacts.includes('treasure_bowl')) {
                      runData.shop_items.push({
                          type: 'artifact',
                          id: 'treasure_bowl',
                          name: '聚宝盆',
                          desc: '战斗胜利额外获得30%天机印',
                          price: 100,
                          rarity: 3,
                          bought: false
                      });
                  }
                  // --- 生成结束 ---

                  await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
                  
                  let shopMsg = `商店已刷新！\n当前持有${CURRENCY_NAME}：${runData.jing_yin}\n\n`;
                  runData.shop_items.forEach((it, i) => {
                      const stars = '★'.repeat(it.rarity || 1);
                      const status = it.bought ? ' (已售罄)' : ` 💰${it.price}`;
                      const typeIcon = it.type === 'artifact' ? '📦' : '📜';
                      shopMsg += `${i + 1}. 【${it.name}】${status}\n   ${typeIcon} [${stars}] ${it.desc}\n`;
                  });
                  
                  const refreshText = runData.shop_refresh_count > 0 ? ` (剩余 ${runData.shop_refresh_count} 次)` : ' (次数已尽)';
                  shopMsg += `\n${runData.shop_items.length + 1}. 【刷新】 更换一批商品${refreshText}`;
                  shopMsg += `\n${runData.shop_items.length + 2}. 【离开】 继续前进`;
                  shopMsg += '\n发送 #事件选择 [序号] 操作。';
                  
                  e.reply(shopMsg);
              } else {
                  e.reply('刷新次数已用尽。');
              }
          } else if (selection >= 1 && selection <= items.length) {
              const item = items[selection - 1];
              if (item.bought) {
                  e.reply('该商品已售罄。');
              } else if (runData.jing_yin < item.price) {
                  e.reply(`你的${CURRENCY_NAME}不足 (需要 ${item.price})。`);
              } else {
                  // 购买成功
                  runData.jing_yin -= item.price;
                  item.bought = true;
                  
                  if (item.type === 'artifact') {
                      if (!runData.artifacts.includes(item.id)) {
                          runData.artifacts.push(item.id);
                      }
                  } else {
                      runData.buffs.push(item.id);
                  }
                  
                  // 保存并刷新界面
                  await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
                  
                  let shopMsg = `购买成功！\n当前持有${CURRENCY_NAME}：${runData.jing_yin}\n\n`;
                  items.forEach((it, i) => {
                      const stars = '★'.repeat(it.rarity || 1);
                      const status = it.bought ? ' (已售罄)' : ` 💰${it.price}`;
                      const typeIcon = it.type === 'artifact' ? '📦' : '📜';
                      shopMsg += `${i + 1}. 【${it.name}】${status}\n   ${typeIcon} [${stars}] ${it.desc}\n`;
                  });
                  shopMsg += `\n${items.length + 1}. 【刷新】 更换一批商品${refreshText}`;
                  shopMsg += `\n${items.length + 2}. 【离开】 继续前进`;
                  shopMsg += '\n发送 #事件选择 [序号] 继续购买。';
                  
                  e.reply(shopMsg);
              }
          } else {
              e.reply('无效的选项。');
          }
      } else if (node.type === 'REST') {
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
             // 【购买补给】 消耗 20% 当前血量，获得 3 个随机赐福
             let hpCostTotal = 0;
             runData.souls.forEach(s => {
                 if (!s.is_dead) {
                     const cost = Math.floor(s.current_hp * 0.2);
                     s.current_hp -= cost;
                     hpCostTotal += cost;
                 }
             });

             // 生成 3 个赐福 (激战层权重)
             const weights = { 1: 80, 2: 40, 3: 10, 4: 0 };
             const acquiredBuffs = runData.buffs || [];
             const UNIQUE_BUFFS = ['double_act_first_turn', 'heal_after_turn_1', 'heal_after_turn_2', 'heal_after_turn_3', 'shield_heal'];
             
             const pool = BUFFS.filter(b => {
                 if (UNIQUE_BUFFS.includes(b.id) && acquiredBuffs.includes(b.id)) return false;
                 if (b.rarity === 4) return false;
                 return true;
             });

             const newBuffs = [];
             const getWeightedRandom = () => {
                let total = pool.reduce((acc, b) => acc + (weights[b.rarity] || 0), 0);
                let r = Math.random() * total;
                for (const b of pool) {
                    r -= (weights[b.rarity] || 0);
                    if (r <= 0) return b;
                }
                return pool[0];
             };

             for(let k=0; k<3; k++) {
                 if (pool.length === 0) break;
                 const selected = getWeightedRandom();
                 if (selected) {
                     newBuffs.push(selected);
                     runData.buffs.push(selected.id);
                     // 简单去重：从池子移除 (如果是唯一Buff需要移除，非唯一Buff其实可以重复获得，这里简化处理，假设一次购买不重复)
                     const idx = pool.indexOf(selected);
                     if (idx > -1) pool.splice(idx, 1);
                 }
             }

             replyMsg = `你支付了生命值，贩卖机吐出了补给！\n获得赐福：${newBuffs.map(b => `【${b.name}】`).join('、')}`;
             isDone = true;
          } else if (selection === 2) {
             const rand = Math.random();
             if (rand > 0.5) {
                 // 成功：给一个 Buff
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
          // 事件结束，层数+1，生成新路线
          runData.layer++;
          
          // 使用通用逻辑 (支持单路线自动锁定)
          await this.processRouteGeneration(e, runData, tempClient, replyMsg);
      } else if (node.type !== 'SHOP') {
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

    // 计算生命值加成
    let maxHpMultiplier = 1.0;
    (data.buffs || []).forEach(buffId => {
        const buff = BUFFS.find(b => b.id === buffId);
        if (buff && buff.type === 'max_hp_pct') {
            maxHpMultiplier += buff.value;
        }
    });

    // 准备渲染数据
    const soulsData = data.souls.map(s => {
      const effectiveMaxHp = Math.floor(s.max_hp * maxHpMultiplier);
      return {
        ...s,
        max_hp: effectiveMaxHp, // 显示加成后的上限
        hp_percent: effectiveMaxHp > 0 ? (s.current_hp / effectiveMaxHp * 100).toFixed(1) : 0
      };
    });

    const buffsData = (data.buffs || []).map(buffId => {
      const config = BUFFS.find(b => b.id === buffId);
      return config || { name: buffId, desc: '未知效果', rarity: 1 };
    });

    const artifactsData = (data.artifacts || []).map(artifactId => {
        const config = BUFFS.find(b => b.id === artifactId);
        return config || { name: artifactId, desc: '未知秘宝', rarity: 3 };
    });

    const renderData = {
      layer: data.layer,
      souls: soulsData,
      buffs: buffsData,
      artifacts: artifactsData, // 新增：秘宝数据
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

      // 3. 运行战斗 (根据节点类型动态调整最大回合数)
      // Boss战给予更多回合 (20回合)，普通/精英战保持紧凑 (10回合)
      const maxRounds = (node.type === 'BOSS') ? 20 : 10;
      
      const result = await runCombat(battleSouls, enemyTeamConfig, runData.buffs, maxRounds);

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
          // 如果当前切片已经积累了5个回合，且遇到第6个回合的开始，则切分
          if (roundCountInSlice > 5) {
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
        
        // --- 天机印掉落 ---
        let jing_yin_drop_min = 0;
        let jing_yin_drop_max = 0;
        if (node.type === 'COMBAT') {
            jing_yin_drop_min = 10;
            jing_yin_drop_max = 20;
        } else if (node.type === 'ELITE') {
            jing_yin_drop_min = 30;
            jing_yin_drop_max = 50;
        } else if (node.type === 'BOSS') {
            jing_yin_drop_min = 80;
            jing_yin_drop_max = 120;
        }

        let total_jing_yin_drop = Math.floor(Math.random() * (jing_yin_drop_max - jing_yin_drop_min + 1)) + jing_yin_drop_min;
        
        // 秘宝加成：聚宝盆 (treasure_bowl)
        if (runData.artifacts.includes('treasure_bowl')) {
            total_jing_yin_drop = Math.floor(total_jing_yin_drop * 1.3); // 30% 加成
        }
        
        runData.jing_yin += total_jing_yin_drop;

        let pickCount = 1;
        // 精英节点奖励更多选择次数
        if (node.type === 'ELITE') pickCount = 2;
        // Boss节点奖励质量极高，但数量维持1 (必出3星+)

        runData.remaining_picks = pickCount;

        // 随机抽取 3 个 Buff (加权)
        const choices = [];
        const UNIQUE_BUFFS = ['double_act_first_turn', 'heal_after_turn_1', 'heal_after_turn_2', 'heal_after_turn_3', 'shield_heal'];
        const acquiredBuffs = runData.buffs || [];
        
        // 动态调整权重
        // 普通：1星(80), 2星(40), 3星(10)
        // 精英：2星(60), 3星(30), 4星(5)
        // Boss：3星(75), 4星(25) (保底3星)
        
        let currentWeights = { 1: 80, 2: 40, 3: 10, 4: 0 };
        if (node.type === 'ELITE') {
            currentWeights = { 1: 20, 2: 60, 3: 30, 4: 5 };
        } else if (node.type === 'BOSS') {
            currentWeights = { 1: 0, 2: 0, 3: 75, 4: 25 };
        }

        const pool = BUFFS.filter(b => {
             // 唯一性检查
             if (UNIQUE_BUFFS.includes(b.id) && acquiredBuffs.includes(b.id)) return false;
             // 四星唯一性
             if (b.rarity === 4 && acquiredBuffs.includes(b.id)) return false;
             // 排除秘宝 (秘宝只能通过商店或奇遇获得)
             if (b.type === 'artifact_passive') return false;

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
        e.reply(buffMsg + `\n\n获得${CURRENCY_NAME}：${total_jing_yin_drop}。当前${CURRENCY_NAME}：${runData.jing_yin}。`);
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
          // 排除秘宝
          if (b.type === 'artifact_passive') return false;
          
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
          
          // 使用通用逻辑生成下一层路线 (支持单路线自动锁定)
          const msg = `成功选择了【${buffConfig ? buffConfig.name : '未知'}】！`;
          await this.processRouteGeneration(e, runData, tempClient, msg);
          
          await tempClient.disconnect();
          return;
      }

      // 还有剩余选择次数，保存状态
      await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
      await tempClient.disconnect();

      // --- 发送反馈 (多选情况) ---
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
      }


    } catch (err) {
      console.error('[Wanxiang] selectBuff Error:', err);
      if (tempClient) await tempClient.disconnect();
      e.reply('选择失败：' + err.message);
    }
  }
}