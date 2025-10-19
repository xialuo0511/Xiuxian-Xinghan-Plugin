import { Combatant } from './Combatant.js';
import { loadItemConfig } from '../../model/ConfigLoader.js';

const allMonsters = Object.values(loadItemConfig('monsters.yaml') || {});

/**
 * 战斗引擎
 */
export async function runCombat(playerSouls, enemyNames) {
  const combatLog = [];

  // --- 1. 初始化单位 ---
  const playerTeam = playerSouls.map((soul, i) => new Combatant(`player_${i + 1}`, soul, 'player'));
  const enemyTeam = enemyNames.map((name, i) => {
    const monsterData = allMonsters.find(m => m.name === name);
    return new Combatant(`enemy_${i + 1}`, monsterData, 'enemy');
  });
  const allCombatants = [...playerTeam,
    ...enemyTeam];

  combatLog.push({ type: 'start', text: '战斗开始！' });

  // --- 2. 核心战斗循环 ---
  let turn = 1;
  while (playerTeam.some(p => p.isAlive()) && enemyTeam.some(e => e.isAlive())) {
    if (turn > 50) {
      combatLog.push({ type: 'system', text: '战斗超过50回合，平局结束。' });
      break;
    }
    combatLog.push({ type: 'turn', text: `--- 第 ${turn} 回合 ---` });

    // a. 根据速度决定行动顺序
    const actionQueue = allCombatants
      .filter(c => c.isAlive())
      .sort((a, b) => b.speed - a.speed);

    // b. 依次行动
    for (const caster of actionQueue) {
      // 如果行动者在本回合中被击败，则跳过其行动
      if (!caster.isAlive()) continue;

      const targetTeam = (caster.team === 'player') ? enemyTeam : playerTeam;

      // c. 根据嘲讽值选择目标
      const target = selectTargetByTaunt(targetTeam);
      if (!target) continue; // 如果没有可选目标，跳过

      // d. 计算伤害并行动
      const damage = Math.max(1, Math.floor(caster.attack - target.defense * (1 - target.resistance)));
      target.takeDamage(damage);

      // e. 记录详细日志，包含所有单位的个体血量
      combatLog.push({
        type: 'action',
        caster: { name: caster.name, team: caster.team },
        target: { name: target.name, team: target.team },
        damage: damage,
        // 记录行动结束时，场上所有单位的状态
        teamStatus: {
          player: playerTeam.map(p => ({ name: p.name, hp: p.current_hp, max_hp: p.max_hp })),
          enemy: enemyTeam.map(e => ({ name: e.name, hp: e.current_hp, max_hp: e.max_hp }))
        }
      });

      // f. 检查目标队伍是否已被全灭，如果是，则提前结束本回合
      if (!targetTeam.some(t => t.isAlive())) {
        break;
      }
    }
    turn++;
  }

  // 3. 决定胜负
  const playerWon = playerTeam.some(p => p.isAlive());
  combatLog.push({ type: 'end', text: playerWon ? '恭喜你，获得了胜利！' : '很遗憾，你失败了。' });

  return { playerWon, log: combatLog };
}

/**
 * 根据嘲讽值选择目标的AI函数
 * @param {Array<Combatant>} targetTeam - 目标队伍
 * @returns {Combatant|null} - 选中的目标
 */
function selectTargetByTaunt(targetTeam) {
  const aliveTargets = targetTeam.filter(t => t.isAlive());
  if (aliveTargets.length === 0) return null;

  // 计算总嘲讽值
  const totalTaunt = aliveTargets.reduce((sum, target) => sum + target.taunt, 0);

  // 生成一个0到总嘲讽值之间的随机数
  let randomPoint = Math.random() * totalTaunt;

  // 轮盘赌算法，根据嘲讽值权重选择目标
  for (const target of aliveTargets) {
    randomPoint -= target.taunt;
    if (randomPoint <= 0) {
      return target;
    }
  }

  return aliveTargets[0]; // 保底返回第一个
}