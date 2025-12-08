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
 * v2.0: 支持多目标、多类型效果（伤害/治疗/护盾）的日志结构
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
      // TODO: 这里可以处理 Buff 的持续时间/跳伤害
    });

    totalElapsedAV += elapsedAV;
    actionCount++;

    if (actionCount % 10 === 0) {
      roundCount++;
      combatLog.push({ type: 'turn', text: `--- 第 ${roundCount} 回合 ---` });
    }

    // --- 行动逻辑开始 ---
    // 目前默认为普通攻击，未来可以在这里扩展 AI 逻辑选择技能
    const targetTeam = (activeUnit.team === 'player') ? enemyTeam : playerTeam;
    // 目标选择目前仍为单体，但我们把它封装成数组，为未来群攻做准备
    const primaryTarget = selectTargetByTaunt(targetTeam);

    const actionResults = []; // 存储所有受击者的结果
    const skillName = "普通攻击";

    if (primaryTarget) {
        // 计算伤害 (单体)
        // 这是一个标准的攻击 Action
        const result = calculateAttack(activeUnit, primaryTarget);
        actionResults.push(result);
    }

    // 3.4 记录日志 (新结构)
    combatLog.push({
        type: 'action',
        av_cost: Math.floor(elapsedAV),
        skill: skillName, // 记录技能名
        caster: { 
            name: activeUnit.name, 
            team: activeUnit.team, 
            element: activeUnit.element 
        },
        // 关键变更：targets 是一个数组，包含所有受影响的单位
        targets: actionResults,
        teamStatus: {
            player: playerTeam.map(getUnitStatus),
            enemy: enemyTeam.map(getUnitStatus)
        }
    });

    // 3.5 行动结束
    activeUnit.resetAV();
  }

  const playerWon = playerTeam.some(p => p.isAlive());
  combatLog.push({ type: 'end', text: playerWon ? '恭喜你，获得了胜利！' : '很遗憾，你失败了。' });

  return { playerWon, log: combatLog };
}

/**
 * 封装攻击计算逻辑
 */
function calculateAttack(attacker, target) {
    let elementalBonus = 1.0;
    let isCounter = false;
    if (elementCounterMap[attacker.element] === target.element) {
        elementalBonus = COUNTER_BONUS;
        isCounter = true;
    }

    const DEF_CONSTANT = 280;
    let defenseMultiplier = DEF_CONSTANT / (DEF_CONSTANT + target.defense);
    let resistanceMultiplier = (1 - target.resistance);
    
    let baseDmg = attacker.attack * defenseMultiplier * resistanceMultiplier;
    let finalDmg = Math.floor(baseDmg * elementalBonus * (0.9 + Math.random() * 0.2)); 
    finalDmg = Math.max(1, finalDmg);

    // 实际扣血
    target.takeDamage(finalDmg);

    // 返回标准化的结果对象
    return {
        name: target.name,
        team: target.team,
        element: target.element,
        type: 'damage', // 类型：伤害
        value: finalDmg, // 数值
        is_counter: isCounter, // 是否克制
        is_crit: false // 预留暴击字段
    };
}

function selectTargetByTaunt(targetTeam) {
  const aliveTargets = targetTeam.filter(t => t.isAlive());
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
    
    // 计算护盾比例 (相对于最大血量，用于UI显示)
    let shield_percent = (unit.shield / max_hp) * 100;

    return {
      name: unit.name,
      hp: current_hp,
      max_hp: unit.max_hp,
      shield: unit.shield,
      hp_percent: Math.max(0, Math.min(hp_percent, 100)),
      shield_percent: Math.min(shield_percent, 100), // 护盾条限制
      av: Math.floor(unit.current_av)
    };
};