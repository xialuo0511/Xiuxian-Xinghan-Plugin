// /logic/elemental_logic.js

import * as DAL from '../api/data-access.js';
import { isNotNull } from '../apps/Xiuxian/xiuxian.js';

// --- 元素反应规则定义 ---
// 定义了所有元素之间的基础反应规则
const elementalReactions = [
  // 火元素触发
  { attacker: '火', defender: '水', name: '蒸发', multiplier: 2.0, message: '触发了蒸发反应, 额外造成了100%伤害' },
  { attacker: '火', defender: '雷', name: '超载', multiplier: 1.2, message: '触发了超载反应, 额外造成了20%伤害' },
  { attacker: '火', defender: '冰', name: '融化', multiplier: 2.0, message: '触发了融化反应, 额外造成了200%伤害' },
  {
    attacker: '火',
    defender: '草',
    name: '燃烧',
    multiplier: 1.2,
    probability: 0.6,
    status: { name: '燃烧', duration: 3 },
    message: '触发了燃烧反应, 目标将受到持续伤害'
  },

  // 水元素触发
  { attacker: '水', defender: '火', name: '蒸发', multiplier: 2.0, message: '触发了蒸发反应, 额外造成了100%伤害' },
  {
    attacker: '水',
    defender: '雷',
    name: '感电',
    multiplier: 1.5,
    status: { name: '感电', duration: 3 },
    message: '触发了感电反应, 目标将受到持续伤害'
  },
  {
    attacker: '水',
    defender: '冰',
    name: '冻结',
    probability: 0.5,
    status: { name: '冻结', duration: 1 },
    message: '触发了冻结反应, 目标下一回合无法出手'
  },
  {
    attacker: '水',
    defender: '草',
    name: '绽放',
    multiplier: 1.2,
    selfDamage: 0.1,
    targetDamage: 0.3,
    message: '触发了绽放反应, 草原核爆炸了！'
  },

  // 雷元素触发
  { attacker: '雷', defender: '火', name: '超载', multiplier: 1.2, message: '触发了超载反应, 额外造成了20%伤害' },
  {
    attacker: '雷',
    defender: '水',
    name: '感电',
    multiplier: 1.5,
    status: { name: '感电', duration: 3 },
    message: '触发了感电反应, 目标将受到持续伤害'
  },
  {
    attacker: '雷',
    defender: '冰',
    name: '超导',
    multiplier: 1.5,
    probability: 0.5,
    status: { name: '超导', duration: 3 },
    message: '触发了超导反应, 目标抗性被削弱'
  },
  { attacker: '雷', defender: '草', name: '激化', multiplier: 2.0, message: '触发了激化反应, 伤害提升100%' },

  // 冰元素触发
  { attacker: '冰', defender: '火', name: '融化', multiplier: 2.0, message: '触发了融化反应, 额外造成了200%伤害' },
  {
    attacker: '冰',
    defender: '水',
    name: '冻结',
    probability: 0.5,
    status: { name: '冻结', duration: 1 },
    message: '触发了冻结反应, 目标下一回合无法出手'
  },
  {
    attacker: '冰',
    defender: '雷',
    name: '超导',
    multiplier: 1.5,
    probability: 0.5,
    status: { name: '超导', duration: 3 },
    message: '触发了超导反应, 目标抗性被削弱'
  },

  // 岩元素触发
  {
    attacker: '岩',
    name: '结晶',
    selfBuff: { type: 'defense', multiplier: 0.5, duration: 1 },
    message: '触发了结晶反应, 自身抗性得到了大幅提高'
  }

  // 风元素触发 (扩散逻辑在核心函数中特殊处理)
];

// --- 武器与功法特效定义 ---
// 定义了所有武器、功法、灵根和通用战斗事件的触发条件和效果
const skillEffects = [
  // --- 功法技能 ---
  {
    name: '八品·鬼帝功', type: 'gongfa', condition: (ctx) => ctx.turn === 0 && Math.random() > 0.2,
    apply: (ctx) => {
      ctx.messages.push(`${ctx.attacker.名号} 使用【鬼剑】暴起冲向 ${ctx.defender.名号}`);
      ctx.damage = ctx.damage * 1.1 + 100000;
      return ctx;
    }
  },
  {
    name: '伪八品·影杀', type: 'gongfa', condition: (ctx) => ctx.turn === 0 && Math.random() > 0.2,
    apply: (ctx) => {
      ctx.messages.push(`${ctx.attacker.名号} 使用影杀！突然暴起冲向 ${ctx.defender.名号}`);
      ctx.damage += 100000;
      return ctx;
    }
  },
  {
    name: '八品·八荒剑法', type: 'gongfa', condition: (ctx) => ctx.turn === 2,
    apply: (ctx) => {
      ctx.messages.push(`${ctx.attacker.名号} 使用八荒剑法【斩八荒！】`);
      ctx.damage *= 1.2;
      return ctx;
    }
  },
  {
    name: '八品·天星', type: 'gongfa', condition: (ctx) => ctx.turn === 4,
    apply: (ctx) => {
      ctx.messages.push(`${ctx.attacker.名号} 使用天星【天动万象！】`);
      ctx.damage = ctx.damage * 1.2 + 200000;
      return ctx;
    }
  },
  {
    name: '九品·第一魔功', type: 'gongfa', side: 'attacker', condition: (ctx) => ctx.turn === 2,
    apply: (ctx) => {
      ctx.messages.push(`${ctx.attacker.名号} 使用第一魔功【噬天！】`);
      ctx.damage = ctx.damage * 1.15 + 300000;
      return ctx;
    }
  },
  {
    name: '九品·第一魔功', type: 'gongfa', side: 'defender', condition: (ctx) => Math.random() < 0.03,
    apply: (ctx) => {
      ctx.messages.push(`${ctx.defender.名号} 使用了第一魔功【魔转！】你的伤害被转走了大部分`);
      ctx.damage *= 0.5;
      return ctx;
    }
  },
  {
    name: '伪九品·魔帝功', type: 'gongfa', side: 'defender', condition: (ctx) => ctx.turn === 2 && Math.random() < 0.3,
    apply: (ctx) => {
      ctx.messages.push(`${ctx.defender.名号} 使用了魔帝功【吞噬】你的伤害被吸收了`);
      ctx.damage *= -0.1; // 伤害变为治疗
      return ctx;
    }
  },
  {
    name: '八品·避空', type: 'gongfa', side: 'defender', condition: (ctx) => ctx.turn === 4,
    apply: (ctx) => {
      ctx.messages.push(`${ctx.defender.名号} 使用了避空【遁空！】`);
      ctx.damage *= 0.5;
      return ctx;
    }
  },

  // --- 灵根技能 ---
  {
    name: '轮回道体', type: 'linggen', condition: (ctx) => ctx.turn === 4,
    apply: (ctx) => {
      ctx.messages.push(`${ctx.attacker.名号} 使用了先天神通，轮回之力崩泄而出！`);
      ctx.damage *= 1.5;
      return ctx;
    }
  },
  {
    name: '破虚踏星体', type: 'linggen', side: 'defender', condition: (ctx) => Math.random() > 0.98,
    apply: (ctx) => {
      ctx.messages.push(`${ctx.defender.名号}使用了先天神通 【破虚】！你的伤害无法命中！`);
      ctx.damage = 0;
      return ctx;
    }
  },
  {
    name: '灭道杀神体', type: 'linggen', condition: (ctx) => ctx.turn === 12,
    apply: (ctx) => {
      ctx.messages.push(`${ctx.attacker.名号}使用了先天神通 【杀破神】！`);
      ctx.damage *= 3;
      return ctx;
    }
  },

  // --- 武器技能 ---
  {
    name: '赤角石溃杵',
    type: 'weapon',
    condition: (ctx) => ctx.attacker.灵根.name === '仙之心·岩' && Math.random() > 0.5,
    apply: (ctx) => {
      if (ctx.attacker.equipment.武器.fumo === '岩') {
        ctx.messages.push('触发元素爆发:[鬼域狂欢], 20%的防御转化成攻击');
        ctx.damage += ctx.attacker.防御 * 0.2;
        ctx.attacker.防御 *= 0.6;
      } else {
        ctx.messages.push('触发元素爆发:[鬼王游行通通闪开], 10%的防御转化成攻击');
        ctx.damage += ctx.attacker.防御 * 0.1;
        ctx.attacker.防御 *= 0.8;
      }
      return ctx;
    }
  },
  {
    name: '护摩之杖',
    type: 'weapon',
    condition: (ctx) => ctx.attacker.当前血量 < ctx.attacker.血量上限 / 2 && Math.random() > 0.8,
    apply: (ctx) => {
      ctx.messages.push(`触发护摩之杖被动技能:[无羁的朱赤之蝶], 伤害大幅度提升`);
      ctx.damage *= (ctx.attacker.灵根.name === '仙之心·火' ? 2.5 : 2.0);
      return ctx;
    }
  },
  {
    name: '磐岩结绿', type: 'weapon', condition: (ctx) => Math.random() > 0.8,
    apply: (ctx) => {
      ctx.messages.push('触发磐岩结绿被动技能:[护国的无垢之心], 血量恢复30%');
      ctx.attacker.当前血量 = Math.min(ctx.attacker.血量上限, ctx.attacker.当前血量 + ctx.attacker.血量上限 * 0.3);
      ctx.damage *= (ctx.attacker.灵根.name === '仙之心·水' ? 1.5 : 1.3);
      return ctx;
    }
  },

  // --- 通用战斗事件 ---
  {
    name: '发现破绽', type: 'general', side: 'attacker', condition: (ctx) => Math.random() < 0.06,
    apply: (ctx) => {
      ctx.messages.push(`你找到了 ${ctx.defender.名号} 的破绽！这一下无处可逃！`);
      ctx.damage *= 1.3;
      return ctx;
    }
  },
  {
    name: '攻击被破解', type: 'general', side: 'defender', condition: (ctx) => Math.random() > 0.94,
    apply: (ctx) => {
      ctx.messages.push(`你的攻击被 ${ctx.defender.名号} 破解了`);
      ctx.damage *= 0.6;
      return ctx;
    }
  }
];


/**
 * 核心处理函数：应用所有元素及技能效果
 * @param {object} context - 战斗上下文
 * @returns {object} - 更新后的战斗上下文
 */
export async function applyElementalEffects(context) {
  let { attacker, defender, damage, messages, turn, statusEffects } = context;

  const attackerElement = attacker.灵根.name.replace('仙之心·', '');
  const defenderElement = defender.灵根.name.replace('仙之心·', '');
  const weaponEnchant = attacker.equipment?.武器.fumo;

  // 1. 处理元素反应
  const reaction = elementalReactions.find(r =>
    (r.attacker === attackerElement && (r.defender === defenderElement || r.defender === weaponEnchant))
  );

  if (reaction && (!reaction.probability || Math.random() < reaction.probability)) {
    messages.push(`${attacker.名号}的[${attackerElement}]元素攻击与目标的[${defenderElement}]元素或武器附魔[${weaponEnchant}]产生了反应！`);
    messages.push(reaction.message);

    if (reaction.multiplier) damage *= reaction.multiplier;
    if (reaction.selfDamage) attacker.当前血量 -= damage * reaction.selfDamage;
    if (reaction.targetDamage) defender.当前血量 -= damage * reaction.targetDamage;

    if (reaction.status) {
      statusEffects[defender.id] = statusEffects[defender.id] || {};
      statusEffects[defender.id][reaction.status.name] = reaction.status.duration;
    }
    context.chufa = true;
  }

  //扩散
  if (attackerElement === '风' && weaponEnchant && ['水',
    '火',
    '雷',
    '冰',
    '草'].includes(weaponEnchant)) {
    messages.push(`${attacker.名号}使用了风元素战技, 扩散了武器上的[${weaponEnchant}]元素, 触发了扩散反应, 伤害得到了提高`);
    damage *= 1.2;
    context.chufa = true;
  }

  // 2. 处理武器/功法/灵根/通用特效
  const applicableSkills = skillEffects.filter(skill => {
    const isAttackerSkill = !skill.side || skill.side === 'attacker';
    const isDefenderSkill = skill.side === 'defender';

    if (isAttackerSkill) {
      return (skill.type === 'weapon' && attacker.equipment?.武器.name === skill.name ||
        skill.type === 'gongfa' && attacker.学习的功法.includes(skill.name) ||
        skill.type === 'linggen' && attacker.灵根.name === skill.name ||
        skill.type === 'general') && skill.condition(context);
    }
    if (isDefenderSkill) {
      return (skill.type === 'weapon' && defender.equipment?.武器.name === skill.name ||
        skill.type === 'gongfa' && defender.学习的功法.includes(skill.name) ||
        skill.type === 'linggen' && defender.灵根.name === skill.name ||
        skill.type === 'general') && skill.condition(context);
    }
    return false;
  });

  for (const skill of applicableSkills) {
    context = skill.apply(context);
  }

  // 3. 处理持续性状态效果 (如燃烧, 感电)
  if (statusEffects[attacker.id]) {
    if (statusEffects[attacker.id]['燃烧'] > 0) {
      const dotDamage = damage * 0.15;
      attacker.当前血量 -= dotDamage;
      messages.push(`${attacker.名号}正处于燃烧状态，受到了${Math.trunc(dotDamage)}点持续伤害！`);
      statusEffects[attacker.id]['燃烧']--;
    }
    if (statusEffects[attacker.id]['感电'] > 0) {
      const dotDamage = damage * 0.15;
      attacker.当前血量 -= dotDamage;
      messages.push(`${attacker.名号}正处于感电状态，受到了${Math.trunc(dotDamage)}点持续伤害！`);
      statusEffects[attacker.id]['感电']--;
    }
  }

  // 更新并返回最终的上下文
  context.damage = damage;
  context.attacker = attacker;
  context.defender = defender;
  context.messages = messages;
  context.statusEffects = statusEffects;

  return context;
}
