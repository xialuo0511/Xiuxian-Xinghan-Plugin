import { Combatant } from './Combatant.js';
import { loadItemConfig } from '../../model/ConfigLoader.js';

const allMonsters = Object.values(loadItemConfig('monsters.yaml') || {});

// 定义克制关系
const elementCounterMap = {
  '金': '木',
  '木': '土',
  '土': '水',
  '水': '火',
  '火': '金'
};
const COUNTER_BONUS = 1.5; // 克制伤害提升

/**
 * 战斗引擎 (Action Value System / 跑条制)
 * v4.0: 全面适配玩家PVP与星魂PVE
 */
export async function runCombat(playerSouls, enemyNames) {
  const combatLog = [];

  // 1. 初始化战斗单位
  // 支持传入已经是 Player 对象的数据，或者星魂配置对象
  const playerTeam = playerSouls.map((soul, i) => new Combatant(soul.id || `player_${i + 1}`, soul, 'player'));

  // 敌人同理，如果是字符串则查表，如果是对象则直接用
  const enemyTeam = enemyNames.map((item, i) => {
    if (typeof item === 'string') {
      return new Combatant(`enemy_${i + 1}`, allMonsters.find(m => m.name === item), 'enemy');
    } else {
      return new Combatant(item.id || `enemy_${i + 1}`, item, 'enemy');
    }
  }).filter(Boolean);

  const allCombatants = [...playerTeam,
    ...enemyTeam];

  // 2. 初始化行动值 & 技能
  allCombatants.forEach(c => {
    c.resetAV();
    if (!c.source.skill) {
      c.source.skill = generateDefaultSkill(c);
    }
  });

  combatLog.push({ type: 'start', text: '战斗开始！' });

  let totalElapsedAV = 0;
  let actionCount = 0;
  let roundCount = 1;

  combatLog.push({ type: 'turn', text: `--- 第 ${roundCount} 回合 ---` });

  // 3. 战斗循环
  while (playerTeam.some(p => p.isAlive()) && enemyTeam.some(e => e.isAlive())) {
    if (actionCount > 300) {
      combatLog.push({ type: 'system', text: '战斗僵持过久，强制结束。' });
      break;
    }

    // 3.1 寻找 Next Actor
    const aliveUnits = allCombatants.filter(c => c.isAlive());
    if (aliveUnits.length === 0) break;

    aliveUnits.sort((a, b) => a.current_av - b.current_av);
    const activeUnit = aliveUnits[0];

    // 结算 activeUnit 的 Debuff (如毒)
    const debuffResults = activeUnit.processDebuffs();
    if (debuffResults.length > 0) {
        combatLog.push({
            type: 'debuff_tick',
            caster: {
                name: activeUnit.name,
                team: activeUnit.team,
                element: activeUnit.element,
                level: activeUnit.level || 0,
                id: activeUnit.id
            },
            targets: debuffResults
        });
    }

    const elapsedAV = activeUnit.current_av;

    // 3.2 时间流逝
    aliveUnits.forEach(unit => {
      unit.current_av -= elapsedAV;
      if (unit.current_av < 0.0001) unit.current_av = 0;
    });

    totalElapsedAV += elapsedAV;
    actionCount++;

    if (actionCount % 10 === 0) {
      roundCount++;
      combatLog.push({ type: 'turn', text: `--- 第 ${roundCount} 回合 ---` });
    }

    // 检查控制状态 (如冰冻)
    if (activeUnit.is_frozen) {
        combatLog.push({
            type: 'skipped',
            reason: '被冰冻',
            skip_type: 'freeze',
            av_cost: Math.floor(elapsedAV),
            caster: {
                name: activeUnit.name,
                team: activeUnit.team,
                element: activeUnit.element,
                level: activeUnit.level || 0,
                id: activeUnit.id
            }
        });
        activeUnit.resetAV();
        continue;
    }

    // --- 行动逻辑 ---
    const skillConfig = activeUnit.source.skill;
    const friendlyTeam = (activeUnit.team === 'player') ? playerTeam : enemyTeam;
    const hostileTeam = (activeUnit.team === 'player') ? enemyTeam : playerTeam;

    const { skillResults, debuffsApplied } = executeSkill(activeUnit, skillConfig, friendlyTeam, hostileTeam);

    // 应用 Debuff
    debuffsApplied.forEach(d => {
        const targetUnit = allCombatants.find(c => c.id === d.id);
        if (targetUnit) {
            // 从原始技能配置中获取debuff的完整参数，因为debuffsApplied只包含日志信息
            const debuffConfig = activeUnit.source.skill.debuff;
            if (debuffConfig) {
                targetUnit.applyDebuff({ 
                    type: debuffConfig.type, 
                    caster_id: d.caster_id, 
                    duration: debuffConfig.duration, 
                    value: debuffConfig.value 
                });
            }
        }
    });

    // 被动技能触发
    const passiveDetails = [];
    if (activeUnit.passive_skills) {
        // ... (existing passive heal logic) ...
    }

    // 合并主动技能结果和 Debuff 结果
    const allActionResults = [...skillResults, ...debuffsApplied];

    // 3.4 记录日志
    if (allActionResults.length > 0 || passiveDetails.length > 0) {
        combatLog.push({
            details: passiveDetails,
            type: 'action',
            av_cost: Math.floor(elapsedAV),
            skill: skillConfig.name,
            caster: {
                name: activeUnit.name,
                team: activeUnit.team,
                element: activeUnit.element,
                level: activeUnit.level || 0,
                id: activeUnit.id 
            },
            targets: allActionResults,
            teamStatus: {
                player: playerTeam.map(getUnitStatus),
                enemy: enemyTeam.map(getUnitStatus)
            }
        });
    }

    activeUnit.resetAV();
  }

  const playerWon = playerTeam.some(p => p.isAlive());
  combatLog.push({ type: 'end', text: playerWon ? '恭喜你，获得了胜利！' : '很遗憾，你失败了。' });

  return { playerWon, log: combatLog, playerTeam, enemyTeam };
}

/**
 * 技能执行器
 */
function executeSkill(caster, skill, friendlyTeam, hostileTeam) {
  let targets = [];
  const results = [];
  const aliveHostiles = hostileTeam.filter(u => u.isAlive());
  const aliveFriendlies = friendlyTeam.filter(u => u.isAlive());

  if (aliveHostiles.length === 0 && skill.type === 'damage') return [];

  switch (skill.target) {
    case 'single_enemy':
      const t = selectTargetByTaunt(aliveHostiles);
      if (t) targets.push(t);
      break;
    case 'all_enemies':
      targets = aliveHostiles;
      break;
    case 'lowest_hp_ally':
      targets = aliveFriendlies.sort((a, b) => (a.current_hp / a.max_hp) - (b.current_hp / b.max_hp)).slice(0, 1);
      break;
    case 'all_allies':
      targets = aliveFriendlies;
      break;
    default:
      const defT = selectTargetByTaunt(aliveHostiles);
      if (defT) targets.push(defT);
      break;
  }

  if (targets.length === 0) return [];

  for (const target of targets) {
    let baseValue = 0;
    if (skill.value_type === 'def') baseValue = caster.defense * skill.value;
    else if (skill.value_type === 'max_hp') baseValue = caster.max_hp * skill.value;
    else baseValue = caster.attack * skill.value;

    if (skill.type === 'damage') {
      const res = calculateDamage(caster, target, baseValue);
      results.push(res);
    } else if (skill.type === 'heal') {
      const healed = target.receiveHeal(Math.floor(baseValue));
      results.push({
        name: target.name, team: target.team, element: target.element, level: target.level || 0,
        id: target.id,
        type: 'heal', value: healed, value_display: formatNumber(healed), is_counter: false
      });
    } else if (skill.type === 'shield') {
      target.addShield(Math.floor(baseValue));
      results.push({
        name: target.name,
        team: target.team,
        element: target.element,
        level: target.level || 0,
        id: target.id,
        type: 'shield',
        value: Math.floor(baseValue),
        value_display: formatNumber(Math.floor(baseValue)),
        is_counter: false
      });
    }
  }

  // 处理Debuff
  const debuffsApplied = [];
  if (skill.debuff) {
      if (skill.debuff.type === 'taunt') {
          const debuffTargets = (skill.debuff.target === 'all_enemies') ? hostileTeam.filter(u => u.isAlive()) : []; 
          debuffTargets.forEach(debuffTarget => {
              debuffTarget.setTaunted(caster.id);
              debuffsApplied.push({
                  name: debuffTarget.name, team: debuffTarget.team, element: debuffTarget.element, level: debuffTarget.level || 0,
                  id: debuffTarget.id, type: 'debuff', debuff_type: 'taunt', caster_id: caster.id,
                  value_display: `被嘲讽`, is_counter: false
              });
          });
      }
  }

  return { skillResults: results, debuffsApplied };
}

/**
 * 伤害计算逻辑 (自适应公式)
 */
function calculateDamage(attacker, target, rawDamageInput) {
    let elementalBonus = 1.0;
    let isCounter = false;
    
    // 克制判断
    if (elementCounterMap[attacker.element] === target.element) {
        elementalBonus = COUNTER_BONUS; // 1.5
        isCounter = true;
    }
    
    // 元素增伤 Buff (e.g. 火伤+25%)
    // 逻辑：在当前倍率基础上直接叠加 (1.5 + 0.25 = 1.75倍)
    if (attacker.elemental_buffs && attacker.elemental_buffs[attacker.element]) {
        elementalBonus += attacker.elemental_buffs[attacker.element];
    }

    let finalDmg = 0;
  // 【核心优化】自适应伤害公式
  // 如果攻击力 > 10000 (修仙玩家级)，使用减法+强力保底
  if (attacker.attack > 10000) {
    let def = target.defense * (1 - target.resistance);
    let baseDiff = rawDamageInput - def;

    // 玩家PVP保底：攻击力的 5% 也能造成伤害 (防止不破防)
    let minDmg = rawDamageInput * 0.05;

    let baseDmg = Math.max(baseDiff, minDmg);
    finalDmg = Math.floor(baseDmg * elementalBonus * (0.9 + Math.random() * 0.2));
  }
  // 否则 (星魂/低级怪)，使用经典的 RPG 乘法曲线公式
  else {
    const DEF_CONSTANT = 280;
    let defenseMultiplier = DEF_CONSTANT / (DEF_CONSTANT + target.defense);
    let resistanceMultiplier = (1 - target.resistance);

    let baseDmg = rawDamageInput * defenseMultiplier * resistanceMultiplier;
    finalDmg = Math.floor(baseDmg * elementalBonus * (0.9 + Math.random() * 0.2));
  }

  finalDmg = Math.max(1, finalDmg);
  target.takeDamage(finalDmg);

  return {
    name: target.name,
    team: target.team,
    element: target.element,
    level: target.level || 0,
    id: target.id,
    type: 'damage',
    value: finalDmg,
    value_display: formatNumber(finalDmg),
    is_counter: isCounter
  };
}

          function selectTargetByTaunt(candidates) {
              // 优先选择被当前施法者嘲讽的敌人
              // 注意：这里需要确保嘲讽者仍然存活，且目标是被活着的嘲讽者嘲讽
              const tauntedTargets = candidates.filter(c => c.isTaunted() && c.taunted_by_id === caster.id);
              if (tauntedTargets.length > 0) {
                  // 如果有多个被嘲讽，仍然按 taunt 值选择最高嘲讽度的那个 (虽然理论上只能被一个嘲讽)
                  tauntedTargets.sort((a, b) => b.taunt - a.taunt);
                  return tauntedTargets[0];
              }

              // 如果没有被当前施法者嘲讽的敌人，则按正常逻辑选择 taunt 值最高的敌人
              if (candidates.length === 0) return null;
              candidates.sort((a, b) => b.taunt - a.taunt); // Taunt值最高的优先
              return candidates[0];
          }

const getUnitStatus = (unit) => {
  const max_hp = unit.max_hp > 0 ? unit.max_hp : 1;
  const current_hp = unit.current_hp || 0;
  let hp_percent = (current_hp / max_hp) * 100;
  let shield_percent = (unit.shield / max_hp) * 100;

  return {
    name: unit.name,
    hp: current_hp,
    max_hp: unit.max_hp,
    hp_display: formatNumber(current_hp),
    max_hp_display: formatNumber(unit.max_hp),
    shield: unit.shield,
    hp_percent: Math.max(0, Math.min(hp_percent, 100)),
    shield_percent: Math.min(shield_percent, 100),
    av: Math.floor(unit.current_av),
    id: unit.id // 用于前端显示头像
  };
};

function formatNumber(num) {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  return Math.floor(num).toString();
}

/**
 * 默认技能生成 (适配玩家)
 */
function generateDefaultSkill(unit) {
  const element = unit.element;
  const nameMap = {
    '金': '万剑归宗',
    '木': '枯木逢春', // 注意：下面逻辑暂未适配治疗，默认全是 damage
    '水': '惊涛骇浪',
    '火': '烈焰焚天',
    '土': '泰山压顶',
    '无': '普通攻击'
  };

  // 如果是木系，我们给一个特殊逻辑？
  // 暂时全部输出，因为PVP主要是对打

  return {
    name: nameMap[element] || '普通攻击',
    type: 'damage',
    target: 'single_enemy',
    value_type: 'atk',
    value: 1.2
  };
}