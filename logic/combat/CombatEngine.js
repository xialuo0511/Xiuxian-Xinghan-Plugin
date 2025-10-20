import { Combatant } from './Combatant.js';
import { loadItemConfig } from '../../model/ConfigLoader.js';

const allMonsters = Object.values(loadItemConfig('monsters.yaml') || {});
const ACTION_THRESHOLD = 1000;

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
 * 战斗引擎
 */
export async function runCombat(playerSouls, enemyNames) {
  const combatLog = [];
  const playerTeam = playerSouls.map((soul, i) => new Combatant(`player_${i + 1}`, soul, 'player'));
  const enemyTeam = enemyNames.map((name, i) => new Combatant(`enemy_${i + 1}`, allMonsters.find(m => m.name === name), 'enemy')).filter(Boolean);
  const allCombatants = [...playerTeam,
    ...enemyTeam];

  // 【核心修改】引入回合制计数器
  let turn = 1;
  let actionCountInTurn = 0;
  const initialCombatantCount = allCombatants.length;

  combatLog.push({ type: 'start', text: '战斗开始！' });
  combatLog.push({ type: 'turn', text: `--- 第 ${turn} 回合 ---` });

  let cycle = 0;
  while (playerTeam.some(p => p.isAlive()) && enemyTeam.some(e => e.isAlive())) {
    if (cycle++ > 200) {
      combatLog.push({ type: 'system', text: '战斗异常，强制结束。' });
      break;
    }

    let caster = null;
    while (!caster) {
      for (const combatant of allCombatants) {
        if (combatant.isAlive()) {
          combatant.actionPoints += combatant.speed;
        }
      }
      const readyUnits = allCombatants.filter(c => c.isAlive() && c.actionPoints >= ACTION_THRESHOLD);
      if (readyUnits.length > 0) {
        caster = readyUnits.sort((a, b) => b.actionPoints - a.actionPoints)[0];
      }
    }
    caster.actionPoints -= ACTION_THRESHOLD;
    actionCountInTurn++; // 每次行动，计数器+1

    const targetTeam = (caster.team === 'player') ? enemyTeam : playerTeam;
    const target = selectTargetByTaunt(targetTeam);
    if (!target) continue;

    let elementalBonus = 1.0;
    let isCounter = false;
    if (elementCounterMap[caster.element] === target.element) {
      elementalBonus = COUNTER_BONUS;
      isCounter = true;
    }

    const damage = Math.max(1, Math.floor(caster.attack - target.defense * (1 - target.resistance)));
    target.takeDamage(damage);

    const getUnitStatus = (unit) => {
      const max_hp = unit.max_hp > 0 ? unit.max_hp : 1;
      const current_hp = unit.current_hp || 0;

      let hp_percent = (current_hp / max_hp) * 100;
      hp_percent = Math.max(0, Math.min(hp_percent, 100));

      return {
        name: unit.name,
        hp: current_hp,
        max_hp: unit.max_hp,
        hp_percent: hp_percent
      };
    };

    combatLog.push({
      type: 'action',
      caster: { name: caster.name, team: caster.team },
      target: { name: target.name, team: target.team },
      damage: damage,
      is_counter: isCounter,
      teamStatus: {
        player: playerTeam.map(getUnitStatus),
        enemy: enemyTeam.map(getUnitStatus)
      }
    });

    if (actionCountInTurn >= initialCombatantCount) {
      actionCountInTurn = 0; // 重置回合内行动计数
      turn++;
      // 只有在战斗还未结束时才显示下一回合
      if (playerTeam.some(p => p.isAlive()) && enemyTeam.some(e => e.isAlive())) {
        combatLog.push({ type: 'turn', text: `--- 第 ${turn} 回合 ---` });
      }
    }
  }

  const playerWon = playerTeam.some(p => p.isAlive());
  combatLog.push({ type: 'end', text: playerWon ? '恭喜你，获得了胜利！' : '很遗憾，你失败了。' });

  return { playerWon, log: combatLog };
}

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
  return aliveTargets[0];
}