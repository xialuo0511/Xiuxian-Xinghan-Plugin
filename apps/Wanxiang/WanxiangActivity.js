import plugin from '../../../../lib/plugins/plugin.js';
import * as DAL from '../../api/data-access.js';
import { createClient } from 'redis';
import fs from 'fs';
import path from 'path';
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
const USER_DATA_KEY = 'xiuxian:wanxiang:userdata:';

const CURRENCY_NAME = '天机印';
const META_CURRENCY_NAME = '天机玉';

const UPGRADES = [
  { id: 1, name: '锋锐之印', desc: '所有星魂基础攻击力 +5', cost: 30, type: 'atk_flat', value: 5 },
  { id: 2, name: '强韧之躯', desc: '所有星魂基础生命值 +10%', cost: 30, type: 'hp_pct', value: 0.10 },
  { id: 3, name: '鹰眼', desc: '所有星魂暴击率 +2%', cost: 30, type: 'crit_rate', value: 0.02 },
  { id: 4, name: '致命一击', desc: '所有星魂暴击伤害 +5%', cost: 30, type: 'crit_dmg', value: 0.05 },
  { id: 5, name: '威压', desc: '战斗开始时，敌方全体造成的伤害强制为 1 (持续1回合)', cost: 100, type: 'start_debuff', value: 1, duration: 1 }
];

const OATHS = [
  { name: '孤行', desc: '只能上阵 2 名星魂（队伍配置中的1、2号位）', profit: 0.5 },
  { name: '禁术', desc: '星魂无法使用终结技，所有星魂的攻击力 +20%', profit: 0.4 },
  { name: '血契', desc: '全队最大生命值 -50%，但攻击力 +20%', profit: 0.3 },
  { name: '贫苦', desc: '本局无法获得天机印，无法在云游散修处购买增益', profit: 0.3 },
  { name: '坚毅', desc: '敌方单位会在进入战斗的时候获得生命上限30%的护盾', profit: 0.3 },
  { name: '压制', desc: '进入战斗后我方单位造成的伤害必定为1，持续一回合', profit: 0.3 },
  { name: '变数', desc: '首领节点结算后不会再必定刷新三星以上赐福，而是按照正常概率刷新', profit: 0.25 },
  { name: '俭省', desc: '本局获得的天机印减少50%', profit: 0.1 },
  { name: '寻妖', desc: '1-4层的激战、精英层有更高概率会遇到妖兽(10%)', profit: 0 },
  { name: '天泽', desc: '首领的生命上限降低10%', profit: 0 }
];

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
        { reg: /^#开启试炼.*$/, fnc: 'startRun' },
        { reg: /^#挑战$/, fnc: 'challengeLayer' },
        { reg: /^#选择赐福\s*(\d)$/, fnc: 'selectBuff' },
        { reg: /^#刷新赐福$/, fnc: 'refreshBuffChoices' },
        { reg: /^#选择路线\s*(\d)$/, fnc: 'selectRoute' },
        { reg: /^#事件选择\s*(\d)$/, fnc: 'handleEventChoice' },
        { reg: /^#试炼状态$/, fnc: 'showStatus' },
        { reg: /^#退出试炼$/, fnc: 'quitRun' },
        { reg: /^#天机秘术$/, fnc: 'viewSecrets' },
        { reg: /^#强化天机秘术$/, fnc: 'upgradeSecrets' }
      ]
    });
  }

  async getUserData(client, userId) {
    const data = await client.hGetAll(USER_DATA_KEY + userId);
    return {
      jade: parseInt(data.jade || '0'),
      level: parseInt(data.level || '0'),
      cleared: data.cleared === 'true',
      last_fail_time: parseInt(data.last_fail_time || '0')
    };
  }

  async saveUserData(client, userId, data) {
    await client.hSet(USER_DATA_KEY + userId, {
      jade: data.jade.toString(),
      level: data.level.toString(),
      cleared: (!!data.cleared).toString(),
      last_fail_time: (data.last_fail_time || 0).toString()
    });
  }

  async viewSecrets(e) {
    let tempClient = null;
    try {
      tempClient = await getTempRedis();
      const userData = await this.getUserData(tempClient, e.user_id);
      await tempClient.disconnect();
      const renderData = {
        jade: userData.jade,
        upgrades: UPGRADES.map(u => {
          let status = 'locked';
          if (userData.level >= u.id) status = 'unlocked';
          else if (userData.level === u.id - 1) status = 'next';
          return { ...u, status, isUnlocked: status === 'unlocked' };
        })
      };
      const htmlPath = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'resources', 'html', 'wanxiang_secrets.html');
      const img = await puppeteer.screenshot('wanxiang_secrets', { tplFile: htmlPath, ...renderData, imgType: 'jpeg' });
      await e.reply(img);
    } catch (err) { if (tempClient) await tempClient.disconnect(); e.reply('查询失败：' + err.message); }
  }

  async upgradeSecrets(e) {
    let tempClient = null;
    try {
      tempClient = await getTempRedis();
      const userData = await this.getUserData(tempClient, e.user_id);
      const nextId = userData.level + 1;
      const upgrade = UPGRADES.find(u => u.id === nextId);
      if (!upgrade) { if (tempClient) await tempClient.disconnect(); return e.reply('你的天机秘术已臻化境。'); }
      if (userData.jade < upgrade.cost) { if (tempClient) await tempClient.disconnect(); return e.reply(`天机玉不足！需要 ${upgrade.cost}。`); }
      userData.jade -= upgrade.cost; userData.level = nextId;
      await this.saveUserData(tempClient, e.user_id, userData); await tempClient.disconnect();
      e.reply(`强化成功！已激活【${upgrade.name}】
效果：${upgrade.desc}`);
    } catch (err) { if (tempClient) await tempClient.disconnect(); e.reply('强化失败：' + err.message); }
  }

  async startRun(e) {
    const userId = e.user_id;
    let tempClient = null;
    try {
      tempClient = await getTempRedis();
      if (await tempClient.get(KEY_PREFIX + userId)) { await tempClient.disconnect(); return e.reply('你已有正在进行的试炼。'); }
      const playerData = (await DAL.getAllPlayerData(userId))?.player;
      if (!playerData) { await tempClient.disconnect(); return e.reply('你尚未踏入仙途。'); }
      const userData = await this.getUserData(tempClient, userId);
      const now = Date.now();
      if (userData.last_fail_time && (now - userData.last_fail_time < 3 * 60 * 1000)) {
        const remaining = Math.ceil((3 * 60 * 1000 - (now - userData.last_fail_time)) / 1000);
        await tempClient.disconnect(); return e.reply(`由于刚刚挑战失败，天机紊乱，请在 ${remaining} 秒后重新开始。`);
      }
      const inputStr = e.msg.replace('#开启试炼', '').trim();
      const selectedOaths = inputStr ? inputStr.split(/[\s,，]+/).filter(Boolean) : [];
      const activeOaths = []; let totalProfit = 0;
      if (selectedOaths.length > 0) {
        if (!userData.cleared) { await tempClient.disconnect(); return e.reply('只有完整通关一次基础的 20 层方可开启誓约挑战。'); }
        for (const oName of selectedOaths) {
          const oath = OATHS.find(o => o.name === oName);
          if (!oath) { await tempClient.disconnect(); return e.reply(`未知誓约：【${oName}】。可选：${OATHS.map(o => o.name).join('、')}`); }
          if (!activeOaths.find(a => a.name === oName)) { activeOaths.push(oath); totalProfit += oath.profit; }
        }
        if (totalProfit <= 0 && activeOaths.length > 0) { await tempClient.disconnect(); return e.reply('不可只选择收益为 0% 的誓约挑战。'); }
      }
      const equipped = playerData.equipped_star_souls || {};
      const soulsState = []; const hasLoneliness = activeOaths.some(o => o.name === '孤行');
      let bonusAtk = 0, bonusHpPct = 0;
      UPGRADES.forEach(u => { if (userData.level >= u.id) { if (u.type === 'atk_flat') bonusAtk += u.value; if (u.type === 'hp_pct') bonusHpPct += u.value; } });
      for (let i = 1; i <= 4; i++) {
        const name = equipped[i];
        if (name && (!hasLoneliness || i <= 2)) {
          const conf = ALL_SOULS.find(s => s.name === name);
          if (conf) {
            const baseHp = Math.floor(conf.base_stats.health * (1 + bonusHpPct));
            soulsState.push({ slot: i, name, max_hp: baseHp, current_hp: baseHp, is_dead: false });
          }
        }
      }
      if (soulsState.length === 0) { await tempClient.disconnect(); return e.reply('无星魂可出战。'); }
      const runData = { layer: 1, souls: soulsState, buffs: [], jing_yin: 0, temp_jade: 0, artifacts: [], start_time: now, refresh_count: 3, current_node: { type: 'COMBAT', name: '激战', desc: '普通的战斗试炼。' }, routes: [], user_level: userData.level, active_oaths: activeOaths, total_profit: totalProfit };
      await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData)); await tempClient.disconnect();
      const oathText = activeOaths.length > 0 ? `
已激活誓约：${activeOaths.map(o => `【${o.name}】`).join('、')} (结算收益 +${(totalProfit * 100).toFixed(0)}%)` : '';
      e.reply([`【万象天机·无尽试炼】已开启！`, `当前出战星魂：${soulsState.map(s => s.name).join('、')}`, oathText, `第 1 层为【激战】节点，发送 #挑战 即可开始。`].join('\n'));
    } catch (err) { if (tempClient) await tempClient.disconnect(); e.reply('系统错误：' + err.message); }
  }

  generateRoutes(layer, activeOaths = []) {
    if (layer % 5 === 0) return [{ type: 'BOSS', name: '首领降临', desc: '极为危险的强敌，击败后可获得双倍赐福。', rarity: 5 }];
    const options = [];
    let availableTypes = [
      { type: 'COMBAT', name: '激战', desc: '普通的战斗，胜利获得赐福。', weight: 60 },
      { type: 'ELITE', name: '精英', desc: '强敌出没！属性提升30%，必掉高级赐福。', weight: 15 },
      { type: 'EVENT', name: '奇遇', desc: '未知的机遇或风险。', weight: 15 },
      { type: 'MONSTER_TREASURE', name: '盗宝妖兽', desc: '胆小的妖兽，带着宝物四处流窜，击败可获得大量天机印。', weight: 10 }
    ];
    if (activeOaths.some(o => o.name === '寻妖') && layer < 5) {
        const t = availableTypes.find(t => t.type === 'MONSTER_TREASURE');
        if (t) t.weight = 30;
    }
    if (layer % 5 === 4) {
      options.push({ type: 'REST', name: '修整', desc: '一处安全的营地，可恢复状态。', weight: 0 });
      options.push({ type: 'SHOP', name: '云游散修', desc: '偶遇云游天下的散修，可用天机印交换宝物。', weight: 0 });
      const total = availableTypes.reduce((acc, t) => acc + t.weight, 0); let r = Math.random() * total;
      for (let t of availableTypes) { r -= t.weight; if (r <= 0) { options.push({ ...t }); break; } }
      return options;
    }
    const targetCount = 2 + (Math.random() > 0.5 ? 1 : 0);
    for (let i = 0; i < targetCount; i++) {
      let total = availableTypes.reduce((acc, t) => acc + t.weight, 0); let r = Math.random() * total;
      for (let j = 0; j < availableTypes.length; j++) {
        r -= availableTypes[j].weight;
        if (r <= 0) { options.push({ ...availableTypes[j] }); availableTypes.splice(j, 1); break; }
      }
    }
    return options;
  }

  async processRouteGeneration(e, runData, tempClient, prefixMsg = '') {
    const nextRoutes = this.generateRoutes(runData.layer, runData.active_oaths || []);
    runData.routes = nextRoutes; runData.current_node = null;
    if (nextRoutes.length === 1) {
      runData.current_node = nextRoutes[0]; runData.routes = [];
      await tempClient.set(KEY_PREFIX + e.user_id, JSON.stringify(runData));
      const icon = runData.current_node.type === 'BOSS' ? '👹' : '⚔️';
      e.reply(`${prefixMsg}\n\n即将进入第 ${runData.layer} 层。\n⚠️ 前方感应到强大的气息！\n${icon} 已自动锁定路线：【${runData.current_node.name}】\n发送 #挑战 开始对决！`);
    } else {
      await tempClient.set(KEY_PREFIX + e.user_id, JSON.stringify(runData));
      let msg = `${prefixMsg}\n\n即将进入第 ${runData.layer} 层。\n请选择前行方向：\n`;
      nextRoutes.forEach((r, i) => {
        const icon = r.type === 'COMBAT' ? '⚔️' : (r.type === 'ELITE' ? '💀' : (r.type === 'REST' ? '⛺' : (r.type === 'BOSS' ? '👹' : (r.type === 'MONSTER_TREASURE' ? '💎' : '🎲'))));
        msg += `${i + 1}. ${icon} 【${r.name}】 ${r.desc}\n`;
      });
      e.reply(msg + '发送 #选择路线 [序号] 确认。');
    }
  }

  async selectRoute(e) {
    const userId = e.user_id; const selection = parseInt(e.msg.match(/\d/)?.[0]);
    let tempClient = null;
    try {
      tempClient = await getTempRedis();
      const dataStr = await tempClient.get(KEY_PREFIX + userId);
      if (!dataStr) { await tempClient.disconnect(); return e.reply('请先 #开启试炼。'); }
      const runData = JSON.parse(dataStr);
      if (!runData.routes?.length) { await tempClient.disconnect(); return e.reply('当前无需选择路线。'); }
      if (!selection || selection < 1 || selection > runData.routes.length) { await tempClient.disconnect(); return e.reply(`请选择 1-${runData.routes.length} 之间的序号。`); }
      const node = runData.routes[selection - 1]; runData.current_node = node; runData.routes = [];
      if (node.type === 'SHOP') {
        if (runData.active_oaths?.some(o => o.name === '贫苦')) {
          runData.layer++; await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
          await this.processRouteGeneration(e, runData, tempClient, '云游散修已离开。');
          await tempClient.disconnect(); return;
        }
        runData.shop_items = []; runData.shop_refresh_count = 1;
        const weights = { 1: 80, 2: 40, 3: 10, 4: 0 };
        const pool = BUFFS.filter(b => b.rarity < 4 && b.type !== 'artifact_passive' && b.type !== 'soul_exclusive' && !runData.buffs.includes(b.id));
        for (let k = 0; k < 3; k++) {
          let total = pool.reduce((acc, b) => acc + (weights[b.rarity] || 0), 0); let r = Math.random() * total;
          for (let i = 0; i < pool.length; i++) {
            r -= weights[pool[i].rarity];
            if (r <= 0) {
              const b = pool[i]; let price = b.rarity === 3 ? 120 : (b.rarity === 2 ? 60 : 30);
              runData.shop_items.push({ type: 'buff', id: b.id, name: b.name, desc: b.desc, price, rarity: b.rarity, bought: false });
              pool.splice(i, 1); break;
            }
          }
        }
        if (!runData.artifacts.includes('treasure_bowl')) runData.shop_items.push({ type: 'artifact', id: 'treasure_bowl', name: '聚宝盆', desc: '战斗胜利额外获得30%天机印', price: 100, rarity: 3, bought: false });
      } else if (node.type === 'EVENT') {
        const r = Math.random();
        runData.current_node.sub_type = r < 0.25 ? 'vending_machine_gold' : (r < 0.45 ? 'vending_machine_weird' : (r < 0.6 ? 'gamble_all' : (r < 0.65 ? 'ultimate_boost' : (r < 0.82 ? 'soul_enhance' : 'vending_machine'))));
        runData.current_node.event_count = 0;
      }
      await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
      if (['COMBAT', 'ELITE', 'BOSS', 'MONSTER_TREASURE'].includes(node.type)) e.reply(`你选择了【${node.name}】。\n敌人已在前方，发送 #挑战 开始战斗！`);
      else if (node.type === 'SHOP') {
        let msg = `你遇到了云游散修，他向你展示了行囊。\n当前持有${CURRENCY_NAME}：${runData.jing_yin}\n\n`;
        runData.shop_items.forEach((it, i) => {
          const stars = '★'.repeat(it.rarity || 1);
          msg += `${i + 1}. 【${it.name}】${it.bought ? '(已售罄)' : ` 💰${it.price}`}\n   📜 [${stars}] ${it.desc}\n`;
        });
        e.reply(msg + `\n${runData.shop_items.length + 1}. 【刷新】 更换一批商品\n${runData.shop_items.length + 2}. 【离开】 继续前进\n发送 #事件选择 [序号] 购买或离开。`);
      } else if (node.type === 'REST') e.reply('你来到了一处隐蔽的营地，这里似乎很安全。\n\n1. 【休养生息】 全队恢复 40% 生命值\n2. 【招魂仪式】 复活一名随机阵亡队友 (50%血量)\n3. 【冥想】 获得 1 次赐福刷新机会\n\n发送 #事件选择 [序号] 确认。');
      else if (node.type === 'EVENT') {
        const sub = runData.current_node.sub_type;
        if (sub === 'vending_machine_gold') e.reply('你发现了一台金光闪闪的【抽奖售货机】。\n\n1. 【抽奖一次】 消耗 100 天机印 (至多3次)\n2. 【离开】\n\n发送 #事件选择 [序号] 确认。');
        else if (sub === 'vending_machine_weird') e.reply('你发现了一台外形诡异的【奇怪售货机】。\n\n1. 【抽奖一次】 消耗 25 天机印 (至多3次)\n2. 【离开】\n\n发送 #事件选择 [序号] 确认。');
        else if (sub === 'gamble_all') e.reply('你在祭坛上发现了一份禁忌契约。\n\n1. 【放手一搏】 消耗 99% 当前生命值，大幅强化星魂属性直到本局结束！\n2. 【无视】\n\n发送 #事件选择 [序号] 确认。');
        else if (sub === 'ultimate_boost') e.reply('一道圣光从天而降！你感到充满了力量！\n\n1. 【顶级强化】 复活全员，恢复满状态，并获得全员专属三星赐福！\n2. 【离开】\n\n发送 #事件选择 [序号] 确认。');
        else if (sub === 'soul_enhance') e.reply('你在废墟中遇到一位神秘的老者，他注视着你的星魂，眼中闪过一丝光芒。\n\n1. 【虚心求教】 获得一个针对已有星魂强化的三星赐福\n2. 【无视】 离开\n\n发送 #事件选择 [序号] 确认。');
        else e.reply('你在废墟中发现一台古老的贩卖机。\n\n1. 【购买补给】 消耗 20% 当前生命值，获得 3 个普通赐福\n2. 【暴力破解】 试图砸开它 (50%获得随机3星赐福，50%受伤)\n3. 【离开】\n\n发送 #事件选择 [序号] 确认。');
      }
      await tempClient.disconnect();
    } catch (err) { if (tempClient) await tempClient.disconnect(); }
  }

  async handleEventChoice(e) {
    const userId = e.user_id; const selection = parseInt(e.msg.match(/\d/)?.[0]);
    let tempClient = null;
    try {
      tempClient = await getTempRedis();
      const runData = JSON.parse(await tempClient.get(KEY_PREFIX + userId));
      if (!runData?.current_node) { await tempClient.disconnect(); return; }
      const node = runData.current_node; let replyMsg = '', isDone = false;
      if (node.type === 'SHOP') {
        const items = runData.shop_items;
        if (selection === items.length + 2) { replyMsg = '你告别了散修，继续踏上征途。'; isDone = true; }
        else if (selection === items.length + 1) { e.reply('正在重新生成商品...'); return this.selectRoute(e); }
        else if (selection >= 1 && selection <= items.length) {
          const it = items[selection - 1];
          if (it.bought) e.reply('该商品已售罄。');
          else if (runData.jing_yin < it.price) e.reply(`你的${CURRENCY_NAME}不足。`);
          else { runData.jing_yin -= it.price; it.bought = true; if (it.type === 'artifact') runData.artifacts.push(it.id); else runData.buffs.push(it.id); e.reply(`购买成功！当前剩余${CURRENCY_NAME}：${runData.jing_yin}`); }
        }
      } else if (node.type === 'REST') {
        if (selection === 1) { runData.souls.forEach(s => { if (!s.is_dead) s.current_hp = Math.min(s.max_hp, s.current_hp + Math.floor(s.max_hp * 0.4)); }); replyMsg = '全员恢复了大量生命值。'; isDone = true; }
        else if (selection === 2) { const dead = runData.souls.filter(s => s.is_dead); if (dead.length) { const s = dead[Math.floor(Math.random() * dead.length)]; s.is_dead = false; s.current_hp = Math.floor(s.max_hp * 0.5); replyMsg = `【${s.name}】已从冥界归来。`; } else replyMsg = '无人阵亡，你只是休息了一会儿。'; isDone = true; }
        else if (selection === 3) { runData.refresh_count++; replyMsg = '你的思维变得更加敏捷了 (+1 刷新次数)。'; isDone = true; }
      } else if (node.type === 'EVENT') {
        const sub = node.sub_type;
        if (sub === 'vending_machine_gold' && selection === 1) {
          if (runData.jing_yin < 100 || node.event_count >= 3) return e.reply('无法继续抽奖。');
          runData.jing_yin -= 100; node.event_count++; const r = Math.random();
          const filterPool = (rarity) => BUFFS.filter(b => b.rarity === rarity && b.type !== 'artifact_passive' && b.type !== 'soul_exclusive' && !runData.buffs.includes(b.id)).sort(() => Math.random() - 0.5);
          if (r < 0.05) { runData.jing_yin += 500; replyMsg = '运气爆棚！你获得了 500 天机印！'; }
          else if (r < 0.07) { const b = filterPool(4)[0] || filterPool(3)[0]; if (b) { runData.buffs.push(b.id); replyMsg = `出货了！你获得了四星赐福【${b.name}】！`; } else replyMsg = '空的。'; }
          else if (r < 0.1) { const b = filterPool(3)[0]; if (b) { runData.buffs.push(b.id); replyMsg = `不错！你获得了三星赐福【${b.name}】！`; } else replyMsg = '空的。'; }
          else if (r < 0.7) { const b = filterPool(2)[0] || filterPool(1)[0]; if (b) { runData.buffs.push(b.id); replyMsg = `获得赐福【${b.name}】。`; } else replyMsg = '空的。'; }
          else replyMsg = '空空如也...什么都没抽到。';
          if (node.event_count >= 3) isDone = true; else { await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData)); e.reply(replyMsg + '\n还可以抽奖 ' + (3 - node.event_count) + ' 次。'); return; }
        } else if (sub === 'vending_machine_weird' && selection === 1) {
          if (runData.jing_yin < 25 || node.event_count >= 3) return e.reply('售货机已熄灭。');
          runData.jing_yin -= 25; node.event_count++; const r = Math.random();
          if (r < 0.1) { runData.souls.forEach(s => s.current_hp = Math.max(1, Math.floor(s.current_hp * 0.9))); replyMsg = '诡异的烟雾让你感到虚弱 (当前生命值-10%)。'; }
          else if (r < 0.2) { runData.souls.forEach(s => s.current_hp = Math.min(s.max_hp, Math.floor(s.current_hp * 1.1))); replyMsg = '你感到一阵暖流 (恢复10%生命)。'; }
          else if (r < 0.4) { runData.extra_atk_pct = (runData.extra_atk_pct || 0) + 1.0; replyMsg = '一名星魂杀气大增 (总攻击+100%)！'; }
          else if (r < 0.6) { const oath = OATHS[Math.floor(Math.random() * OATHS.length)]; runData.active_oaths.push({ ...oath, profit: oath.profit + 0.1 }); replyMsg = `干扰：获得誓约【${oath.name}】效果，且结算收益+10%！`; }
          else replyMsg = '售货机发出了奇怪的咔哒声，但什么都没发生。';
          if (node.event_count >= 3) isDone = true; else { await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData)); e.reply(replyMsg + '\n还可以抽奖 ' + (3 - node.event_count) + ' 次。'); return; }
        } else if (sub === 'gamble_all' && selection === 1) { runData.souls.forEach(s => s.current_hp = 1); runData.gamble_buff = true; replyMsg = '契约成立！你感到力量在燃烧，但生命已如风中残烛。'; isDone = true; }
        else if (sub === 'ultimate_boost' && selection === 1) { runData.souls.forEach(s => { s.is_dead = false; s.current_hp = s.max_hp; const b = BUFFS.find(b => b.type === 'soul_exclusive' && b.exclusive_soul === s.name && b.rarity === 3); if (b && !runData.buffs.includes(b.id)) runData.buffs.push(b.id); }); replyMsg = '圣光洗礼！全员复活并获得了专属强化！'; isDone = true; }
        else if (sub === 'soul_enhance' && selection === 1) { const b = BUFFS.find(b => b.type === 'soul_exclusive' && runData.souls.some(s => s.name === b.exclusive_soul) && !runData.buffs.includes(b.id)); if (b) { runData.buffs.push(b.id); replyMsg = `老者传授了你【${b.name}】的奥秘！`; } else replyMsg = '老者摇了摇头，转过身去。'; isDone = true; }
        else { replyMsg = '你谨慎地离开了。'; isDone = true; }
      }
      if (isDone) { runData.layer++; await this.processRouteGeneration(e, runData, tempClient, replyMsg); } 
      else await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
      await tempClient.disconnect();
    } catch (err) { if (tempClient) await tempClient.disconnect(); }
  }

  async challengeLayer(e) {
    const userId = e.user_id; let tempClient = null;
    try {
      tempClient = await getTempRedis();
      const runData = JSON.parse(await tempClient.get(KEY_PREFIX + userId));
      if (!runData?.current_node) { if (tempClient) await tempClient.disconnect(); return e.reply('请先选择路线。'); }
      const node = runData.current_node;
      if (!['COMBAT', 'ELITE', 'BOSS', 'MONSTER_TREASURE'].includes(node.type)) { if (tempClient) await tempClient.disconnect(); return e.reply('当前节点不可进行挑战。'); }
      
      const activeOaths = runData.active_oaths || [];
      const battleSouls = [];
      for (const s of runData.souls) {
        if (s.is_dead) continue;
        const conf = ALL_SOULS.find(as => as.name === s.name);
        if (conf) {
          const bc = JSON.parse(JSON.stringify(conf)); let hpMul = 1.0, atkMul = 1.0;
          UPGRADES.forEach(u => { if (runData.user_level >= u.id) { if (u.type === 'atk_flat') bc.base_stats.attack += u.value; if (u.type === 'hp_pct') hpMul += u.value; } });
          if (activeOaths.some(o => o.name === '禁术')) { delete bc.skills.ultimate; atkMul += 0.2; }
          if (activeOaths.some(o => o.name === '血契')) { hpMul -= 0.5; atkMul += 0.2; }
          if (runData.gamble_buff) { hpMul *= 2; atkMul *= 2; bc.crit_rate = (bc.crit_rate || 0) + 1.0; bc.base_stats.energy_regen = (bc.base_stats.energy_regen || 20) * 1.25; }
          bc.base_stats.health = Math.floor(bc.base_stats.health * hpMul); bc.base_stats.attack = Math.floor(bc.base_stats.attack * atkMul);
          bc.current_hp_inherit = Math.min(s.current_hp, bc.base_stats.health);
          if (activeOaths.some(o => o.name === '压制')) { bc.initial_debuffs = bc.initial_debuffs || []; bc.initial_debuffs.push({ type: 'force_dmg_one', value: 1, duration: 1, caster_id: 'system' }); }
          if (runData.extra_atk_pct) bc.base_stats.attack += Math.floor(conf.base_stats.attack * runData.extra_atk_pct);
          runData.buffs.forEach(bid => {
            const b = BUFFS.find(bf => bf.id === bid); if (!b) return;
            if (b.type === 'atk_pct') bc.base_stats.attack += Math.floor(conf.base_stats.attack * b.value);
            else if (b.type === 'max_hp_pct') bc.base_stats.health += Math.floor(conf.base_stats.health * b.value);
          });
          battleSouls.push(bc);
        }
      }
      
      const hasCoercion = (runData.user_level || 0) >= 5;
      let enemies = [];
      if (node.type === 'MONSTER_TREASURE') {
          for (let i = 0; i < 3; i++) {
              const tm = { id: `t_${i}`, name: '盗宝妖兽', base_stats: { health: 500 * runData.layer, attack: 1, defense: 50, speed: 150, resistance: 0, taunt: 100, element: '无' }, is_treasure: true, skills: { basic: { name: '观望', type: 'damage', value: 0, target: 'single_enemy' } } };
              if (hasCoercion) tm.initial_debuffs = [{ type: 'force_dmg_one', value: 1, duration: 1, caster_id: 'system' }];
              enemies.push(tm);
          }
      } else {
          const names = STAGES.find(s => s.layer === runData.layer)?.monsters || [];
          enemies = names.map(n => {
            const original = ALL_MONSTERS.find(am => am.name === n); if (!original) return null;
            const m = JSON.parse(JSON.stringify(original));
            let mul = 1 + (runData.layer - 1) * 0.08;
            if (node.type === 'ELITE') mul *= 1.3;
            if (node.type === 'BOSS') { mul *= 1.5; if (activeOaths.some(o => o.name === '天泽')) mul *= 0.9; }
            m.base_stats.health = Math.floor(m.base_stats.health * mul); m.base_stats.attack = Math.floor(m.base_stats.attack * mul);
            if (activeOaths.some(o => o.name === '坚毅')) m.initial_shields = Math.floor(m.base_stats.health * 0.3);
            if (hasCoercion) { m.initial_debuffs = m.initial_debuffs || []; m.initial_debuffs.push({ type: 'force_dmg_one', value: 1, duration: 1, caster_id: 'system' }); }
            return m;
          }).filter(Boolean);
          if (Math.random() < 0.05) {
              const em = { id: `t_extra`, name: '盗宝妖兽', base_stats: { health: 500 * runData.layer, attack: 1, defense: 50, speed: 150, resistance: 0, taunt: 100, element: '无' }, is_treasure: true, skills: { basic: { name: '观望', type: 'damage', value: 0, target: 'single_enemy' } } };
              if (hasCoercion) em.initial_debuffs = [{ type: 'force_dmg_one', value: 1, duration: 1, caster_id: 'system' }];
              enemies.push(em);
          }
      }
      
      e.reply(`【${node.name}】第 ${runData.layer} 层挑战开始！\n战斗进行中...`);
      const maxR = (node.type === 'BOSS' || node.type === 'MONSTER_TREASURE') ? 20 : 10;
      const result = await runCombat(battleSouls, enemies, runData.buffs, maxR);
      
      const slices = []; let currentSlice = [], rCount = 0;
      for (const entry of result.log) {
        if (entry.type === 'turn') { rCount++; if (rCount > 8) { slices.push(currentSlice); currentSlice = []; rCount = 1; } }
        currentSlice.push(entry);
      }
      if (currentSlice.length > 0) slices.push(currentSlice);
      const tempDir = path.join(process.cwd(), 'data', 'temp', 'wanxiang');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const imgPaths = [];
      try {
        for (let i = 0; i < slices.length; i++) {
          const rData = { log: slices[i], pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/` };
          const dFP = await new Show(e).get_imgData('astral_combat_log', rData);
          dFP.imgType = 'jpeg'; dFP.quality = 80;
          const imgResult = await puppeteer.screenshot('astral_combat_log', dFP);
          let finalBuffer = Buffer.isBuffer(imgResult) ? imgResult : (imgResult?.file ? (Buffer.isBuffer(imgResult.file) ? imgResult.file : Buffer.from(imgResult.file.replace(/^base64:\/\//, '').replace(/^data:image\/\w+;base64,/, ''), 'base64')) : null);
          if (finalBuffer) {
            const filePath = path.join(tempDir, `Log_${userId}_${Date.now()}_P${i + 1}.jpg`);
            fs.writeFileSync(filePath, finalBuffer);
            imgPaths.push(filePath);
          }
        }
        if (imgPaths.length > 0) {
          for (let i = 0; i < imgPaths.length; i++) {
            const p = imgPaths[i];
            try {
              const res = await e.reply(segment.image(p));
              if (!res || res.result === -1) await e.reply({ type: 'file', file: p, name: path.basename(p) });
            } catch (err) { await e.reply({ type: 'file', file: p, name: path.basename(p) }); }
            if (i < imgPaths.length - 1) await new Promise(r => setTimeout(r, 1000));
          }
        }
      } catch (err) { console.error('[Wanxiang] Combat Log Error:', err); e.reply('战报生成出错。'); }
      finally { setTimeout(() => { imgPaths.forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); }); }, 60000); }

      for (const s of runData.souls) { const c = result.playerTeam.find(pt => pt.name === s.name); if (c) { s.current_hp = Math.max(0, c.current_hp); s.is_dead = s.current_hp <= 0; } }
      if (result.playerWon) {
        let jade = Math.floor((node.type === 'BOSS' ? 30 : 5) * (1 + (runData.total_profit || 0)));
        let gold = Math.floor((Math.random() * 20 + 10) * (activeOaths.some(o => o.name === '俭省') ? 0.5 : 1));
        let extraMsg = '', skipBuffChoice = false;

        // --- 统计击败的妖兽数量并计算个体奖励 ---
        const defeatedTreasures = result.enemyTeam.filter(et => et.name === '盗宝妖兽' && et.current_hp <= 0 && !et.has_fled);
        let treasureGoldTotal = 0;
        let treasureBuffsNames = [];

        defeatedTreasures.forEach(() => {
            if (Math.random() < 0.7) {
                treasureGoldTotal += 50;
            } else {
                const pool = BUFFS.filter(b => b.type !== 'soul_exclusive' && b.type !== 'artifact_passive' && !runData.buffs.includes(b.id));
                if (pool.length > 0) {
                    // 30% 概率得赐福，极低概率四星
                    let targetRarity = 1;
                    const r = Math.random();
                    if (r < 0.02) targetRarity = 4;
                    else if (r < 0.15) targetRarity = 3;
                    else if (r < 0.45) targetRarity = 2;
                    const b = pool.filter(p => p.rarity === targetRarity).sort(() => Math.random() - 0.5)[0] || pool[0];
                    runData.buffs.push(b.id);
                    treasureBuffsNames.push(b.name);
                }
            }
        });

        if (node.type === 'MONSTER_TREASURE') {
            const killed = defeatedTreasures.length;
            gold = killed === 3 ? 300 : 250; 
            gold += treasureGoldTotal; // 累加个体掉落的金币
            extraMsg = `\n【妖兽猎人】击败妖兽：${killed}/3`;
            if (treasureGoldTotal > 0) extraMsg += `\n额外获得：${treasureGoldTotal} 天机印`;
            if (treasureBuffsNames.length > 0) extraMsg += `\n额外获得赐福：${treasureBuffsNames.join('、')}`;
            
            skipBuffChoice = true;
            if (killed === 3) {
                const pool = BUFFS.filter(b => (b.rarity === 3 || b.rarity === 4) && b.type !== 'soul_exclusive' && b.type !== 'artifact_passive' && !runData.buffs.includes(b.id));
                if (pool.length > 0) { 
                    const b = pool[Math.floor(Math.random() * pool.length)]; 
                    runData.buffs.push(b.id); 
                    extraMsg += `\n【完美通关】获得高级赐福：[${'★'.repeat(b.rarity)}] 【${b.name}】！`; 
                }
            }
        } else {
            // 普通战斗乱入
            if (defeatedTreasures.length > 0) {
                gold += treasureGoldTotal;
                if (treasureGoldTotal > 0) extraMsg += `\n额外击败妖兽，获得 ${treasureGoldTotal} 天机印！`;
                if (treasureBuffsNames.length > 0) extraMsg += `\n额外击败妖兽，获得赐福：${treasureBuffsNames.join('、')}！`;
            }
        }
        
        runData.jing_yin += gold; runData.temp_jade += jade;
        if (runData.layer >= 20) {
          const ud = await this.getUserData(tempClient, userId); const bonus = (runData.total_profit >= 1.0) ? 150 : 0;
          ud.jade += runData.temp_jade + bonus; ud.cleared = true;
          await this.saveUserData(tempClient, userId, ud); await tempClient.del(KEY_PREFIX + userId);
          e.reply(`【试炼通关】恭喜！本次共获得 ${runData.temp_jade} 天机玉${bonus > 0 ? ` (含誓约奖 ${bonus})` : ''}。`);
        } else if (skipBuffChoice) {
          runData.layer++; await this.processRouteGeneration(e, runData, tempClient, `【${node.name}】胜利！${extraMsg}\n获得${CURRENCY_NAME}：${gold}。当前：${runData.jing_yin}。`);
        } else {
          runData.layer++; runData.remaining_picks = node.type === 'ELITE' ? 2 : 1;
          const isB = node.type === 'BOSS' && !activeOaths.some(o => o.name === '变数');
          let w = isB ? { 1: 0, 2: 0, 3: 75, 4: 25 } : { 1: 80, 2: 40, 3: 10, 4: 0 };
          const pool = BUFFS.filter(b => b.type !== 'artifact_passive' && b.type !== 'soul_exclusive' && !runData.buffs.includes(b.id) && w[b.rarity] > 0);
          const ch = [];
          for (let i = 0; i < 3 && pool.length > 0; i++) {
              let t = pool.reduce((acc, b) => acc + w[b.rarity], 0); let r = Math.random() * t;
              for (let j = 0; j < pool.length; j++) { r -= w[pool[j].rarity]; if (r <= 0) { ch.push(pool[j]); pool.splice(j, 1); break; } }
          }
          runData.pending_buffs = ch.map(c => c.id);
          await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
          let bMsg = `【${node.name}】胜利！全队状态已保存。${extraMsg}\n获${CURRENCY_NAME}：${gold}。当前：${runData.jing_yin}。\n\n【天机赐福】${runData.remaining_picks > 1 ? ` (可选 ${runData.remaining_picks} 个)` : ''}\n发送 #选择赐福 [序号] 获取增益：\n`;
          ch.forEach((b, i) => bMsg += `${i + 1}. [${'★'.repeat(b.rarity)}] 【${b.name}】\n   ${b.desc}\n`);
          if (runData.refresh_count > 0) bMsg += `\n你还有 ${runData.refresh_count} 次刷新机会，可发送 #刷新赐福。`;
          e.reply(bMsg);
        }
      } else {
        const ud = await this.getUserData(tempClient, userId); ud.last_fail_time = Date.now(); ud.jade += runData.temp_jade;
        await this.saveUserData(tempClient, userId, ud); await tempClient.del(KEY_PREFIX + userId);
        e.reply(`战斗失败！获得 ${runData.temp_jade} 天机玉。冷静期开始，请 3 分钟后再试。`);
      }
      await tempClient.disconnect();
    } catch (err) { if (tempClient) await tempClient.disconnect(); e.reply('错误：' + err.message); }
  }

  async refreshBuffChoices(e) {
    const userId = e.user_id; let tempClient = null;
    try {
      tempClient = await getTempRedis();
      const runData = JSON.parse(await tempClient.get(KEY_PREFIX + userId));
      if (!runData?.pending_buffs?.length) { await tempClient.disconnect(); return e.reply('当前没有待选择的赐福。'); }
      if (runData.refresh_count <= 0) { await tempClient.disconnect(); return e.reply('刷新机会已用尽！'); }
      runData.refresh_count--;
      const isBoss = runData.current_node?.type === 'BOSS' && !runData.active_oaths?.some(o => o.name === '变数');
      let weights = isBoss ? { 1: 0, 2: 0, 3: 75, 4: 25 } : { 1: 80, 2: 40, 3: 10, 4: 0 };
      const pool = BUFFS.filter(b => b.type !== 'artifact_passive' && b.type !== 'soul_exclusive' && !runData.buffs.includes(b.id) && weights[b.rarity] > 0);
      const choices = [];
      for (let i = 0; i < 3 && pool.length > 0; i++) {
          let t = pool.reduce((acc, b) => acc + weights[b.rarity], 0); let r = Math.random() * t;
          for (let j = 0; j < pool.length; j++) { r -= weights[pool[j].rarity]; if (r <= 0) { choices.push(pool[j]); pool.splice(j, 1); break; } }
      }
      runData.pending_buffs = choices.map(c => c.id);
      await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
      let msg = `赐福已刷新！剩余刷新机会：${runData.refresh_count} 次。\n\n【天机赐福】\n请发送 #选择赐福 [序号] 获取增益：\n`;
      choices.forEach((b, i) => msg += `${i + 1}. [${'★'.repeat(b.rarity)}] 【${b.name}】\n   ${b.desc}\n`);
      e.reply(msg);
      await tempClient.disconnect();
    } catch (err) { if (tempClient) await tempClient.disconnect(); }
  }

  async selectBuff(e) {
    const userId = e.user_id; const selection = parseInt(e.msg.match(/\d/)?.[0]);
    let tempClient = null;
    try {
      tempClient = await getTempRedis();
      const runData = JSON.parse(await tempClient.get(KEY_PREFIX + userId));
      if (!runData?.pending_buffs?.length || !selection || selection > runData.pending_buffs.length) { await tempClient.disconnect(); return; }
      const bid = runData.pending_buffs[selection - 1]; const b = BUFFS.find(bf => bf.id === bid);
      runData.buffs.push(bid); runData.remaining_picks--; runData.pending_buffs.splice(selection - 1, 1);
      if (runData.remaining_picks <= 0) { runData.pending_buffs = []; await this.processRouteGeneration(e, runData, tempClient, `成功选择了【${b.name}】！`); } 
      else { await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData)); e.reply(`成功选择了【${b.name}】！\n★ 还可以再选择 ${runData.remaining_picks} 个赐福：\n`); }
      await tempClient.disconnect();
    } catch (err) { if (tempClient) await tempClient.disconnect(); }
  }

  async showStatus(e) {
    const userId = e.user_id; let tempClient = null;
    try {
      tempClient = await getTempRedis(); const dataStr = await tempClient.get(KEY_PREFIX + userId); await tempClient.disconnect();
      if (!dataStr) return e.reply('你当前没有进行中的试炼。');
      const data = JSON.parse(dataStr);
      const renderData = { layer: data.layer, souls: data.souls, buffs: data.buffs.map(id => BUFFS.find(b => b.id === id) || { name: id }), artifacts: data.artifacts.map(id => BUFFS.find(b => b.id === id) || { name: id }), refreshCount: data.refresh_count, currentNode: data.current_node, tempJade: data.temp_jade || 0, pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/` };
      const dFP = await new Show(e).get_imgData('wanxiang_status', renderData);
      const img = await puppeteer.screenshot('wanxiang_status', dFP); await e.reply(img);
    } catch (err) { if (tempClient) await tempClient.disconnect(); }
  }

  async quitRun(e) {
    let tempClient = null;
    try {
      tempClient = await getTempRedis();
      const dataStr = await tempClient.get(KEY_PREFIX + e.user_id);
      if (dataStr) {
        const runData = JSON.parse(dataStr);
        if (runData.temp_jade > 0) {
            const userData = await this.getUserData(tempClient, e.user_id);
            userData.jade += runData.temp_jade; await this.saveUserData(tempClient, e.user_id, userData);
            e.reply(`已放弃试炼。本次获得 ${runData.temp_jade} ${META_CURRENCY_NAME}。`);
        } else e.reply('已放弃试炼。');
        await tempClient.del(KEY_PREFIX + e.user_id);
      } else e.reply('你当前没有进行中的试炼。');
      await tempClient.disconnect();
    } catch (err) { if (tempClient) await tempClient.disconnect(); }
  }
}