// /apps/Battle/Battle.js (完整重构版)

import plugin from '../../../../lib/plugins/plugin.js';
import data from '../../model/XiuxianData.js';
import { Read_player, isNotNull, Add_HP, ForwardMsg } from '../Xiuxian/xiuxian.js';
import { applyElementalEffects } from '../../logic/elemental_logic.js';
import * as DAL from '../../api/data-access.js';
import { puppeteer, Show } from '../../api/api.js';
import redis from 'redis'; // 【核心】导入新的逻辑处理器

/**
 * 【新增】暴击判断函数
 * @param {number} baojilv 暴击率
 * @returns {{isCrit: boolean, critRate: number, message: string}}
 */
function checkCrit(baojilv) {
  if (baojilv > 1) baojilv = 1;
  const rand = Math.random();
  if (rand < baojilv) {
    return {
      isCrit: true,
      critRate: baojilv + 1.5, // 暴击伤害倍率
      message: '触发暴击, '
    };
  }
  return {
    isCrit: false,
    critRate: 1,
    message: ''
  };
}

/**
 * 核心战斗引擎
 * @param {object} A_player 攻击方 (会被直接修改)
 * @param {object} B_player 防御方 (会被直接修改)
 */
async function battleEngine(A_player, B_player) {
  let turn = 0;
  let messages = [];
  let statusEffects = {};

  while (A_player.当前血量 > 0 && B_player.当前血量 > 0) {
    if (turn >= 40) {
      messages.push('战斗超过20回合，平局！');
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

    // 【新增】暴击和仙宠逻辑
    const critResult = checkCrit(attacker.暴击率);
    let critMessage = critResult.message;

    if (attacker.仙宠?.type === '暴伤') {
      critResult.critRate += attacker.仙宠.加成;
    }

    if (attacker.仙宠?.type === '战斗' && Math.random() < 0.8) {
      const petBonus = attacker.仙宠.加成;
      const petAtk = Math.trunc(damage * petBonus);
      const petDef = Math.trunc(attacker.防御 * petBonus);
      const petHP = Math.trunc(attacker.当前血量 * petBonus);
      damage += petAtk;
      attacker.防御 += petDef;
      attacker.当前血量 += petHP;
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

    let finalDamage = Math.trunc(updatedContext.damage * critResult.critRate);
    defender.当前血量 -= finalDamage;
    if (defender.当前血量 < 0) {
      defender.当前血量 = 0;
    }

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
    log: messages,
    A_win: A_win,
    A_player: A_player,
    B_player: B_player
  };
}

export class Battle extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_Battle',
      dsc: '修仙模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#打劫$',
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
  }

  async biwu(e) {
    if (!e.isGroup) return;
    const atItem = e.message.filter(item => item.type === 'at')[0];
    if (!atItem) return;

    const A_id = e.user_id;
    const B_id = atItem.qq;

    if (A_id == B_id) {
      e.reply('自己和自己打？');
      return;
    }

    const A_player = (await DAL.getAllPlayerData(A_id)).player;
    const B_player = (await DAL.getAllPlayerData(B_id)).player;
    if (!A_player || !B_player) {
      e.reply('对方或你尚未踏入仙途。');
      return;
    }

    // 准备战斗数据副本
    const A_battle_data = {
      ...A_player,
      id: A_id,
      当前血量: A_player.血量上限,
      equipment: await DAL.getAllPlayerData(A_id).equipment
    };
    const B_battle_data = {
      ...B_player,
      id: B_id,
      当前血量: B_player.血量上限,
      equipment: await DAL.getAllPlayerData(B_id).equipment
    };

    e.reply(`【${A_player.名号}】向【${B_player.名号}】发起了切磋！`);

    const battleResult = await battleEngine(A_battle_data, B_battle_data);
    A_player.当前血量 = battleResult.A_xue;
    B_player.当前血量 = battleResult.B_xue;


    let img = await this.renderBattle(e, battleResult);
    e.reply(img);
  }

  /**
   * #打劫
   */
  async Dajie(e) {
    const atItem = e.message.filter(item => item.type === 'at')[0];
    if (!atItem) return;

    const A_id = await this.preCheck(e);
    if (!A_id) return;

    const B_id = await Gulid(atItem.qq);
    if (!await DAL.existPlayer(B_id)) {
      e.reply(`此人尚未踏入仙途`);
      return;
    }

    if (A_id === B_id) {
      e.reply('咋的，自己弄自己啊？');
      return;
    }

    const nowTime = Date.now();
    const lastRobTime = parseInt(await redis.get(`xiuxian:player:${A_id}:last_dajie_time`)) || 0;
    const robTimeout = this.xiuxianConfigData.CD.rob * 60000;

    if (nowTime < lastRobTime + robTimeout) {
      const remaining = lastRobTime + robTimeout - nowTime;
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      e.reply(`打劫正在CD中，剩余cd: ${m}分 ${s}秒`);
      return;
    }

    const A_data = await DAL.getAllPlayerData(A_id);
    const B_data = await DAL.getAllPlayerData(B_id);

    if (B_data.player.当前血量 < 20000) {
      e.reply(`${B_data.player.名号} 重伤未愈,就不要再打他了`);
      return;
    }
    if (B_data.player.灵石 < 30002) {
      e.reply(`${B_data.player.名号} 穷得叮当响,放过他吧`);
      return;
    }

    e.reply(`【${A_data.player.名号}】向【${B_data.player.名号}】发起了打劫！`);
    await redis.set(`xiuxian:player:${A_id}:last_dajie_time`, nowTime);

    const battleResult = await battleEngine({
      ...A_data.player,
      id: A_id,
      equipment: A_data.equipment
    }, { ...B_data.player, id: B_id, equipment: B_data.equipment });

    await ForwardMsg(e, battleResult.msg);
    await Add_HP(A_id, battleResult.A_xue_change);
    await Add_HP(B_id, battleResult.B_xue_change);

    let finalMessage = '';
    if (battleResult.A_win) {
      const loot = Math.trunc(B_data.player.灵石 / 5);
      const mdz = Math.trunc(loot / 10000);
      await DAL.transaction_update(A_id, (player) => {
        player.灵石 += loot;
        player.魔道值 += mdz;
      });
      await DAL.transaction_update(B_id, (player) => {
        player.灵石 -= loot;
      });
      finalMessage = `打劫成功！你成功抢走 ${loot} 灵石，魔道值增加 ${mdz}！`;
    } else {
      if (A_data.player.灵石 < 30002) {
        const actionDetails = { action: '禁闭', endTime: Date.now() + 60 * 60 * 1000 };
        await redis.set(`XinghanXiuxian:Player:${A_id}:action`, JSON.stringify(actionDetails));
        finalMessage = '偷鸡不成蚀把米, 你被抓去关了60分钟禁闭！';
      } else {
        const penalty = Math.trunc(A_data.player.灵石 / 4);
        await DAL.transaction_update(A_id, (player) => {
          player.灵石 -= penalty;
        });
        await DAL.transaction_update(B_id, (player) => {
          player.灵石 += penalty;
        });
        finalMessage = `打劫失败！反被对方夺走 ${penalty} 灵石！`;
      }
    }
    e.reply(finalMessage);
  }

  /**
   * #攻击木桩
   */
  async muzhuang(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    const A_data = await DAL.getAllPlayerData(userId);
    const dummy = {
      id: 'dummy',
      名号: '木桩',
      攻击: 0,
      防御: A_data.player.攻击 * 0.8, // 木桩的防御是玩家攻击的80%
      当前血量: 999999999,
      血量上限: 999999999,
      暴击率: 0,
      灵根: { name: '无', 法球倍率: 0 }
    };

    e.reply(`你对着一个憨憨的木桩发起了攻击...`);
    const battleResult = await battleEngine({ ...A_data.player, id: userId, equipment: A_data.equipment }, dummy);

    // 只显示前10回合的战报
    // battleResult.log = battleResult.log.length > 21 ? battleResult.log.filter((_, index) => index < 21) : battleResult.log;
    battleResult.B_player.当前血量 = Math.max(battleResult.B_player.当前血量, 1);
    battleResult.log.push('\n...一顿操作后，木桩依旧屹立不倒...');
    let img = await this.renderBattle(e, battleResult);
    e.reply(img);
  }

  async preCheck(e) {
    try {
      if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return null;
      }

      let userId = e.user_id;

      const playerExists = await DAL.existPlayer(userId);

      if (!playerExists) {
        e.reply('你还没有修仙账号，请先#踏入仙途');
        return null;
      }

      const currentAction = await DAL.getPlayerAction(userId);

      if (currentAction) {
        e.reply(`你正在${currentAction.action}中，无法分心。`);
        return null;
      }

      return userId;
    } catch (error) {
      console.error('[ERROR] preCheck 发生错误:', error);
      e.reply('检查玩家状态时发生错误，请稍后再试。');
      return null;
    }
  }

  /**
   * 【核心修正】: 统一的渲染函数
   */
  async renderBattle(e, dataForRender) {
    const A_player = dataForRender.A_player;
    const B_player = dataForRender.B_player;

    // 在这里预先计算好血量百分比
    let A_player_percent_hp = A_player.血量上限 > 0 ? (A_player.当前血量 / A_player.血量上限 * 100) : 0;
    let B_player_percent_hp = B_player.血量上限 > 0 ? (B_player.当前血量 / B_player.血量上限 * 100) : 0;
    A_player_percent_hp = Math.min(A_player_percent_hp, 100);
    B_player_percent_hp = Math.min(B_player_percent_hp, 100);

    const renderData = {
      ...dataForRender,
      pluResPath: `../../../../../plugins/xiuxian-emulator-plugin/resources`,
      A_player_percent_hp: Math.max(0, A_player_percent_hp).toFixed(0),
      B_player_percent_hp: Math.max(0, B_player_percent_hp).toFixed(0),
      A_player: {
        ...A_player,
        level_name: data.Level_list.find(item => item.level_id == A_player.level_id)?.level || '未知境界'
      },
      B_player: {
        ...B_player,
        level_name: data.Level_list.find(item => item.level_id == B_player.level_id)?.level || '未知境界'
      }
    };

    const dataForPuppeteer = await new Show(e).get_battleData(renderData);
    return await puppeteer.screenshot('battle', { ...dataForPuppeteer });
  }
}

// 伤害计算和暴击判断等辅助函数
function Harm(atk, def) {
  let x;
  let s = atk / def;
  let rand = Math.trunc(Math.random() * 11) / 100 + 0.95;
  if (s < 1) x = 0.1;
  else if (s > 2.5) x = 1;
  else x = 0.6 * s - 0.5;
  return Math.trunc(x * atk * rand);
}
