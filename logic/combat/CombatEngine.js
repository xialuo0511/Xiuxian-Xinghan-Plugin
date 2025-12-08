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
 * v3.0: 技能驱动的动态战斗系统
 */
export async function runCombat(playerSouls, enemyNames) {
  const combatLog = [];
  
  // 1. 初始化战斗单位
  const playerTeam = playerSouls.map((soul, i) => new Combatant(`player_${i + 1}`, soul, 'player'));
  const enemyTeam = enemyNames.map((name, i) => new Combatant(`enemy_${i + 1}`, allMonsters.find(m => m.name === name), 'enemy')).filter(Boolean);
  const allCombatants = [...playerTeam, ...enemyTeam];

  // 2. 初始化行动值
  allCombatants.forEach(c => c.resetAV());

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

    // --- 行动逻辑开始 ---
    // 获取单位的技能配置，如果没有(如怪物)，则使用默认普攻逻辑
    const skillConfig = activeUnit.source.skill || {
        name: "普通攻击",
        type: "damage",
        target: "single_enemy",
        value_type: "atk",
        value: 1.0
    };

    const friendlyTeam = (activeUnit.team === 'player') ? playerTeam : enemyTeam;
    const hostileTeam = (activeUnit.team === 'player') ? enemyTeam : playerTeam;

    // 执行技能
    const actionResults = executeSkill(activeUnit, skillConfig, friendlyTeam, hostileTeam);

    // 3.4 记录日志
    if (actionResults.length > 0) {
        combatLog.push({
            type: 'action',
            av_cost: Math.floor(elapsedAV),
            skill: skillConfig.name,
            caster: { 
                name: activeUnit.name, 
                team: activeUnit.team, 
                element: activeUnit.element 
            },
            targets: actionResults,
            teamStatus: {
                player: playerTeam.map(getUnitStatus),
                enemy: enemyTeam.map(getUnitStatus)
            }
        });
    }

    // 3.5 行动结束
    activeUnit.resetAV();
  }

  const playerWon = playerTeam.some(p => p.isAlive());
  combatLog.push({ type: 'end', text: playerWon ? '恭喜你，获得了胜利！' : '很遗憾，你失败了。' });

  return { playerWon, log: combatLog };
}

/**
 * 技能执行器
 */
function executeSkill(caster, skill, friendlyTeam, hostileTeam) {
    let targets = [];
    const results = [];

    // 1. 目标选择
    const aliveHostiles = hostileTeam.filter(u => u.isAlive());
    const aliveFriendlies = friendlyTeam.filter(u => u.isAlive());

    if (aliveHostiles.length === 0 && skill.type === 'damage') return []; // 敌全灭，无目标

    switch (skill.target) {
        case 'single_enemy':
            const t = selectTargetByTaunt(aliveHostiles);
            if (t) targets.push(t);
            break;
        case 'all_enemies':
            targets = aliveHostiles;
            break;
        case 'lowest_hp_ally':
            // 找血量百分比最低的
            targets = aliveFriendlies.sort((a, b) => (a.current_hp/a.max_hp) - (b.current_hp/b.max_hp)).slice(0, 1);
            break;
        case 'all_allies':
            targets = aliveFriendlies;
            break;
        default:
            // 默认单体
            const defT = selectTargetByTaunt(aliveHostiles);
            if (defT) targets.push(defT);
            break;
    }

    if (targets.length === 0) return [];

    // 2. 效果计算
    for (const target of targets) {
        // 计算基础数值 (基于攻击、防御或最大生命)
        let baseValue = 0;
        if (skill.value_type === 'def') baseValue = caster.defense * skill.value;
        else if (skill.value_type === 'max_hp') baseValue = caster.max_hp * skill.value;
        else baseValue = caster.attack * skill.value; // 默认 atk

        // 根据类型产生效果
        if (skill.type === 'damage') {
            const res = calculateDamage(caster, target, baseValue);
            results.push(res);
        } else if (skill.type === 'heal') {
            const healed = target.receiveHeal(Math.floor(baseValue));
            results.push({
                name: target.name, team: target.team, element: target.element,
                type: 'heal', value: healed, is_counter: false
            });
        } else if (skill.type === 'shield') {
            target.addShield(Math.floor(baseValue));
            results.push({
                name: target.name, team: target.team, element: target.element,
                type: 'shield', value: Math.floor(baseValue), is_counter: false
            });
        }
    }

    return results;
}

/**
 * 伤害计算逻辑 (复用之前的曲线公式)
 */
function calculateDamage(attacker, target, rawDamageInput) {
    let elementalBonus = 1.0;
    let isCounter = false;
    if (elementCounterMap[attacker.element] === target.element) {
        elementalBonus = COUNTER_BONUS;
        isCounter = true;
    }

    const DEF_CONSTANT = 280;
    let defenseMultiplier = DEF_CONSTANT / (DEF_CONSTANT + target.defense);
    let resistanceMultiplier = (1 - target.resistance);
    
    // 这里 rawDamageInput 已经包含了倍率 (例如 攻击力 * 2.5)
    let finalBaseDmg = rawDamageInput * defenseMultiplier * resistanceMultiplier;
    let finalDmg = Math.floor(finalBaseDmg * elementalBonus * (0.9 + Math.random() * 0.2)); 
    finalDmg = Math.max(1, finalDmg);

    target.takeDamage(finalDmg);

    return {
        name: target.name,
        team: target.team,
        element: target.element,
        type: 'damage',
        value: finalDmg,
        is_counter: isCounter
    };
}

function selectTargetByTaunt(aliveTargets) {
  if (aliveTargets.length === 0) return null;
  const totalTaunt = aliveTargets.reduce((sum, target) => sum + target.taunt, 0);
  let randomPoint = Math.random() * totalTaunt;
  for (const target of aliveTargets) {
    randomPoint -= target.taunt;
    if (randomPoint <= 0) return target;
  }
  return aliveTargets[aliveTargets.length - 1];
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
      shield: unit.shield,
      hp_percent: Math.max(0, Math.min(hp_percent, 100)),
      shield_percent: Math.min(shield_percent, 100),
      av: Math.floor(unit.current_av)
    };
};
