import { applyElementalEffects } from './elemental_logic.js';

/**
 * 伤害计算函数
 * @param {number} atk 攻击力
 * @param {number} def 防御力
 * @returns {number}
 */
function Harm(atk, def) {
  if (def === undefined) def = 0;
  let x;
  let s = atk / def;
  let rand = Math.trunc(Math.random() * 11) / 100 + 0.95;
  if (s < 1) x = 0.1;
  else if (s > 2.5) x = 1;
  else x = 0.6 * s - 0.5;
  return Math.trunc(x * atk * rand);
}

/**
 * 暴击判断函数
 * @param {object} player 玩家对象
 * @returns {{isCrit: boolean, critMultiplier: number, message: string}}
 */
function checkCrit(player) {
  const critChance = player.暴击率 > 1 ? 1 : player.暴击率;
  if (Math.random() < critChance) {
    return {
      isCrit: true,
      critMultiplier: player.暴击伤害 || 1.5,
      message: '触发暴击, '
    };
  }
  return {
    isCrit: false,
    critMultiplier: 1,
    message: ''
  };
}

/**
 * 核心战斗引擎
 * @param {object} A_player 攻击方 (会被直接修改)
 * @param {object} B_player 防御方 (会被直接修改)
 * @returns {Promise<{msg: string[], A_win: boolean, A_player_final: object, B_player_final: object}>} 战斗结果
 */
export async function battleEngine(A_player, B_player) {
  let turn = 0;
  let messages = [];
  let statusEffects = {};

  while (A_player.当前血量 > 0 && B_player.当前血量 > 0) {
    if (turn >= 30) {
      messages.push('战斗超过15回合，平局！');
      break;
    }

    if (turn % 2 === 0) {
      messages.push(`\n==第${Math.floor(turn / 2) + 1}回合==`);
    }

    const attacker = turn % 2 === 0 ? A_player : B_player;
    const defender = turn % 2 === 0 ? B_player : A_player;

    if (statusEffects[attacker.id]?.['冻结'] > 0) {
      messages.push(`${attacker.名号} 被冻结了，本回合无法行动！`);
      statusEffects[attacker.id]['冻结']--;
      turn++;
      continue;
    }

    let damage = Harm(attacker.攻击, defender.防御);

    const critResult = checkCrit(attacker);
    let critMessage = critResult.message;

    if (attacker.仙宠?.type === '暴伤') {
      critResult.critMultiplier += attacker.仙宠.加成;
    }
    if (attacker.仙宠?.type === '战斗' && Math.random() < 0.8) {
      const petBonus = attacker.仙宠.加成;
      damage += Math.trunc(damage * petBonus);
      attacker.防御 += Math.trunc(attacker.防御 * petBonus);
      attacker.当前血量 = Math.min(attacker.血量上限, attacker.当前血量 + Math.trunc(attacker.当前血量 * petBonus));
      messages.push(`仙宠【${attacker.仙宠.name}】辅佐了【${attacker.名号}】，使其伤害、防御和血量得到了提升！`);
    }

    let battleContext = {
      attacker,
      defender,
      damage,
      messages,
      turn: Math.floor(turn / 2),
      statusEffects
    };

    const updatedContext = await applyElementalEffects(battleContext);

    let finalDamage = Math.trunc(updatedContext.damage * critResult.critMultiplier);
    defender.当前血量 -= finalDamage;
    if (defender.当前血量 < 0) defender.当前血量 = 0;

    messages = updatedContext.messages;
    messages.push(`${attacker.名号} 对 ${defender.名号} ${critMessage}造成了 ${finalDamage} 点伤害，${defender.名号} 剩余血量 ${defender.当前血量}`);

    turn++;
  }

  let A_win = false;
  if (A_player.当前血量 > 0 && B_player.当前血量 <= 0) {
    messages.push(`${A_player.名号}击败了${B_player.名号}`);
    A_win = true;
  } else if (B_player.当前血量 > 0 && A_player.当前血量 <= 0) {
    messages.push(`${B_player.名号}击败了${A_player.名号}`);
  }

  return {
    msg: messages,
    A_win: A_win,
    A_player_final: A_player,
    B_player_final: B_player
  };
}
