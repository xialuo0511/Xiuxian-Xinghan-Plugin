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
 * 类似于《崩坏：星穹铁道》
 */
export async function runCombat(playerSouls, enemyNames) {
  const combatLog = [];
  
  // 1. 初始化战斗单位
  const playerTeam = playerSouls.map((soul, i) => new Combatant(`player_${i + 1}`, soul, 'player'));
  const enemyTeam = enemyNames.map((name, i) => new Combatant(`enemy_${i + 1}`, allMonsters.find(m => m.name === name), 'enemy')).filter(Boolean);
  const allCombatants = [...playerTeam, ...enemyTeam];

  // 2. 初始化行动值 (AV)
  // 初始状态下，所有单位的 AV = 10000 / Speed
  allCombatants.forEach(c => c.resetAV());

  combatLog.push({ type: 'start', text: '战斗开始！' });
  
  let totalElapsedAV = 0; // 总流逝的行动值
  let actionCount = 0;    // 总行动次数
  let roundCount = 1;     // 回合数 (简单计数)

  combatLog.push({ type: 'turn', text: `--- 第 ${roundCount} 回合 ---` });

  // 3. 战斗循环
  while (playerTeam.some(p => p.isAlive()) && enemyTeam.some(e => e.isAlive())) {
    // 防止死循环
    if (actionCount > 300) {
      combatLog.push({ type: 'system', text: '战斗僵持过久，强制结束。' });
      break;
    }

    // 3.1 寻找当前 AV 最小的单位 (Next Actor)
    // 存活的单位中，current_av 最小的
    const aliveUnits = allCombatants.filter(c => c.isAlive());
    if (aliveUnits.length === 0) break; // 应该不会发生

    // 排序找到最小 AV
    aliveUnits.sort((a, b) => a.current_av - b.current_av);
    const activeUnit = aliveUnits[0];
    const elapsedAV = activeUnit.current_av; // 这一轮流逝的时间

    // 3.2 时间流逝：所有单位减去 elapsedAV
    // 注意：死人不需要跑条，但如果复活机制存在，可能需要考虑。目前假设死人不跑条。
    aliveUnits.forEach(unit => {
      unit.current_av -= elapsedAV;
      // 修正浮点数误差，虽然 JS 数字较大时还好，但以防万一
      if (unit.current_av < 0.0001) unit.current_av = 0;
    });

    totalElapsedAV += elapsedAV;
    
    // 3.3 行动逻辑
    actionCount++;

    // 简单的“回合”显示：每行动 10 次算一轮 (仅展示用)
    if (actionCount % 10 === 0) {
      roundCount++;
      combatLog.push({ type: 'turn', text: `--- 第 ${roundCount} 回合 ---` });
    }

    const targetTeam = (activeUnit.team === 'player') ? enemyTeam : playerTeam;
    const target = selectTargetByTaunt(targetTeam);

    if (target) {
        // 计算伤害
        let elementalBonus = 1.0;
        let isCounter = false;
        if (elementCounterMap[activeUnit.element] === target.element) {
            elementalBonus = COUNTER_BONUS;
            isCounter = true;
        }

        // 基础伤害公式 (简化版)
        // 伤害 = (攻击 - 防御 * (1-穿透)) * 增伤 * 随机浮动
        // 这里暂时沿用之前的逻辑，但加上元素克制
        let def = target.defense * (1 - target.resistance); 
        if (def < 0) def = 0;
        
        let baseDmg = Math.max(1, activeUnit.attack - def);
        let finalDmg = Math.floor(baseDmg * elementalBonus * (0.9 + Math.random() * 0.2)); // 0.9~1.1 浮动

        target.takeDamage(finalDmg);

        // 3.4 记录日志
        combatLog.push({
            type: 'action',
            av_cost: Math.floor(elapsedAV), // 消耗的时间
            caster: { name: activeUnit.name, team: activeUnit.team, element: activeUnit.element },
            target: { name: target.name, team: target.team, element: target.element },
            damage: finalDmg,
            is_counter: isCounter,
            teamStatus: {
                player: playerTeam.map(getUnitStatus),
                enemy: enemyTeam.map(getUnitStatus)
            }
        });
    }

    // 3.5 行动结束，重置该单位的 AV
    // 如果有“拉条”或“推条”技能，会在 action 中修改 AV，但这里是行动后重置
    activeUnit.resetAV();
  }

  const playerWon = playerTeam.some(p => p.isAlive());
  combatLog.push({ type: 'end', text: playerWon ? '恭喜你，获得了胜利！' : '很遗憾，你失败了。' });

  return { playerWon, log: combatLog };
}

/**
 * 嘲讽目标选择系统
 */
function selectTargetByTaunt(targetTeam) {
  const aliveTargets = targetTeam.filter(t => t.isAlive());
  if (aliveTargets.length === 0) return null;
  
  const totalTaunt = aliveTargets.reduce((sum, target) => sum + target.taunt, 0);
  let randomPoint = Math.random() * totalTaunt;
  
  for (const target of aliveTargets) {
    randomPoint -= target.taunt;
    if (randomPoint <= 0) {
      return target;
    }
  }
  return aliveTargets[aliveTargets.length - 1];
}

/**
 * 获取单位状态用于日志显示
 */
const getUnitStatus = (unit) => {
    const max_hp = unit.max_hp > 0 ? unit.max_hp : 1;
    const current_hp = unit.current_hp || 0;

    let hp_percent = (current_hp / max_hp) * 100;
    hp_percent = Math.max(0, Math.min(hp_percent, 100));

    return {
      name: unit.name,
      hp: current_hp,
      max_hp: unit.max_hp,
      hp_percent: hp_percent,
      av: Math.floor(unit.current_av) // 在日志中显示下一次行动所需的 AV
    };
};
