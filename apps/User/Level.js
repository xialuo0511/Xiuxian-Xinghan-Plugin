import { plugin, data } from '../../api/api.js';
import config from '../../model/Config.js';
import fs from 'fs';
import {
  existplayer,
  Write_player,
  Write_equipment,
  isNotNull,
  player_efficiency,
  get_random_fromARR, sleep
} from '../Xiuxian/xiuxian.js';
import { Read_player, Read_equipment } from '../Xiuxian/xiuxian.js';
import { Add_HP, Add_najie_thing } from '../Xiuxian/xiuxian.js';
import { Gulid } from '../../api/api.js';
import * as DAL from '../../api/data-access.js';
import { scheduleTask } from '../../api/task-scheduler.js';
import { handleQiBreakthrough, handleBodyBreakthrough } from '../../logic/breakthrough_logic.js';

export class Level extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_Level',
      dsc: '修仙模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#突破$',
          fnc: 'levelUpNormal'
        },
        {
          reg: '^#突破概率$',
          fnc: 'levelUpProbability'
        },
        {
          reg: '^#幸运突破$',
          fnc: 'levelUpLuck'
        },
        {
          reg: '^#破体$',
          fnc: 'levelMaxUpNormal'
        },
        {
          reg: '^#幸运破体$',
          fnc: 'levelMaxUpLuck'
        },
        {
          reg: '^#渡劫$',
          fnc: 'fateUp'
        },
        {
          reg: '^#羽化登仙$',
          fnc: 'levelUpMax'
        }
      ]
    });
    this.xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');
  }

  async preCheck(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return null;
    }
    let userId = e.user_id;
    if (!(await DAL.existPlayer(userId))) {
      return null;
    }
    const currentAction = await DAL.getPlayerAction(userId);
    if (currentAction) {
      e.reply(`你正在${currentAction.action}中，无法分心。`);
      return null;
    }
    return userId;
  }

  async levelUpNormal(e) {
    try {
      const userId = await this.preCheck(e);
      if (!userId) return;

      const result = await handleQiBreakthrough(userId, false);
      console.log('[DEBUG] 突破结果：', result);
      e.reply(result.message);

      if (result.success) {
        await Add_HP(userId, 99999999);
      }
    } catch (error) {
      console.error('突破时发生错误:', error);
      e.reply('突破时似乎遇到了瓶颈，请稍后再试。');
    }
  }

  async levelUpLuck(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    const najie = (await DAL.getAllPlayerData(userId))?.najie;
    const hasLuckGrass = najie.道具.find(item => item.name === '幸运草' && item.数量 > 0);
    if (!hasLuckGrass) {
      e.reply('醒醒，你没有道具【幸运草】!');
      return;
    }

    await Add_najie_thing(userId, '幸运草', '道具', -1);
    e.reply('你使用了幸运草，减少50%失败概率。');

    const result = await handleQiBreakthrough(userId, true);
    e.reply(result.message);
  }

  async levelMaxUpNormal(e) {
    try {
      const userId = await this.preCheck(e);
      if (!userId) return;

      const result = await handleBodyBreakthrough(userId, false);
      e.reply(result.message);

      if (result.success) {
        await Add_HP(userId, 99999999);
      }
    } catch (error) {
      console.error('破体时发生错误:', error);
      e.reply('破体时似乎遇到了瓶颈，请稍后再试。');
    }
  }

  async levelMaxUpLuck(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    const najie = (await DAL.getAllPlayerData(userId))?.najie;
    const hasLuckGrass = najie.道具.find(item => item.name === '幸运草' && item.数量 > 0);
    if (!hasLuckGrass) {
      e.reply('醒醒，你没有道具【幸运草】!');
      return;
    }

    await Add_najie_thing(userId, '幸运草', '道具', -1);
    e.reply('你使用了幸运草，减少50%失败概率。');

    const result = await handleBodyBreakthrough(userId, true);
    e.reply(result.message);
  }

  async levelUpProbability(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    const player = (await DAL.getAllPlayerData(userId))?.player;
    if (!player) return;

    const levelInfo = data.Level_list.find(item => item.level_id == player.level_id);
    if (!levelInfo) return;

    let prob = 1 - levelInfo.level_id / 80;
    if (player.breakthrough) {
      prob += 0.2;
    }

    e.reply(`本次突破成功概率：${(prob * 100).toFixed(2)}%`);
  }

  //渡劫
  async fateUp(e) {
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);
    //有无账号
    let ifexistplay = await DAL.existPlayer(usr_qq);
    if (!ifexistplay) {
      e.reply('weizhuce' + await DAL.getPlayerData(usr_qq));
      return;
    }
    //不开放私聊
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    //获取游戏状态
    let game_action = await redis.get('xiuxian:player:' + usr_qq + ':game_action');
    //防止继续其他娱乐行为
    if (game_action == 0) {
      e.reply('修仙：游戏进行中...');
      return;
    }
    let playerData = await DAL.getAllPlayerData(usr_qq);
    let player = playerData.player;
    //境界
    let now_level = data.Level_list.find(item => item.level_id == player.level_id).level;
    if (now_level != '渡劫期') {
      e.reply(`你非渡劫期修士！`);
      return;
    }
    if (player.linggenshow == 1) {
      e.reply(`你灵根未开，不能渡劫！`);
      return;
    }

    //查询人物动作
    const currentAction = await DAL.getPlayerAction(usr_qq);
    if (currentAction) {
      let m = Math.floor((currentAction.end_time - Date.now()) / 60000);
      let s = Math.floor(((currentAction.end_time - Date.now()) % 60000) / 1000);
      e.reply(`你正在${currentAction.action}中，剩余时间: ${m}分${s}秒`);
      return;
    }

    if (player.power_place == 0) {
      //已经开了
      e.reply('你已度过雷劫，请感应仙门#羽化登仙');
      return;
    }
    //看看当前血量
    let now_HP = player.当前血量;
    let list_HP = data.Level_list.find(item => item.level == now_level).基础血量;
    if (now_HP < list_HP * 0.9) {
      player.当前血量 = 1;
      await DAL.savePlayer(usr_qq, player);
      e.reply(player.名号 + '血量亏损，强行渡劫后晕倒在地！');
      return;
    }
    //境界id
    let now_level_id = data.Level_list.find(item => item.level == now_level).level_id;
    if (now_level_id == 54) {
      e.reply(`您已是此界凡人`);
      return;
    }
    //修为
    let now_exp = player.修为;
    //修为
    let need_exp;
    try {
      need_exp = data.Level_list.find(item => item.level == now_level).exp;
    } catch {
      need_exp = data.Level_list.find(item => item.level_id == now_level_id).exp;
    }
    if (now_exp < need_exp) {
      e.reply(`修为不足,再积累${need_exp - now_exp}修为后方可突破`);
      return;
    }
    let y;
    if (player.灵根.type == '伪灵根') {
      y = 3;
    } else if (player.灵根.type == '真灵根') {
      y = 6;
    } else if (player.灵根.type == '天灵根') {
      y = 9;
    } else if (player.灵根.type == '体质') {
      y = 10;
    } else if (player.灵根.type == '转生' || player.灵根.type == '魔头') {
      y = 21;
    } else if (player.灵根.type == '转圣') {
      y = 26;
    } else {
      y = 12;
    }
    let n = 1380, p = 280; // 您的参数
    let x = await dujie(usr_qq); // dujie函数现在只用于计算雷抗
    let l = (x - n) / (p + y * 0.1);

    e.reply(`你感应到天劫将至，天空中乌云密布...第一道雷罚将在10秒后落下！`);
    if (x <= n) {
      //没有达到最低要求
      player.当前血量 = 0;
      player.修为 -= parseInt(need_exp / 4);
      await Write_player(usr_qq, player);
      e.reply('天空一声巨响，未降下雷劫，就被天道的气势震死了。');
      return;
    }
    l = l * 100;
    l = l.toFixed(2);
    e.reply('天道：就你，也敢逆天改命？');
    e.reply('[' + player.名号 + ']' + '\n雷抗：' + x + '\n成功率：' + l + '%\n灵根：' + player.灵根.type + '\n需渡' + y + '道雷劫\n将在一分钟后落下\n[温馨提示]\n请把其他渡劫期打死后再渡劫！');

    const LEI_JIE_INTERVAL = 10 * 1000; // 雷劫间隔10秒
    const totalDuration = y * LEI_JIE_INTERVAL; // 渡劫总时长
    const finalEndTime = Date.now() + totalDuration;

    const actionDetails = {
      action: '渡劫', // 动作名称
      end_time: finalEndTime // [重要] 记录的是整个过程的最终结束时间
    };
    // 这个键将作为“忙碌”的唯一判断依据
    await redis.set(`XinghanXiuxian:Player:${usr_qq}:action`, JSON.stringify(actionDetails));

    // 2. 调度第一道雷劫任务
    const firstStrikeTime = Date.now() + LEI_JIE_INTERVAL;
    const taskPayload = {
      type: 'handleTribulationStrike',
      userId: usr_qq,
      current_strike: 1,
      total_strikes: y,
      success_rate: l,
      group_id: e.group_id
    };
    await scheduleTask(taskPayload, firstStrikeTime);
  }

  async levelUpMax(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);

    if (!await DAL.existPlayer(usr_qq)) {
      return;
    }

    // 使用 DAL 获取玩家状态
    const currentAction = await DAL.getPlayerAction(usr_qq);
    if (currentAction) {
      let m = Math.floor((currentAction.endTime - Date.now()) / 60000);
      let s = Math.floor(((currentAction.endTime - Date.now()) % 60000) / 1000);
      e.reply(`你正在${currentAction.action}中，剩余时间: ${m > 0 ? m : 0}分${s > 0 ? s : 0}秒`);
      return;
    }

    const playerData = (await DAL.getAllPlayerData(usr_qq))?.player;
    if (!playerData) {
      e.reply('无法获取你的信息，请稍后再试。');
      return;
    }

    const levelInfo = data.Level_list.find(item => item.level_id == playerData.level_id);

    if (levelInfo.level !== '渡劫期') {
      e.reply(`你非渡劫期修士！`);
      return;
    }
    if (playerData.power_place !== 0) {
      e.reply('请先渡劫！');
      return;
    }
    if (playerData.修为 < levelInfo.exp) {
      e.reply(`修为不足,再积累${levelInfo.exp - playerData.修为}修为后方可成仙！`);
      return;
    }

    e.reply('天空一声巨响，一道虚影从眼中浮现，你感应到仙界之门已为你敞开...');

    // 1. 提升境界
    await DAL.transaction_update(usr_qq, (player) => {
      player.level_id += 1;
      player.修为 -= levelInfo.exp;
      return true;
    });
    await Add_HP(usr_qq, 99999999);

    // 2. 处理宗门事务
    const ascendedPlayer = (await DAL.getAllPlayerData(usr_qq))?.player; // 获取更新后的玩家数据
    if (ascendedPlayer.宗门 && isNotNull(ascendedPlayer.宗门)) {
      const sectName = ascendedPlayer.宗门.宗门名称;
      const sect = await DAL.getAssociation(sectName);

      if (!sect) { // 容错处理：如果宗门不存在，则清理玩家数据
        await DAL.transaction_update(usr_qq, (p) => {
          delete p.宗门;
          return true;
        });
        return;
      }

      if (ascendedPlayer.宗门.职位 !== '宗主') {
        // 普通成员脱离
        sect[ascendedPlayer.宗门.职位] = sect[ascendedPlayer.宗门.职位].filter(id => id != usr_qq);
        sect.所有成员 = sect.所有成员.filter(id => id != usr_qq);
        await DAL.saveAssociation(sectName, sect);
        await DAL.transaction_update(usr_qq, (p) => {
          delete p.宗门;
          return true;
        });
        await sleep(1000);
        e.reply('你已飞升仙界，自动脱离凡间宗门。');
      } else {
        // 宗主飞升
        sect.所有成员 = sect.所有成员.filter(id => id != usr_qq);

        if (sect.所有成员.length < 1) { // 解散宗门
          await redis.del(`XinghanXiuxian:Data:Association:${sectName}`);
          await sleep(1000);
          e.reply('一声巨响,原本的宗门轰然倒塌,随着流沙沉没,世间再无半分痕迹。');
        } else { // 传承宗主
          let nextMasterId;
          if (sect.副宗主?.length > 0) nextMasterId = await get_random_fromARR(sect.副宗主);
          else if (sect.长老?.length > 0) nextMasterId = await get_random_fromARR(sect.长老);
          else if (sect.内门弟子?.length > 0) nextMasterId = await get_random_fromARR(sect.内门弟子);
          else nextMasterId = await get_random_fromARR(sect.所有成员);

          const nextMasterData = (await DAL.getAllPlayerData(nextMasterId))?.player;
          if (nextMasterData) {
            // 更新宗门文件
            sect[nextMasterData.宗门.职位] = sect[nextMasterData.宗门.职位].filter(id => id != nextMasterId);
            sect.宗主 = nextMasterId;
            await DAL.saveAssociation(sectName, sect);

            // 更新新宗主玩家存档
            await DAL.transaction_update(nextMasterId, (p) => {
              p.宗门.职位 = '宗主';
              return true;
            });
            await sleep(1000);
            e.reply(`飞升前,遵循你的嘱托,${nextMasterData.名号}将继承你的衣钵,成为新一任的宗主。`);
          }
        }
        // 移除飞升宗主的宗门信息
        await DAL.transaction_update(usr_qq, (p) => {
          delete p.宗门;
          return true;
        });
      }
    }
  }
}

export async function dujie(usr_qq) {
  let player = (await DAL.getAllPlayerData(usr_qq)).player;
  //根据当前血量才算
  //计算系数
  var new_blood = player.当前血量;
  var new_defense = player.防御;
  var new_attack = player.攻击;
  //渡劫期基础血量为1600000。防御800000，攻击800000
  new_blood = new_blood / 100000;
  new_defense = new_defense / 100000;
  new_attack = new_attack / 100000;
  //取值比例4.6.2
  new_blood = (new_blood * 4) / 10;
  new_defense = (new_defense * 6) / 10;
  new_attack = (new_attack * 2) / 10;
  //基础厚度
  var N = new_blood + new_defense;
  //你的系数
  var x = N * new_attack;
  //系数只取到后两位
  //灵根加成
  if (player.灵根.type == '真灵根') {
    x = x * (1 + 0.5);
  } else if (player.灵根.type == '天灵根') {
    x = x * (1 + 0.75);
  } else {
    x = x * (1 + 1);
  }
  x = x.toFixed(2);
  return x;
}

/**
 *
 * 查找是否有凡人
 */
export async function fanren() {
  //获取缓存中人物列表
  let playerList = [];
  let files = fs
    .readdirSync('./plugins/xiuxian-emulator-plugin/resources/data/xiuxian_player')
    .filter((file) => file.endsWith('.json'));
  for (let file of files) {
    file = file.replace('.json', '');
    playerList.push(file);
  }
  //默认为1
  let x = '1';
  for (let player_id of playerList) {
    let usr_qq = player_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);
    let player = data.getData('player', usr_qq);
    //搜索境界，有凡人，就变0
    let now_level_id;
    if (!isNotNull(player.level_id)) {
      return;
    }
    now_level_id = data.Level_list.find(item => item.level_id == player.level_id).level_id;
    if (now_level_id == 54) {
      x = '0';
    }
  }
  return x;
}