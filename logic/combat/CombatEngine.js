import { Combatant } from './Combatant.js';
import { loadItemConfig } from '../../model/ConfigLoader.js';

const allMonsters = Object.values(loadItemConfig('monsters.yaml') || {});

/**
 * 战斗引擎，日志中包含血量信息
 * @param {Array<object>} playerSouls - 玩家的星魂数组
 * @param {Array<string>} enemyNames - 怪物名称数组
 * @returns {Promise<object>}
 */
export async function runCombat(playerSouls, enemyNames) {
  const combatLog = [];

  const playerTeam = playerSouls.map((soul, i) => new Combatant(`player_${i + 1}`, soul, 'player'));
  const enemyTeam = enemyNames.map((name, i) => {
    const monsterData = allMonsters.find(m => m.name === name);
    return new Combatant(`enemy_${i + 1}`, monsterData, 'enemy');
  });

  // 【新增】辅助函数，用于获取并格式化队伍的总血量状态
  const getTeamHpStatus = (team) => {
    const current = team.reduce((sum, unit) => sum + unit.current_hp, 0);
    const max = team.reduce((sum, unit) => sum + unit.max_hp, 0);
    return `${current} / ${max}`;
  };

  combatLog.push({ type: 'start', text: '战斗开始！' });

  let turn = 1;
  while (playerTeam.some(p => p.isAlive()) && enemyTeam.some(e => e.isAlive())) {
    if (turn > 50) {
      combatLog.push({ type: 'system', text: '战斗超过50回合，平局结束。' });
      break;
    }
    combatLog.push({ type: 'turn', text: `--- 第 ${turn} 回合 ---` });

    const activePlayer = playerTeam.find(p => p.isAlive());
    const activeEnemy = enemyTeam.find(e => e.isAlive());

    // 玩家回合
    if (activePlayer) {
      const target = enemyTeam.find(e => e.isAlive());
      const damage = Math.max(1, Math.floor(activePlayer.attack - target.defense * (1 - target.resistance)));
      target.takeDamage(damage);
      // 【核心修改】在日志中加入双方血量
      combatLog.push({
        type: 'action',
        caster: { name: activePlayer.name, team: 'player' },
        target: { name: target.name, team: 'enemy' },
        damage: damage,
        playerTeamHp: getTeamHpStatus(playerTeam),
        enemyTeamHp: getTeamHpStatus(enemyTeam)
      });
    }

    // 敌人回合 (如果玩家攻击后，敌人仍然存活)
    if (enemyTeam.some(e => e.isAlive()) && activeEnemy) {
      const target = playerTeam.find(p => p.isAlive());
      const damage = Math.max(1, Math.floor(activeEnemy.attack - target.defense * (1 - target.resistance)));
      target.takeDamage(damage);
      // 【核心修改】在日志中加入双方血量
      combatLog.push({
        type: 'action',
        caster: { name: activeEnemy.name, team: 'enemy' },
        target: { name: target.name, team: 'player' },
        damage: damage,
        playerTeamHp: getTeamHpStatus(playerTeam),
        enemyTeamHp: getTeamHpStatus(enemyTeam)
      });
    }
    turn++;
  }

  const playerWon = playerTeam.some(p => p.isAlive());
  combatLog.push({ type: 'end', text: playerWon ? '恭喜你，获得了胜利！' : '很遗憾，你失败了。' });

  return {
    playerWon,
    log: combatLog
  };
}