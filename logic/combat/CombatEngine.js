import { Combatant } from './Combatant.js';
import { loadItemConfig } from '../../model/ConfigLoader.js';

const allMonsters = Object.values(loadItemConfig('monsters.yaml') || {});

/**
 * A basic turn-based combat engine.
 * @param {Array<object>} playerSouls - Array of star soul objects equipped by the player.
 * @param {Array<string>} enemyNames - Array of monster names to fight.
 * @returns {Promise<object>} - An object containing the result and the structured log.
 */
export async function runCombat(playerSouls, enemyNames) {
  const combatLog = []; // This will store our structured log

  // 1. Initialize Teams
  const playerTeam = playerSouls.map((soul, i) => new Combatant(`player_${i + 1}`, soul, 'player'));
  const enemyTeam = enemyNames.map((name, i) => {
    const monsterData = allMonsters.find(m => m.name === name);
    return new Combatant(`enemy_${i + 1}`, monsterData, 'enemy');
  });

  combatLog.push({ type: 'start', text: '战斗开始！' });

  // 2. Main Combat Loop (Simplified for now)
  let turn = 1;
  while (playerTeam.some(p => p.isAlive()) && enemyTeam.some(e => e.isAlive())) {
    if (turn > 50) { // Safety break
      combatLog.push({ type: 'system', text: '战斗超过50回合，平局结束。' });
      break;
    }
    combatLog.push({ type: 'turn', text: `--- 第 ${turn} 回合 ---` });

    // For now, simple turn order: one player attacks, one enemy attacks.
    const activePlayer = playerTeam.find(p => p.isAlive());
    const activeEnemy = enemyTeam.find(e => e.isAlive());

    // Player's turn
    if (activePlayer) {
      const target = enemyTeam.find(e => e.isAlive()); // Simple targeting for now
      const damage = Math.max(1, Math.floor(activePlayer.attack - target.defense * (1 - target.resistance)));
      target.takeDamage(damage);
      combatLog.push({
        type: 'action',
        caster: { name: activePlayer.name, team: 'player' },
        target: { name: target.name, team: 'enemy' },
        damage: damage
      });
    }

    // Enemy's turn
    if (activeEnemy) {
      const target = playerTeam.find(p => p.isAlive()); // Simple targeting
      const damage = Math.max(1, Math.floor(activeEnemy.attack - target.defense * (1 - target.resistance)));
      target.takeDamage(damage);
      combatLog.push({
        type: 'action',
        caster: { name: activeEnemy.name, team: 'enemy' },
        target: { name: target.name, team: 'player' },
        damage: damage
      });
    }
    turn++;
  }

  // 3. Determine Winner
  const playerWon = playerTeam.some(p => p.isAlive());
  combatLog.push({ type: 'end', text: playerWon ? '恭喜你，获得了胜利！' : '很遗憾，你失败了。' });

  return {
    playerWon,
    log: combatLog
  };
}