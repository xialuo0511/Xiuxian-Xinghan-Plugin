import plugin from '../../../../lib/plugins/plugin.js';
import common from '../../../../lib/common/common.js';
import config from '../../model/Config.js';
import data from '../../model/XiuxianData.js';
import fs from 'node:fs';

import {
  isNotNull,
  Add_yijie_beibao_thing,
  yijie_zhanlijisuan,
  Add_星魂币,
  find_yijie_taozhuang
} from '../Xiuxian/xiuxian.js';

/**
 * 定时任务
 */
export class yijieSecretPlaceTask extends plugin {
  constructor() {
    super({
      name: 'yijieSecretPlaceTask',
      dsc: '定时任务',
      event: 'message',
      priority: 300,
      rule: [],
    });
    this.xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');
    this.set = config.getdefSet('task', 'task');
    this.task = {
      cron: this.set.action_task,
      name: 'yijieSecretPlaceTask',
      fnc: () => this.yijieSecretplacetask(),
    };
  }

  async yijieSecretplacetask() {
    //获取缓存中人物列表
    let playerList = [];
    let files = fs
      .readdirSync(
        './plugins/xiuxian-emulator-plugin/resources/data/yijie/player'
      )
      .filter(file => file.endsWith('.json'));
    for (let file of files) {
      file = file.replace('.json', '');
      playerList.push(file);
    }
    for (let player_id of playerList) {
      let log_mag = ''; //查询当前人物动作日志信息
      log_mag = log_mag + '查询' + player_id + '是否有动作,';
      //得到动作
      let action = await redis.get('xiuxian:yijie:player:' + player_id + ':action');
      action = await JSON.parse(action);
      //不为空，存在动作
      if (action != null) {
        let push_address; //消息推送地址
        let is_group = false; //是否推送到群
        if (await action.hasOwnProperty('group_id')) {
          if (isNotNull(action.group_id)) {
            is_group = true;
            push_address = action.group_id;
          }
        }
        //最后发送的消息
        let msg = [segment.at(Number(player_id))];
        //动作结束时间
        let end_time = action.end_time;
        //现在的时间
        let now_time = new Date().getTime();
        //用户信息
        let player = await data.getData('yijie_player', player_id);
        //有秘境状态:这个直接结算即可
        if (action.Place_action == '0') {
          //这里改一改,要在结束时间的前两分钟提前结算
          end_time = end_time - 60000 * 2;
          //时间过了
          if (now_time > end_time) {
            let weizhi = action.Place_address;
            let A_player = await yijie_zhanlijisuan(player)
            let monster;
            let monster_length;
            let monster_index;

            //根据秘境对应怪物
            if (weizhi.id == 20009001) {
              monster_length = data.yijie_guaiwu1.length;
              monster_index = Math.trunc(Math.random() * monster_length);
              monster = data.yijie_guaiwu1[monster_index];
            }
            if (weizhi.id == 20009002) {
              monster_length = data.yijie_guaiwu2.length;
              monster_index = Math.trunc(Math.random() * monster_length);
              monster = data.yijie_guaiwu2[monster_index];
            }
            //仙鼎秘境08开头
            if (weizhi.id == 20008001) {
              monster_length = data.yijie_guaiwu0.length;
              monster_index = Math.trunc(Math.random() * monster_length);
              monster = data.yijie_guaiwu0[monster_index];
            }
            if (weizhi.id == 20008002) {
              monster_length = data.yijie_guaiwu1.length;
              monster_index = Math.trunc(Math.random() * monster_length);
              monster = data.yijie_guaiwu1[monster_index];
            }
            if (weizhi.id == 20008003) {
              monster_length = data.yijie_guaiwu2.length;
              monster_index = Math.trunc(Math.random() * monster_length);
              monster = data.yijie_guaiwu2[monster_index];
            }
            let B_player = await yijie_zhanlijisuan(monster)
            let A_win = `击败了【${monster.名号}】`;
            let B_win = `被【${monster.名号}】击败了`;
            var thing_name;
            var thing_class;
            let random1 = Math.random();
            let random2;
            let m = await find_yijie_taozhuang(player_id);
            if (A_player < B_player) {
              msg.push(B_win + "\n")
              msg.push(`战力不够，被异界的怪物薄纱，建议提升后再来`)
            } else {
              random2 = Math.floor(Math.random() * weizhi.thing.length);
              thing_name = weizhi.thing[random2].name;
              thing_class = weizhi.thing[random2].class;
              let shu = 1
              if (!weizhi.name.includes("仙鼎历练") && m == "探险者的春天" && random1 >= 0.8) {
                msg.push(`本次探索触发了【探险者的春天】效果，收益翻倍！`)
                shu = 2
              }
              if (weizhi.name.includes("仙鼎历练")) {
                msg.push(A_win + "\n")
                msg.push(`在秘境探索的中途，收获了【${thing_name}】*${shu}，本次探寻仙鼎历练秘境，获得异界使者的奖励10星魂币`)
                await Add_星魂币(player_id, 10)
              } else {
                msg.push(A_win + "\n")
                msg.push(`在秘境探索的中途，收获了【${thing_name}】*${shu}`)
              }
              await Add_yijie_beibao_thing(player_id, thing_name, thing_class, shu)
            }
            let arr = action;
            //把状态都关了
            arr.shutup = 1; //闭关状态
            arr.working = 1; //降妖状态
            arr.power_up = 1; //渡劫状态
            arr.Place_action = 1; //秘境
            arr.Place_actionplus = 1; //沉迷状态
            //结束的时间也修改为当前时间
            arr.end_time = new Date().getTime();
            //结算完去除group_id
            delete arr.group_id;
            //写入redis
            await redis.set(
              'xiuxian:yijie:player:' + player_id + ':action',
              JSON.stringify(arr)
            );
            //发送消息
            if (is_group) {
              await this.pushInfo(push_address, is_group, msg);
            } else {
              await this.pushInfo(player_id, is_group, msg);
            }
          }
        }
      }
    }
  }

  /**
   * 推送消息，群消息推送群，或者推送私人
   * @param id
   * @param is_group
   * @returns {Promise<void>}
   */
  async pushInfo(id, is_group, msg) {
    if (is_group) {
      await Bot.pickGroup(id)
        .sendMsg(msg)
        .catch(err => {
          Bot.logger.mark(err);
        });
    } else {
      await common.relpyPrivate(id, msg);
    }
  }
}
