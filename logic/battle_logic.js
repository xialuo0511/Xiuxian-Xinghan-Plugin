import { applyElementalEffects } from './elemental_logic.js';

/**
 * 玩家PVP战斗引擎 (v2.0)
 * 特性：
 * 1. 行动值 (AV) 跑条机制，支持多对多扩展。
 * 2. 曲线伤害公式：Damage = Atk * (Atk / (Atk + Def)) * (1 + 增伤)。
 * 3. 兼容现有的灵根、武器特效逻辑。
 */
export async function battleEngine(TeamA_Input, TeamB_Input, maxTurns = 50) {
  // 1. 初始化战斗单位
  const teamA = Array.isArray(TeamA_Input) ? TeamA_Input : [TeamA_Input];
  const teamB = Array.isArray(TeamB_Input) ? TeamB_Input : [TeamB_Input];

  const combatants = [
    ...teamA.map(p => createCombatant(p, 'A')),
    ...teamB.map(p => createCombatant(p, 'B'))
  ];

  const messages = []; // 兼容旧版日志（纯文本）
  const detailedLog = []; // 新版结构化日志

  let turnCount = 0;

  // 初始AV
  combatants.forEach(c => c.resetAV());

  messages.push(`战斗开始！`);
  detailedLog.push({ type: 'start', text: '战斗开始！' });

  let winner = null;

  while (turnCount < maxTurns) {
    // 检查存活
    const teamAAlive = combatants.some(c => c.team === 'A' && c.current_hp > 0);
    const teamBAlive = combatants.some(c => c.team === 'B' && c.current_hp > 0);

    if (!teamAAlive) { winner = 'B'; break; }
    if (!teamBAlive) { winner = 'A'; break; }

    // 寻找行动者 (AV最小)
    const aliveUnits = combatants.filter(c => c.current_hp > 0);
    aliveUnits.sort((a, b) => a.current_av - b.current_av);
    const activeUnit = aliveUnits[0];
    
    // 时间流逝
    const elapsedAV = activeUnit.current_av;
    aliveUnits.forEach(u => u.current_av -= elapsedAV);
    
    // 行动
    // 简单AI：攻击对面存活的第一个人（未来可扩展）
    const targets = combatants.filter(c => c.team !== activeUnit.team && c.current_hp > 0);
    if (targets.length > 0) {
        // 简单随机或打第一个
        const target = targets[0]; 
        
        // 执行攻击逻辑
        const result = await executeAttack(activeUnit, target, turnCount);
        
        // 记录日志
        messages.push(...result.msgs);
        
        detailedLog.push({
            type: 'action',
            av_cost: Math.floor(elapsedAV),
            skill: '普通攻击', 
            caster: { 
                name: activeUnit.source.名号, 
                team: activeUnit.team === 'A' ? 'player' : 'enemy', 
                element: activeUnit.element,
                level: activeUnit.source.level_id || 0,
                id: activeUnit.source.id
            },
            targets: [{
                name: target.source.名号,
                element: target.element,
                type: 'damage', 
                value: result.damage,
                value_display: formatNumber(result.damage), 
                is_counter: false, 
                is_crit: result.isCrit
            }],
            details: result.msgs, 
            teamStatus: {
                player: combatants.filter(c => c.team === 'A').map(getUnitStatus),
                enemy: combatants.filter(c => c.team === 'B').map(getUnitStatus)
            }
        });
    }

    activeUnit.resetAV();
    turnCount++;
  }
  
  // 战斗结束
  if (winner === 'A') messages.push(`发起方获胜！`);
  else if (winner === 'B') messages.push(`迎战方获胜！`);
  else messages.push(`双方平手！`);

  // 同步状态
  teamA.forEach(p => syncBackToPlayer(p, combatants.find(c => c.id === p.id)));
  teamB.forEach(p => syncBackToPlayer(p, combatants.find(c => c.id === p.id)));

  return {
    msg: messages, 
    log: detailedLog, 
    A_win: winner === 'A',
    A_player_final: teamA[0],
    B_player_final: teamB[0],
    TeamA_final: teamA,
    TeamB_final: teamB
  };
}

/**
 * 创建战斗单位包装器
 */
function createCombatant(player, team) {
  return {
    id: player.id,
    team: team,
    source: player, // 持有原始引用
    max_hp: player.血量上限,
    current_hp: player.当前血量,
    attack: player.攻击,
    defense: player.防御,
    speed: 100, // 默认速度
    element: parseElement(player.灵根?.name),

    // 战斗属性
    current_av: 0,
    buffs: [],
    shield: 0,

    resetAV() {
      this.current_av = 10000 / this.speed;
    }
  };
}

function parseElement(name) {
  if (!name) return '无';
  const match = name.match(/[金木水火土]/);
  return match ? match[0] : '无';
}

function syncBackToPlayer(player, combatant) {
  if (combatant) {
    player.当前血量 = combatant.current_hp;
  }
}

/**
 * 执行一次攻击
 */
async function executeAttack(attacker, defender, turn) {
  const msgs = [];

  // 1. 基础伤害计算 (曲线公式)
  const atk = attacker.attack;
  const def = defender.defense;

  let damageRatio = atk / (atk + def * 1.5);
  // 保底 5%
  if (damageRatio < 0.05) damageRatio = 0.05;

  let damage = Math.floor(atk * damageRatio);

  // 2. 暴击计算 (保留原有逻辑)
  let isCrit = false;
  if (Math.random() < (attacker.source.暴击率 || 0)) {
    isCrit = true;
    damage = Math.floor(damage * (attacker.source.暴击伤害 || 1.5));
    msgs.push(`触发暴击！`);
  }

  // 3. 构建 Context 供 elemental_logic 使用
  // 注意：elemental_logic 期望的是 player 对象，且直接修改 messages 和 damage
  // 我们需要做一个适配层
  const context = {
    attacker: attacker.source, // 传入原始对象
    defender: defender.source,
    damage: damage,
    messages: [],
    turn: turn,
    statusEffects: {} // 暂未完全实现状态机，先给个空的防止报错
  };

  // 调用旧的特效逻辑
  const updatedContext = await applyElementalEffects(context);

  damage = Math.floor(updatedContext.damage);
  msgs.push(...updatedContext.messages);

  // 4. 结算
  damage = Math.max(1, damage);
  defender.current_hp = Math.max(0, defender.current_hp - damage);


      return {
          damage: damage,
          msgs: msgs,
          isCrit: isCrit
      };
  }
const getUnitStatus = (unit) => {
  return {
    name: unit.source.名号,
    hp: unit.current_hp,
    max_hp: unit.max_hp,
    hp_display: formatNumber(unit.current_hp),
    max_hp_display: formatNumber(unit.max_hp),
    hp_percent: (unit.current_hp / unit.max_hp * 100).toFixed(0),
    shield_percent: 0, // 暂无护盾逻辑
    id: unit.id
  };
};

function formatNumber(num) {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  return Math.floor(num).toString();
}