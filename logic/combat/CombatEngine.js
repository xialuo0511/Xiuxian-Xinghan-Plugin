import { Combatant } from './Combatant.js';
import { loadItemConfig } from '../../model/ConfigLoader.js';

const allMonsters = Object.values(loadItemConfig('monsters.yaml') || {});
const ACTION_THRESHOLD = 1000;

export async function runCombat(playerSouls, enemyNames) {
  const combatLog = [];
  const playerTeam = playerSouls.map((soul, i) => new Combatant(`player_${i + 1}`, soul, 'player'));
  const enemyTeam = enemyNames.map((name, i) => new Combatant(`enemy_${i + 1}`, allMonsters.find(m => m.name === name), 'enemy')).filter(Boolean);
  const allCombatants = [...playerTeam,
    ...enemyTeam];

  combatLog.push({ type: 'start', text: '战斗开始！' });

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

    const targetTeam = (caster.team === 'player') ? enemyTeam : playerTeam;
    const target = selectTargetByTaunt(targetTeam);
    if (!target) continue;

    const damage = Math.max(1, Math.floor(caster.attack - target.defense * (1 - target.resistance)));
    target.takeDamage(damage);

    const getUnitStatus = (unit) => ({
      name: unit.name,
      hp: unit.current_hp,
      max_hp: unit.max_hp,
      hp_percent: (unit.max_hp > 0 ? (unit.current_hp / unit.max_hp) * 100 : 0) // 在后端计算
    });

    combatLog.push({
      type: 'action',
      caster: { name: caster.name, team: caster.team },
      target: { name: target.name, team: target.team },
      damage: damage,
      teamStatus: {
        player: playerTeam.map(getUnitStatus),
        enemy: enemyTeam.map(getUnitStatus)
      }
    });
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