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
  { name: '贫苦', desc: '本局无法获得天机印，无法在商店买Buff', profit: 0.3 },
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
      if (!upgrade) { await tempClient.disconnect(); return e.reply('你的天机秘术已臻化境。'); }
      if (userData.jade < upgrade.cost) { await tempClient.disconnect(); return e.reply(`天机玉不足！需要 ${upgrade.cost}。`); }
      userData.jade -= upgrade.cost; userData.level = nextId;
      await this.saveUserData(tempClient, e.user_id, userData); await tempClient.disconnect();
      e.reply(`强化成功！已激活【${upgrade.name}】`);
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
        await tempClient.disconnect(); return e.reply(`战斗失败冷静中，剩 ${remaining} 秒。`);
      }
      const inputStr = e.msg.replace('#开启试炼', '').trim();
      const selectedOaths = inputStr ? inputStr.split(/[\s,，]+/).filter(Boolean) : [];
      const activeOaths = []; let totalProfit = 0;
      if (selectedOaths.length > 0) {
        if (!userData.cleared) { await tempClient.disconnect(); return e.reply('通关一次基础 20 层方可开启誓约。'); }
        for (const oName of selectedOaths) {
          const oath = OATHS.find(o => o.name === oName);
          if (!oath) { await tempClient.disconnect(); return e.reply(`未知誓约：【${oName}】。可选：${OATHS.map(o => o.name).join('、')}`); }
          if (!activeOaths.find(a => a.name === oName)) { activeOaths.push(oath); totalProfit += oath.profit; }
        }
        if (totalProfit <= 0) { await tempClient.disconnect(); return e.reply('不可只选收益为 0% 的誓约。'); }
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
      if (soulsState.length === 0) { await tempClient.disconnect(); return e.reply('无出战星魂。'); }
      const runData = { layer: 1, souls: soulsState, buffs: [], jing_yin: 0, temp_jade: 0, artifacts: [], start_time: now, refresh_count: 3, current_node: { type: 'COMBAT', name: '激战', desc: '普通的战斗。' }, routes: [], user_level: userData.level, active_oaths: activeOaths, total_profit: totalProfit };
      await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData)); await tempClient.disconnect();
      const oathText = activeOaths.length > 0 ? `
已激活誓约：${activeOaths.map(o => `【${o.name}】`).join('、')} (+${(totalProfit * 100).toFixed(0)}%)` : '';
      e.reply([`【万象天机】开启！`, `出战：${soulsState.map(s => s.name).join('、')}`, oathText, `第 1 层【激战】，发送 #挑战。`].join('\n'));
    } catch (err) { if (tempClient) await tempClient.disconnect(); e.reply('错误：' + err.message); }
  }

  generateRoutes(layer, activeOaths = []) {
    if (layer % 5 === 0) return [{ type: 'BOSS', name: '首领降临', desc: '强大的敌人。', rarity: 5 }];
    const options = [];
    let availableTypes = [
      { type: 'COMBAT', name: '激战', desc: '普通战斗。', weight: 60 },
      { type: 'ELITE', name: '精英', desc: '属性提升30%。', weight: 15 },
      { type: 'EVENT', name: '奇遇', desc: '随机事件。', weight: 15 },
      { type: 'MONSTER_TREASURE', name: '盗宝妖兽', desc: '奖励丰厚。', weight: 10 }
    ];
    if (activeOaths.some(o => o.name === '寻妖') && layer < 5) availableTypes.find(t => t.type === 'MONSTER_TREASURE').weight = 30;
    if (layer % 5 === 4) {
      options.push({ type: 'REST', name: '修整', desc: '回复状态。', weight: 0 });
      options.push({ type: 'SHOP', name: '商店', desc: '购买。', weight: 0 });
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
      e.reply(`${prefixMsg}\n\n进入第 ${runData.layer} 层：【${runData.current_node.name}】。发送 #挑战。`);
    } else {
      await tempClient.set(KEY_PREFIX + e.user_id, JSON.stringify(runData));
      let msg = `${prefixMsg}\n\n进入第 ${runData.layer} 层。请选择路线：\n`;
      nextRoutes.forEach((r, i) => msg += `${i + 1}. 【${r.name}】 ${r.desc}\n`);
      e.reply(msg + '发送 #选择路线 [序号]');
    }
  }

  async selectRoute(e) {
    const userId = e.user_id; const selection = parseInt(e.msg.match(/\d/)?.[0]);
    let tempClient = null;
    try {
      tempClient = await getTempRedis();
      const runData = JSON.parse(await tempClient.get(KEY_PREFIX + userId));
      if (!runData) { await tempClient.disconnect(); return e.reply('请先 #开启试炼。'); }
      if (!runData.routes?.length) { await tempClient.disconnect(); return e.reply('无需选择。'); }
      if (!selection || selection < 1 || selection > runData.routes.length) { await tempClient.disconnect(); return e.reply('选择无效。'); }
      const node = runData.routes[selection - 1]; runData.current_node = node; runData.routes = [];
      if (node.type === 'SHOP') {
        if (runData.active_oaths?.some(o => o.name === '贫苦')) {
          runData.layer++; await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
          await this.processRouteGeneration(e, runData, tempClient, '誓约·贫苦生效，商店关闭。');
          await tempClient.disconnect(); return;
        }
        runData.shop_items = []; runData.shop_refresh_count = 1;
        const weights = { 1: 80, 2: 40, 3: 10, 4: 0 };
        const pool = BUFFS.filter(b => b.rarity < 4 && b.type !== 'artifact_passive' && !runData.buffs.includes(b.id));
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
        if (!runData.artifacts.includes('treasure_bowl')) runData.shop_items.push({ type: 'artifact', id: 'treasure_bowl', name: '聚宝盆', desc: '收益+30%', price: 100, rarity: 3, bought: false });
      } else if (node.type === 'EVENT') {
        const r = Math.random();
        runData.current_node.sub_type = r < 0.25 ? 'vending_machine_gold' : (r < 0.45 ? 'vending_machine_weird' : (r < 0.6 ? 'gamble_all' : (r < 0.65 ? 'ultimate_boost' : (r < 0.82 ? 'soul_enhance' : 'vending_machine'))));
        runData.current_node.event_count = 0;
      }
      await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData));
      if (['COMBAT', 'ELITE', 'BOSS', 'MONSTER_TREASURE'].includes(node.type)) e.reply(`你选择了【${node.name}】。发送 #挑战。`);
      else if (node.type === 'SHOP') {
        let msg = `持有：${runData.jing_yin}\n`;
        runData.shop_items.forEach((it, i) => msg += `${i + 1}. 【${it.name}】${it.bought ? '(售罄)' : '💰' + it.price}\n`);
        e.reply(msg + `${runData.shop_items.length + 1}. 刷新
${runData.shop_items.length + 2}. 离开
#事件选择 [序号]`);
      } else if (node.type === 'REST') e.reply('1. 修养(40%HP)\n2. 招魂(复活)\n3. 冥想(+1刷新)\n#事件选择 [序号]');
      else if (node.type === 'EVENT') {
        const sub = runData.current_node.sub_type;
        if (sub === 'vending_machine_gold') e.reply('抽奖机：1. 抽奖(100印，限3次) 2. 离开');
        else if (sub === 'vending_machine_weird') e.reply('奇怪机：1. 抽奖(25印，限3次) 2. 离开');
        else if (sub === 'gamble_all') e.reply('契约：1. 放手一搏(99%HP换极强属性) 2. 离开');
        else if (sub === 'ultimate_boost') e.reply('圣光：1. 顶级强化(全复活全满并专属) 2. 离开');
        else if (sub === 'soul_enhance') e.reply('老者：1. 求教(专属强化) 2. 离开');
        else e.reply('售货机：1. 补给(20%HP换3赐福) 2. 暴力 3. 离开');
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
        if (selection === items.length + 2) { replyMsg = '离开了。'; isDone = true; }
        else if (selection === items.length + 1) { e.reply('正在刷新...'); return this.selectRoute(e); }
        else if (selection >= 1 && selection <= items.length) {
          const it = items[selection - 1];
          if (it.bought) e.reply('售罄');
          else if (runData.jing_yin < it.price) e.reply('钱不够');
          else { runData.jing_yin -= it.price; it.bought = true; if (it.type === 'artifact') runData.artifacts.push(it.id); else runData.buffs.push(it.id); e.reply('购买成功'); }
        }
      } else if (node.type === 'REST') {
        if (selection === 1) { runData.souls.forEach(s => { if (!s.is_dead) s.current_hp = Math.min(s.max_hp, s.current_hp + Math.floor(s.max_hp * 0.4)); }); replyMsg = '恢复了。'; isDone = true; }
        else if (selection === 2) { const dead = runData.souls.filter(s => s.is_dead); if (dead.length) { const s = dead[Math.floor(Math.random() * dead.length)]; s.is_dead = false; s.current_hp = Math.floor(s.max_hp * 0.5); replyMsg = `${s.name}复活。`; } else replyMsg = '无人阵亡。'; isDone = true; }
        else if (selection === 3) { runData.refresh_count++; replyMsg = '刷新+1。'; isDone = true; }
      } else if (node.type === 'EVENT') {
        const sub = node.sub_type;
        if (sub === 'vending_machine_gold' && selection === 1) {
          if (runData.jing_yin < 100 || node.event_count >= 3) { e.reply('不可用'); return; }
          runData.jing_yin -= 100; node.event_count++; const r = Math.random();
          if (r < 0.05) { runData.jing_yin += 500; replyMsg = '500印！'; }
          else if (r < 0.07) { const b = BUFFS.filter(b => b.rarity === 4)[0]; runData.buffs.push(b.id); replyMsg = `得【${b.name}】`; }
          else if (r < 0.1) { const b = BUFFS.filter(b => b.rarity === 3)[0]; runData.buffs.push(b.id); replyMsg = `得【${b.name}】`; }
          else if (r < 0.7) { const b = BUFFS.filter(b => b.rarity <= 2)[0]; runData.buffs.push(b.id); replyMsg = `得【${b.name}】`; }
          else replyMsg = '空的。';
          if (node.event_count >= 3) isDone = true; else { await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData)); e.reply(replyMsg + `
剩${3 - node.event_count}次`); return; }
        } else if (sub === 'vending_machine_weird' && selection === 1) {
          if (runData.jing_yin < 25 || node.event_count >= 3) { e.reply('不可用'); return; }
          runData.jing_yin -= 25; node.event_count++; const r = Math.random();
          if (r < 0.1) { runData.souls.forEach(s => s.current_hp = Math.max(1, Math.floor(s.current_hp * 0.9))); replyMsg = 'HP-10%'; }
          else if (r < 0.2) { runData.souls.forEach(s => s.current_hp = Math.min(s.max_hp, Math.floor(s.current_hp * 1.1))); replyMsg = 'HP+10%'; }
          else if (r < 0.4) { runData.extra_atk_pct = (runData.extra_atk_pct || 0) + 1.0; replyMsg = '攻击+100%'; }
          else if (r < 0.6) { const oath = OATHS[Math.floor(Math.random() * OATHS.length)]; runData.active_oaths.push({ ...oath, profit: oath.profit + 0.1 }); replyMsg = `得誓约【${oath.name}】且收益+10%`; }
          else replyMsg = '无事发生。';
          if (node.event_count >= 3) isDone = true; else { await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData)); e.reply(replyMsg); return; }
        } else if (sub === 'gamble_all' && selection === 1) { runData.souls.forEach(s => s.current_hp = 1); runData.gamble_buff = true; replyMsg = '契约立。'; isDone = true; }
        else if (sub === 'ultimate_boost' && selection === 1) { runData.souls.forEach(s => { s.is_dead = false; s.current_hp = s.max_hp; const b = BUFFS.find(b => b.type === 'soul_exclusive' && b.exclusive_soul === s.name && b.rarity === 3); if (b && !runData.buffs.includes(b.id)) runData.buffs.push(b.id); }); replyMsg = '全满强化。'; isDone = true; }
        else if (sub === 'soul_enhance' && selection === 1) { const b = BUFFS.find(b => b.type === 'soul_exclusive' && runData.souls.some(s => s.name === b.exclusive_soul) && !runData.buffs.includes(b.id)); if (b) { runData.buffs.push(b.id); replyMsg = `得【${b.name}】`; } else replyMsg = '无果。'; isDone = true; }
        else { replyMsg = '离开了。'; isDone = true; }
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
      if (!runData?.current_node) { await tempClient.disconnect(); return e.reply('选路线。'); }
      const node = runData.current_node;
      if (!['COMBAT', 'ELITE', 'BOSS', 'MONSTER_TREASURE'].includes(node.type)) { await tempClient.disconnect(); return e.reply('不可挑战。'); }
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
      let enemies = [];
      if (node.type === 'MONSTER_TREASURE') {
          for (let i = 0; i < 3; i++) enemies.push({ id: `t_${i}`, name: '盗宝妖兽', base_stats: { health: 500 * runData.layer, attack: 1, defense: 50, speed: 150, resistance: 0, taunt: 100, element: '无' }, is_treasure: true, skills: { basic: { name: '观望', type: 'damage', value: 0, target: 'single_enemy' } } });
      } else {
          const names = STAGES.find(s => s.layer === runData.layer)?.monsters || [];
          enemies = names.map(n => {
            const m = JSON.parse(JSON.stringify(ALL_MONSTERS.find(am => am.name === n)));
            let mul = 1 + (runData.layer - 1) * 0.08;
            if (node.type === 'ELITE') mul *= 1.3; if (node.type === 'BOSS') { mul *= 1.5; if (activeOaths.some(o => o.name === '天泽')) mul *= 0.9; }
            m.base_stats.health = Math.floor(m.base_stats.health * mul); m.base_stats.attack = Math.floor(m.base_stats.attack * mul);
            if (activeOaths.some(o => o.name === '坚毅')) m.initial_shields = Math.floor(m.base_stats.health * 0.3);
            return m;
          });
          if (Math.random() < 0.05) enemies.push({ id: `t_extra`, name: '盗宝妖兽', base_stats: { health: 500 * runData.layer, attack: 1, defense: 50, speed: 150, resistance: 0, taunt: 100, element: '无' }, is_treasure: true, skills: { basic: { name: '观望', type: 'damage', value: 0, target: 'single_enemy' } } });
      }
      e.reply('战斗中...');
      const result = await runCombat(battleSouls, enemies, runData.buffs, 20);
      for (const s of runData.souls) { const c = result.playerTeam.find(pt => pt.name === s.name); if (c) { s.current_hp = c.current_hp; s.is_dead = c.current_hp <= 0; } }
      if (result.playerWon) {
        let jade = Math.floor((node.type === 'BOSS' ? 30 : 5) * (1 + runData.total_profit));
        let gold = Math.floor((Math.random() * 20 + 10) * (activeOaths.some(o => o.name === '俭省') ? 0.5 : 1));
        if (node.type === 'MONSTER_TREASURE') {
            const killed = result.enemyTeam.filter(et => et.current_hp <= 0 && !et.has_fled).length;
            gold = killed === 3 ? 300 : 250; e.reply(`击败${killed}妖兽，获${gold}印。`);
        } else {
            const killedExtra = result.enemyTeam.filter(et => et.name === '盗宝妖兽' && et.current_hp <= 0 && !et.has_fled).length;
            if (killedExtra > 0) { gold += 50; e.reply(`额获50印！`); }
        }
        runData.jing_yin += gold; runData.temp_jade += jade;
        if (runData.layer >= 20) {
          const ud = await this.getUserData(tempClient, userId); ud.jade += runData.temp_jade + (runData.total_profit >= 1.0 ? 150 : 0); ud.cleared = true;
          await this.saveUserData(tempClient, userId, ud); await tempClient.del(KEY_PREFIX + userId); e.reply(`通关！获${runData.temp_jade}玉。`);
        } else {
          runData.layer++; runData.remaining_picks = node.type === 'ELITE' ? 2 : 1;
          const isBossNode = node.type === 'BOSS' && !activeOaths.some(o => o.name === '变数');
          let currentWeights = isBossNode ? { 1: 0, 2: 0, 3: 75, 4: 25 } : { 1: 80, 2: 40, 3: 10, 4: 0 };
          const pool = BUFFS.filter(b => b.type !== 'artifact_passive' && !runData.buffs.includes(b.id) && currentWeights[b.rarity] > 0);
          runData.pending_buffs = [];
          for (let i = 0; i < 3 && pool.length > 0; i++) {
              let total = pool.reduce((acc, b) => acc + currentWeights[b.rarity], 0); let r = Math.random() * total;
              for (let j = 0; j < pool.length; j++) { r -= currentWeights[pool[j].rarity]; if (r <= 0) { runData.pending_buffs.push(pool[j].id); pool.splice(j, 1); break; } }
          }
          await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData)); e.reply(`捷！获${gold}印。#选择赐福 [1-3]`);
        }
      } else {
        const ud = await this.getUserData(tempClient, userId); ud.last_fail_time = Date.now(); ud.jade += runData.temp_jade;
        await this.saveUserData(tempClient, userId, ud); await tempClient.del(KEY_PREFIX + userId); e.reply('败。3分钟冷静。');
      }
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
      const bid = runData.pending_buffs[selection - 1]; runData.buffs.push(bid);
      runData.remaining_picks--; runData.pending_buffs.splice(selection - 1, 1);
      if (runData.remaining_picks <= 0) { runData.pending_buffs = []; await this.processRouteGeneration(e, runData, tempClient, '选定。'); }
      else { await tempClient.set(KEY_PREFIX + userId, JSON.stringify(runData)); e.reply(`剩${runData.remaining_picks}个。`); }
      await tempClient.disconnect();
    } catch (err) { if (tempClient) await tempClient.disconnect(); }
  }

  async showStatus(e) {
    const userId = e.user_id; let tempClient = null;
    try {
      tempClient = await getTempRedis(); const dataStr = await tempClient.get(KEY_PREFIX + userId); await tempClient.disconnect();
      if (!dataStr) return e.reply('未在试炼。');
      const data = JSON.parse(dataStr);
      const renderData = { layer: data.layer, souls: data.souls, buffs: data.buffs.map(id => BUFFS.find(b => b.id === id) || { name: id }), artifacts: data.artifacts.map(id => BUFFS.find(b => b.id === id) || { name: id }), refreshCount: data.refresh_count, currentNode: data.current_node, tempJade: data.temp_jade || 0, pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/` };
      const dataForPuppeteer = await new Show(e).get_imgData('wanxiang_status', renderData);
      const img = await puppeteer.screenshot('wanxiang_status', { ...dataForPuppeteer }); await e.reply(img);
    } catch (err) { if (tempClient) await tempClient.disconnect(); }
  }

  async quitRun(e) {
    let tempClient = null;
    try {
      tempClient = await getTempRedis();
      const dataStr = await tempClient.get(KEY_PREFIX + e.user_id);
      
      if (dataStr) {
        const runData = JSON.parse(dataStr);
        // 结算天机玉
        if (runData.temp_jade > 0) {
            const userData = await this.getUserData(tempClient, e.user_id);
            userData.jade += runData.temp_jade;
            await this.saveUserData(tempClient, e.user_id, userData);
            e.reply(`已放弃试炼。本次获得 ${runData.temp_jade} ${META_CURRENCY_NAME}。`);
        } else {
            e.reply('已放弃试炼。本次未获得天机玉。');
        }
        await tempClient.del(KEY_PREFIX + e.user_id);
      } else {
         e.reply('你当前没有进行中的试炼。');
      }
      
      await tempClient.disconnect();
      tempClient = null;
    } catch (err) {
      console.error('[Wanxiang] quitRun Redis Error:', err);
      if (tempClient) await tempClient.disconnect();
      e.reply('退出试炼失败：' + err.message);
    }
  }
}
