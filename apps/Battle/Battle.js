//插件加载
import plugin from '../../../../lib/plugins/plugin.js';
import config from '../../model/Config.js';
import data from '../../model/XiuxianData.js';

import {
  existplayer,
  exist_najie_thing,
  ForwardMsg,
  isNotNull,
  Write_player,
  Gaodenyuansulun, ifbaoji, Harm
} from '../Xiuxian/xiuxian.js';
import { Read_player } from '../Xiuxian/xiuxian.js';
import {
  Add_najie_thing,
  Add_灵石,
  Add_HP,
  Add_血气
} from '../Xiuxian/xiuxian.js';
import { get_random_talent } from '../Xiuxian/xiuxian.js';
import { Gulid } from '../../api/api.js';
import * as DAL from '../../api/data-access.js';

//如需截图必须引入以下两库
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';
import { baojishanghai } from './WDT.js';

/**
 * 战斗类
 */

export class Battle extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_Battle',
      dsc: '修仙模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^打劫$',
          fnc: 'Dajie'
        },
        {
          reg: '^(以武会友)$',
          fnc: 'biwu'
        },
        {
          reg: '#攻击木桩$',
          fnc: 'muzhuang'
        }
      ]
    });
    this.set = config.getConfig('xiuxian', 'xiuxian');
    this.xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');
  }

  //打劫
  async Dajie(e) {
    try {
      // 基础验证
      const basicValidation = await this.validateBasicRobConditions(e);
      if (!basicValidation.success) {
        e.reply(basicValidation.message);
        return;
      }

      const { attackerId, defenderId } = basicValidation.data;

      // 时间窗口验证
      const timeValidation = this.validateRobTimeWindow();
      if (!timeValidation.success) {
        e.reply(timeValidation.message);
        return;
      }

      // 玩家状态验证
      const playerValidation = await this.validateRobPlayerStates(attackerId, defenderId);
      if (!playerValidation.success) {
        e.reply(playerValidation.message);
        return;
      }

      // CD检查
      const cdValidation = await this.validateRobCooldown(attackerId);
      if (!cdValidation.success) {
        e.reply(cdValidation.message);
        return;
      }

      // 执行打劫战斗
      const battleResult = await this.executeRobBattle(attackerId, defenderId, playerValidation.data);

      // 处理战斗结果
      await this.handleRobResult(e, battleResult);

    } catch (error) {
      console.error('打劫功能执行错误:', error);
      e.reply('打劫过程中发生错误，请稍后再试');
    }
  }

  // 基础条件验证
  async validateBasicRobConditions(e) {
    // 群聊检查
    if (!e.isGroup) {
      return { success: false, message: '修仙游戏请在群聊中游玩' };
    }

    const attackerId = e.user_id;

    // 检查攻击者存档
    const attackerExists = await existplayer(attackerId);
    if (!attackerExists) {
      return { success: false, message: '你还未踏入修仙之路，请先开始修仙！' };
    }

    // 检查是否@了用户
    const atItem = e.message.find(item => item.type === 'at');
    if (!atItem) {
      return { success: false, message: '请@要打劫的目标' };
    }

    const defenderId = atItem.qq;

    // 检查被攻击者存档
    const defenderExists = await existplayer(defenderId);
    if (!defenderExists) {
      return { success: false, message: '不可对凡人出手!' };
    }

    // 检查是否自己攻击自己
    if (attackerId === defenderId) {
      return { success: false, message: '咋的，自己弄自己啊？' };
    }

    return {
      success: true,
      data: { attackerId, defenderId }
    };
  }

  // 时间窗口验证
  validateRobTimeWindow() {
    const now = new Date();
    const { openHour, closeHour } = this.set.Auction;
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    const openTime = todayStart + openHour * 3600000;
    const closeTime = todayStart + closeHour * 3600000;
    const currentTime = now.getTime();

    if (currentTime >= openTime && currentTime <= closeTime) {
      return {
        success: false,
        message: '这个时间由星阁阁主看管,还是不要张扬较好'
      };
    }

    return { success: true };
  }

  // 玩家状态验证
  async validateRobPlayerStates(attackerId, defenderId) {
    try {
      // 并行读取玩家数据
      const [attackerData, defenderData] = await Promise.all([
        Read_player(attackerId),
        Read_player(defenderId)
      ]);

      // 验证攻击者状态
      const attackerValidation = await this.validateAttackerState(attackerId, attackerData);
      if (!attackerValidation.success) {
        return attackerValidation;
      }

      // 验证被攻击者状态
      const defenderValidation = await this.validateDefenderState(defenderId, defenderData);
      if (!defenderValidation.success) {
        return defenderValidation;
      }

      // 验证境界差距
      const levelValidation = this.validateLevelDifference(attackerData, defenderData);
      if (!levelValidation.success) {
        return levelValidation;
      }

      // 验证宗门关系
      const guildValidation = this.validateGuildRelation(attackerId, defenderId);
      if (!guildValidation.success) {
        return guildValidation;
      }

      return {
        success: true,
        data: {
          attacker: attackerData,
          defender: defenderData,
          isBusy: defenderValidation.isBusy
        }
      };
    } catch (error) {
      console.error('玩家状态验证错误:', error);
      return { success: false, message: '玩家状态验证失败' };
    }
  }

  // 攻击者状态验证
  async validateAttackerState(attackerId, attackerData) {
    // 检查修为
    if (attackerData.修为 < 0) {
      return { success: false, message: '还是闭会关再打劫吧' };
    }

    // 检查游戏状态
    const gameState = await redis.get(`xiuxian:player:${attackerId}:last_game_time`);
    if (gameState == 0) {
      return { success: false, message: '猜大小正在进行哦!' };
    }

    // 检查行动状态
    const actionState = await this.getPlayerAction(attackerId);
    if (actionState) {
      const remainingTime = actionState.end_time - Date.now();
      const minutes = Math.floor(remainingTime / 60000);
      const seconds = Math.floor((remainingTime % 60000) / 1000);
      return {
        success: false,
        message: `正在${actionState.action}中,剩余时间:${minutes}分${seconds}秒`
      };
    }

    return { success: true };
  }

  // 被攻击者状态验证
  async validateDefenderState(defenderId, defenderData) {
    // 检查血量
    if (defenderData.当前血量 < 20000) {
      return {
        success: false,
        message: `${defenderData.名号} 重伤未愈,就不要再打他了`
      };
    }

    // 检查灵石
    if (defenderData.灵石 < 30002) {
      return {
        success: false,
        message: `${defenderData.名号} 穷得快赶上水脚脚了,就不要再打他了`
      };
    }

    // 检查游戏状态
    const gameState = await redis.get(`xiuxian:player:${defenderId}:last_game_time`);
    if (gameState == 0) {
      return {
        success: false,
        message: '对方猜大小正在进行哦，等他赚够了再打劫也不迟!'
      };
    }

    // 检查行动状态
    const actionState = await this.getPlayerAction(defenderId);
    let isBusy = false;

    if (actionState) {
      isBusy = true;
      // 检查攻击者是否有隐身水
      const hasInvisibilityPotion = await exist_najie_thing(attackerId, '隐身水', '道具');
      if (!hasInvisibilityPotion) {
        const remainingTime = actionState.end_time - Date.now();
        const minutes = Math.floor(remainingTime / 60000);
        const seconds = Math.floor((remainingTime % 60000) / 1000);
        return {
          success: false,
          message: `对方正在${actionState.action}中,剩余时间:${minutes}分${seconds}秒`
        };
      }
    }

    return { success: true, isBusy };
  }

  // 境界差距验证
  validateLevelDifference(attackerData, defenderData) {
    const attackerLevel = data.Level_list.find(item => item.level_id == attackerData.level_id)?.level_id;
    const defenderLevel = data.Level_list.find(item => item.level_id == defenderData.level_id)?.level_id;

    if (!defenderLevel) {
      return { success: false, message: '对方为错误存档！' };
    }

    // 仙人不可对凡人出手
    if (attackerLevel > 41 && defenderLevel <= 41) {
      return { success: false, message: '仙人不可对凡人出手！' };
    }

    // 修仙者不可欺负弱小
    if (attackerLevel >= 12 && defenderLevel < 12) {
      return { success: false, message: '不可欺负弱小！' };
    }

    return { success: true };
  }

  // 宗门关系验证
  validateGuildRelation(attackerId, defenderId) {
    const attackerData = data.getData('player', attackerId);
    const defenderData = data.getData('player', defenderId);

    if (isNotNull(attackerData.宗门) && isNotNull(defenderData.宗门)) {
      const attackerGuild = data.getAssociation(attackerData.宗门.宗门名称);
      const defenderGuild = data.getAssociation(defenderData.宗门.宗门名称);

      if (attackerGuild.宗门名称 === defenderGuild.宗门名称) {
        return { success: false, message: '门派禁止内讧' };
      }
    }

    return { success: true };
  }

  // CD验证
  async validateRobCooldown(attackerId) {
    const now = Date.now();
    const lastRobTime = parseInt(await redis.get(`xiuxian:player:${attackerId}:last_dajie_time`) || 0);
    const robCooldown = this.xiuxianConfigData.CD.rob * 60000;

    if (now < lastRobTime + robCooldown) {
      const remainingTime = lastRobTime + robCooldown - now;
      const minutes = Math.floor(remainingTime / 60000);
      const seconds = Math.floor((remainingTime % 60000) / 1000);

      return {
        success: false,
        message: `打劫正在CD中，剩余cd: ${minutes}分${seconds}秒`
      };
    }

    return { success: true };
  }

  // 获取玩家行动状态
  async getPlayerAction(playerId) {
    try {
      const actionData = await redis.get(`xiuxian:player:${playerId}:action`);
      if (!actionData) return null;

      const action = JSON.parse(actionData);
      if (Date.now() > action.end_time) return null;

      return action;
    } catch (error) {
      console.error('获取玩家行动状态错误:', error);
      return null;
    }
  }

  // 执行打劫战斗
  async executeRobBattle(attackerId, defenderId, playerData) {
    try {
      const { attacker, defender, isBusy } = playerData;

      // 记录打劫时间
      await redis.set(`xiuxian:player:${attackerId}:last_dajie_time`, Date.now());

      // 检查替身人偶
      if (await this.checkSubstituteItem(defender, defenderId)) {
        return {
          type: 'substitute',
          message: `${defender.名号}使用了道具替身人偶,躲过了此次打劫`
        };
      }

      // 处理隐身水消耗
      if (isBusy) {
        await Add_najie_thing(attackerId, '隐身水', '道具', -1);
      }

      // 确保灵根存在
      await this.ensurePlayerTalent(attackerId, attacker);
      await this.ensurePlayerTalent(defenderId, defender);

      // 设置法球倍率
      attacker.法球倍率 = attacker.灵根.法球倍率;
      defender.法球倍率 = defender.灵根.法球倍率;

      // 执行战斗
      const battleResult = await zd_battle(attacker, defender);

      return {
        type: 'battle',
        result: battleResult,
        attacker,
        defender,
        isBusy
      };

    } catch (error) {
      console.error('执行打劫战斗错误:', error);
      throw error;
    }
  }

  // 检查替身人偶
  async checkSubstituteItem(defender, defenderId) {
    const hasSubstitute = await exist_najie_thing(defenderId, '替身人偶', '道具');
    const isEligible = defender.魔道值 < 1 &&
      (defender.灵根.type === '转生' || defender.level_id > 41);

    if (hasSubstitute && isEligible) {
      await Add_najie_thing(defenderId, '替身人偶', '道具', -1);
      return true;
    }

    return false;
  }

  // 确保玩家有灵根
  async ensurePlayerTalent(playerId, playerData) {
    if (!playerData.灵根) {
      playerData.灵根 = await get_random_talent();
      playerData.修炼效率提升 += playerData.灵根.eff;
      data.setData('player', playerId, playerData);
    }
  }

  // 处理打劫结果
  async handleRobResult(e, battleResult) {
    if (battleResult.type === 'substitute') {
      e.reply(battleResult.message);
      return;
    }

    const { result, attacker, defender, isBusy } = battleResult;
    const attackerId = e.user_id;
    const defenderId = e.message.find(item => item.type === 'at').qq;

    // 恢复血量
    await Promise.all([
      Add_HP(attackerId, result.A_xue),
      Add_HP(defenderId, result.B_xue)
    ]);

    // 构建消息
    const finalMsg = [segment.at(attackerId),
      segment.at(defenderId),
      '\n'];

    if (isBusy) {
      finalMsg.push(`${defender.名号}正在忙碌，${attacker.名号}利用隐身水悄然接近，但被发现。`);
    } else {
      finalMsg.push(`${attacker.名号}向${defender.名号}发起了打劫。`);
    }

    // 处理战斗结果
    const winMessage = this.processBattleOutcome(result.msg, attacker, defender, attackerId, defenderId);
    finalMsg.push(winMessage);

    e.reply(finalMsg);
  }

  // 处理战斗结果
  async processBattleOutcome(battleMsg, attacker, defender, attackerId, defenderId) {
    const attackerWin = `${attacker.名号}击败了${defender.名号}`;
    const defenderWin = `${defender.名号}击败了${attacker.名号}`;

    if (battleMsg.includes(attackerWin)) {
      return await this.handleAttackerVictory(attacker, defender, attackerId, defenderId);
    } else if (battleMsg.includes(defenderWin)) {
      return await this.handleDefenderVictory(attacker, defender, attackerId, defenderId);
    } else {
      throw new Error('战斗结果异常');
    }
  }

  // 处理攻击者胜利
  async handleAttackerVictory(attacker, defender, attackerId, defenderId) {
    const stolenSpirit = Math.trunc(defender.灵石 / 5);
    const evilPoints = Math.trunc(stolenSpirit / 10000);
    const evilBonus = attacker.魔道值;

    // 更新玩家数据
    attacker.灵石 += stolenSpirit + evilBonus;
    attacker.魔道值 += evilPoints;
    defender.灵石 -= stolenSpirit;

    await Promise.all([
      Write_player(attackerId, attacker),
      Write_player(defenderId, defender)
    ]);

    return `经过一番大战,${attackerWin},成功抢走${stolenSpirit}灵石，`;
  }

  // 处理被攻击者胜利
  async handleDefenderVictory(attacker, defender, attackerId, defenderId) {
    if (attacker.灵石 < 30002) {
      // 禁闭处理
      const confinementTime = 60 * 60000; // 60分钟
      const action = {
        action: '禁闭',
        end_time: Date.now() + confinementTime
      };

      await redis.set(`xiuxian:player:${attackerId}:action`, JSON.stringify(action));
      await Write_player(defenderId, defender);

      return `经过一番大战,${attacker.名号}被${defender.名号}击败了,${attacker.名号} 真是偷鸡不成蚀把米,被关禁闭60分钟`;
    } else {
      // 灵石损失
      const lostSpirit = Math.trunc(attacker.灵石 / 4);

      attacker.灵石 -= lostSpirit;
      defender.灵石 += lostSpirit;

      await Promise.all([
        Write_player(attackerId, attacker),
        Write_player(defenderId, defender)
      ]);

      return `经过一番大战,${attacker.名号}被${defender.名号}击败了,${attacker.名号} 真是偷鸡不成蚀把米,被劫走${lostSpirit}灵石`;
    }
  }

  // 参数验证辅助方法
  async validateBattleConditions(e, attackerId, defenderId) {
    // 检查群聊
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return false;
    }

    // 检查攻击者存档
    const attackerExists = await DAL.existPlayer(attackerId);
    if (!attackerExists) {
      e.reply('你还未踏入修仙之路，请先开始修仙！');
      return false;
    }

    // 检查被攻击者存档
    const defenderExists = await DAL.existPlayer(defenderId);
    if (!defenderExists) {
      e.reply('修仙者不可对凡人出手!');
      return false;
    }

    // 检查是否自己攻击自己
    if (attackerId === defenderId) {
      e.reply('你还跟自己修炼上了是不是?');
      return false;
    }

    // 检查玩家状态
    const attackerAction = await DAL.getPlayerAction(attackerId);
    if (attackerAction) {
      const remainingTime = attackerAction.end_time - Date.now();
      const minutes = Math.floor(remainingTime / 60000);
      const seconds = Math.floor((remainingTime % 60000) / 1000);
      e.reply(`你正在${attackerAction.action}中，剩余时间: ${minutes}分${seconds}秒`);
      return false;
    }

    return true;
  }

  // 优化后的以武会友方法
  async biwu(e) {
    try {
      const attackerId = e.user_id;

      // 检查是否@了人
      const atItem = e.message.find(item => item.type === 'at');
      if (!atItem) {
        e.reply('请@一位道友进行切磋！');
        return;
      }

      const defenderId = await Gulid(atItem.qq);

      // 验证战斗条件
      if (!await this.validateBattleConditions(e, attackerId, defenderId)) {
        return;
      }

      // 读取玩家数据
      const [attackerData, defenderData] = await Promise.all([
        (await DAL.getAllPlayerData(attackerId)).player,
        (await DAL.getAllPlayerData(defenderId)).player
      ]);

      if (!attackerData || !defenderData) {
        e.reply('读取玩家数据失败，请稍后再试');
        return;
      }

      // 执行战斗
      await this.executeBattle(e, attackerData, defenderData, 'friendly');

    } catch (error) {
      console.error('以武会友执行错误:', error);
      e.reply('切磋过程中发生错误，请稍后再试');
    }
  }

  // 优化后的木桩攻击方法
  async muzhuang(e) {
    try {
      const attackerId = e.user_id;

      // 检查是否@了人
      const atItem = e.message.find(item => item.type === 'at');
      if (!atItem) {
        e.reply('请@一位道友进行木桩测试！');
        return;
      }

      const defenderId = atItem.qq;

      // 验证战斗条件
      if (!await this.validateBattleConditions(e, attackerId, defenderId)) {
        return;
      }

      // 读取玩家数据
      const [attackerData, defenderData] = await Promise.all([
        (await DAL.getAllPlayerData(attackerId)).player,
        (await DAL.getAllPlayerData(defenderId)).player
      ]);

      if (!attackerData || !defenderData) {
        e.reply('读取玩家数据失败，请稍后再试');
        return;
      }

      // 执行战斗
      await this.executeBattle(e, attackerData, defenderData, 'training');

    } catch (error) {
      console.error('木桩攻击执行错误:', error);
      e.reply('木桩测试过程中发生错误，请稍后再试');
    }
  }

  // 统一的战斗执行方法
  async executeBattle(e, attackerData, defenderData, battleType = 'friendly') {
    try {
      // 初始化战斗数据
      const attacker = { ...attackerData };
      const defender = { ...defenderData };

      attacker.法球倍率 = attacker.灵根.法球倍率;
      defender.法球倍率 = defender.灵根.法球倍率;
      attacker.当前血量 = attacker.血量上限;
      defender.当前血量 = defender.血量上限;

      // 构建战斗消息
      const battleMsg = [
        segment.at(attacker.id),
        segment.at(defender.id),
        '\n'
      ];

      const battleTypeText = battleType === 'friendly' ? '切磋' : '木桩测试';
      battleMsg.push(`${attacker.名号}向${defender.名号}发起了${battleTypeText}。`);

      // 执行战斗
      const battleResult = await zd_battle(attacker, defender);

      if (!battleResult || !battleResult.msg) {
        e.reply('战斗过程出错');
        return;
      }
      console.log('[battle log]' + battleResult);

      // 生成战斗日志图片
      const logData = { log: battleResult.msg };
      const data1 = await new Show(e).get_logData(logData);
      const img = await puppeteer.screenshot('log', { ...data1 });

      e.reply(img);

    } catch (error) {
      console.error('战斗执行错误:', error);
      e.reply('战斗过程中发生错误，请稍后再试');
    }
  }

}


export async function zd_battle(attackerPlayer, defenderPlayer) {
  try {
    // 初始化战斗状态
    const battleState = {
      attacker: { ...attackerPlayer },
      defender: { ...defenderPlayer },
      round: 0,
      maxRounds: 20,
      messages: [],
      isFinished: false
    };

    // 初始化玩家战斗属性
    initializeBattleStats(battleState.attacker, attackerPlayer);
    initializeBattleStats(battleState.defender, defenderPlayer);

    // 战斗主循环
    while (!battleState.isFinished && battleState.round < battleState.maxRounds * 2) {
      const currentAttacker = battleState.round % 2 === 0 ? battleState.attacker : battleState.defender;
      const currentDefender = battleState.round % 2 === 0 ? battleState.defender : battleState.attacker;

      // 执行单回合战斗
      await executeBattleRound(battleState, currentAttacker, currentDefender);

      // 检查战斗是否结束
      if (battleState.attacker.当前血量 <= 0 || battleState.defender.当前血量 <= 0) {
        battleState.isFinished = true;
        finalizeBattle(battleState);
      }

      battleState.round++;
    }

    // 处理超时情况
    if (!battleState.isFinished) {
      handleBattleTimeout(battleState);
    }

    return {
      msg: battleState.messages,
      A_xue: calculateHealthChange(attackerPlayer, battleState.attacker),
      B_xue: calculateHealthChange(defenderPlayer, battleState.defender)
    };

  } catch (error) {
    console.error('战斗执行错误:', error);
    return {
      msg: ['战斗过程中发生错误'],
      A_xue: 0,
      B_xue: 0
    };
  }
}

// 初始化战斗属性
function initializeBattleStats(player, originalPlayer) {
  player.atk = originalPlayer.攻击;
  player.gandianhuihe = 0;
  player.chaodaohuihe = 0;
}

// 执行单回合战斗
async function executeBattleRound(battleState, attacker, defender) {
  const roundNumber = Math.floor(battleState.round / 2) + 1;

  // 处理元素反应
  const elementResult = await Gaodenyuansulun(
    attacker,
    defender,
    attacker.atk,
    battleState.messages,
    battleState.round,
    attacker.gandianhuihe,
    attacker.chaodaohuihe
  );

  // 更新战斗状态
  updateBattleStateFromElement(battleState, elementResult, attacker, defender);

  // 如果被冻结，跳过回合
  if (battleState.round !== elementResult.cnt) {
    battleState.messages.push(`第${roundNumber}回合：\n${defender.名号}无法造成伤害`);
    battleState.round++;
    return;
  }

  // 计算伤害
  const damage = calculateDamage(attacker, defender, battleState.round);

  // 应用伤害
  defender.当前血量 = Math.max(0, defender.当前血量 - damage.total);

  // 添加战斗消息
  battleState.messages.push(
    `第${roundNumber}回合：\n${attacker.名号}攻击了${defender.名号}，${damage.critText}造成伤害${damage.total}，${defender.名号}剩余血量${defender.当前血量}`
  );
}

// 计算伤害
function calculateDamage(attacker, defender, round) {
  const baseDamage = Harm(attacker.攻击 * 0.85, defender.防御);
  const critMultiplier = baojishanghai(attacker.暴击率);
  const spellDamage = Math.floor(attacker.攻击 * attacker.法球倍率);
  const defenseBonus = attacker.防御 * 0.1;

  let totalDamage = Math.floor(critMultiplier * baseDamage + spellDamage + defenseBonus);

  // 应用技能效果
  const skillResult = applySkillEffects(attacker, defender, round, totalDamage);
  totalDamage = skillResult.damage;

  // 应用魔道值和神石效果
  totalDamage = applySpecialEffects(attacker, defender, totalDamage);

  return {
    total: Math.floor(totalDamage),
    critText: ifbaoji(critMultiplier)
  };
}

// 应用技能效果
function applySkillEffects(attacker, defender, round, damage) {
  const jineng1 = data.jineng1 || [];
  const jineng2 = data.jineng2 || [];
  const random1 = Math.random();
  const random2 = Math.random();
  const roundNumber = Math.floor(round / 2);

  let finalDamage = damage;
  const messages = [];

  // 攻击方技能
  for (const skill of jineng1) {
    if (shouldTriggerSkill(skill, attacker, roundNumber, random1)) {
      const message = buildSkillMessage(skill, attacker, defender);
      if (message) messages.push(message);
      finalDamage = finalDamage * skill.beilv + skill.other;
    }
  }

  // 防御方技能
  for (const skill of jineng2) {
    if (shouldTriggerSkill(skill, defender, roundNumber, random2)) {
      const message = buildSkillMessage(skill, defender, attacker);
      if (message) messages.push(message);
      finalDamage = finalDamage * skill.beilv + skill.other;
    }
  }

  return { damage: finalDamage, messages };
}

// 判断是否触发技能
function shouldTriggerSkill(skill, player, round, random) {
  const roundMatch = skill.cnt === -1 || skill.cnt === round;
  const randomMatch = random < skill.pr;

  if (skill.class === '常驻') {
    return roundMatch && randomMatch;
  } else if (skill.class === '功法' && player.学习的功法) {
    return player.学习的功法.includes(skill.name) && roundMatch && randomMatch;
  } else if (skill.class === '灵根') {
    return player.灵根.name === skill.name && roundMatch && randomMatch;
  }

  return false;
}

// 构建技能消息
function buildSkillMessage(skill, caster, target) {
  if (!skill.msg1) return null;

  if (skill.msg2) {
    return `${caster.名号}${skill.msg1}${target.名号}${skill.msg2}`;
  } else {
    return `${caster.名号}${skill.msg1}`;
  }
}

// 应用特殊效果（魔道值、神石等）
function applySpecialEffects(attacker, defender, damage) {
  let finalDamage = damage;
  let buff = 1;

  // 魔道值加成
  if (attacker.魔道值 > 999) {
    buff += Math.floor(attacker.魔道值 / 1000) / 100;
    if (buff > 1.3) buff = 1.3;
    if (attacker.灵根.name === '九重魔功') buff += 0.2;
  }

  // 神石减伤
  if (defender.魔道值 < 1 && (defender.灵根.type === '转生' || defender.level_id > 41)) {
    let buff2 = defender.神石 * 0.0015;
    if (buff2 > 0.3) buff2 = 0.3;
    if (defender.灵根.name === '九转轮回体') buff2 += 0.2;
    buff -= buff2;
  }

  return Math.floor(finalDamage * buff);
}

// 更新元素反应状态
function updateBattleStateFromElement(battleState, elementResult, attacker, defender) {
  attacker.gandianhuihe = elementResult.gandianhuihe;
  attacker.chaodaohuihe = elementResult.chaodaohuihe2;

  // 处理持续伤害
  if (attacker.gandianhuihe > 0) {
    const continuousDamage = Math.floor(attacker.atk * 0.15);
    attacker.gandianhuihe--;
    defender.当前血量 -= continuousDamage;

    if (elementResult.ranshao) {
      battleState.messages.push(`${defender.名号}烧了起来,受到了${continuousDamage}的燃烧伤害`);
    } else if (elementResult.gandian) {
      battleState.messages.push(`${defender.名号}触电了,受到了${continuousDamage}的感电伤害`);
    }
  }

  // 处理超导效果
  if (elementResult.chaodao && attacker.chaodaohuihe > 0) {
    attacker.chaodaohuihe--;
    battleState.messages.push(`${defender.名号}的抗性大大下降,虚弱状态剩余${attacker.chaodaohuihe}回合`);
    defender.防御 *= 0.5;
  }
}

// 结束战斗
function finalizeBattle(battleState) {
  if (battleState.attacker.当前血量 <= 0) {
    battleState.messages.push(`${battleState.defender.名号}击败了${battleState.attacker.名号}`);
  } else if (battleState.defender.当前血量 <= 0) {
    battleState.messages.push(`${battleState.attacker.名号}击败了${battleState.defender.名号}`);
  }
}

// 处理战斗超时
function handleBattleTimeout(battleState) {
  battleState.messages.push('回合数超过20，自动通过血量结算');
  if (battleState.attacker.当前血量 > battleState.defender.当前血量) {
    battleState.messages.push(`${battleState.attacker.名号}击败了${battleState.defender.名号}`);
  } else {
    battleState.messages.push(`${battleState.defender.名号}击败了${battleState.attacker.名号}`);
  }
}

// 计算血量变化
function calculateHealthChange(originalPlayer, currentPlayer) {
  return currentPlayer.当前血量 - originalPlayer.当前血量;
}
