import plugin from '../../../../lib/plugins/plugin.js';
import config from '../../model/Config.js';
import * as DAL from '../../api/data-access.js';
import { scheduleTask } from '../../api/task-scheduler.js';
import { settleBiguan } from '../../logic/retreat.js';
import { work } from '../../logic/work.js';


/**
 * 定时任务
 */

export class PlayerControl extends plugin {
  constructor() {
    super({
      name: 'PlayerControl',
      dsc: '控制人物的行为',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '(^#*降妖$)|(^#*降妖(.*)(分|分钟)$)',
          fnc: 'Dagong'
        },
        {
          reg: '(^#闭关$)|(^#闭关(.*)(分|分钟)$)',
          fnc: 'Biguan'
        },
        {
          reg: '^#出关$',
          fnc: 'chuGuan'
        },
        {
          reg: '^#降妖归来$',
          fnc: 'endWork'
        }
      ]
    });
    this.xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');
  }


  //闭关
  async Biguan(e) {

    let usr_qq = e.user_id;//用户qq
    //有无存档
    if (!(await DAL.existPlayer(usr_qq))) {
      e.reply('请先踏入仙途');
      return;
    }

    //不开放私聊
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }

    const currentAction = await DAL.getPlayerAction(usr_qq);
    if (currentAction) {
      const remainingTime = currentAction.endTime - Date.now();
      if (remainingTime > 0) {
        let m = Math.floor(remainingTime / 60000);
        let s = Math.floor((remainingTime % 60000) / 1000);
        e.reply(`你正在${currentAction.action}中，剩余时间: ${m}分${s}秒`);
        return;
      }
    }

    //获取时间
    let time = e.msg.replace(/#|闭关|分|钟/g, '');
    time = parseInt(time) || 30; // 默认30分钟
    let y = 30;//时间
    let x = 240;//循环次数
    //如果是 >=16*33 ----   >=30
    for (let i = x; i > 0; i--) {
      if (time >= y * i) {
        time = y * i;
        break;
      }
    }
    //如果<30，修正。
    if (time < 30) {
      time = 30;
    }

    // let msg = ""
    // let biguan_action = await redis.get('xiuxian:player:' + usr_qq + ':biguang');
    // biguan_action = JSON.parse(biguan_action);
    // if (biguan_action) {
    //     if (biguan_action.biguan > 0) {
    //         msg += "本次闭关消耗一次辟谷丹效果，还剩" + (biguan_action.biguan - 1) + "次(仅闭关获得收益后才会消耗次数)\n"
    //     }
    // }
    // let lianshen_action = await redis.get('xiuxian:player:' + usr_qq + ':lianshen');
    // lianshen_action = JSON.parse(lianshen_action);
    // if (lianshen_action) {
    //     if (lianshen_action.lianti > 0) {
    //         msg += "本次闭关消耗一次炼神之力(仅闭关获得收益后才会消耗次数)\n"
    //     }
    // }

    const startTime = Date.now();
    const action_time = time * 60 * 1000;
    const endTime = startTime + action_time;


    // 这是为后台任务准备的 payload 对象
    const taskPayload = {
      type: 'settleBiguan',
      userId: e.user_id,
      startTime: startTime,
      endTime: endTime,
      groupId: e.group_id
    };

    const taskPayloadString = JSON.stringify(taskPayload);

    // 设置玩家状态，把上面生成的字符串也存进去
    const actionDetails = {
      action: '闭关',
      startTime: startTime,
      endTime: endTime,
      groupId: e.group_id,
      taskPayloadString: taskPayloadString
    };
    await redis.set(`XinghanXiuxian:Player:${e.user_id}:action`, JSON.stringify(actionDetails));

    await scheduleTask(taskPayload, endTime);
    e.reply(`现在开始闭关${time}分钟,两耳不闻窗外事了`);

  }


  //降妖
  async Dagong(e) {
    let usr_qq = e.user_id;//用户qq
    //有无存档
    if (!(await DAL.existPlayer(usr_qq))) {
      e.reply('请先踏入仙途');
      return;
    }

    //不开放私聊
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }

    const currentAction = await DAL.getPlayerAction(usr_qq);
    if (currentAction) {
      const remainingTime = currentAction.endTime - Date.now();
      if (remainingTime > 0) {
        let m = Math.floor(remainingTime / 60000);
        let s = Math.floor((remainingTime % 60000) / 1000);
        e.reply(`你正在${currentAction.action}中，剩余时间: ${m}分${s}秒`);
        return;
      }
    }

    //获取时间
    let time = e.msg.replace(/#|降妖|分|钟/g, '');
    time = parseInt(time) || 30; // 默认15分钟
    let y = 15;//固定时间
    let x = 48;//循环次数
    for (let i = x; i > 0; i--) {
      if (time >= y * i) {
        time = y * i;
        break;
      }
    }
    if (time < 30) {
      time = 30;
    }

    let player = (await DAL.getAllPlayerData(usr_qq)).player;

    if (player.当前血量 < 200) {
      e.reply('你都伤成这样了,先去疗伤吧');
      return;
    }

    const startTime = Date.now();
    const action_time = time * 60 * 1000;
    const endTime = startTime + action_time;


    // 这是为后台任务准备的 payload 对象
    const taskPayload = {
      type: 'work',
      userId: e.user_id,
      startTime: startTime,
      endTime: endTime,
      groupId: e.group_id
    };

    const taskPayloadString = JSON.stringify(taskPayload);

    // 设置玩家状态，把上面生成的字符串也存进去
    const actionDetails = {
      action: '降妖',
      startTime: startTime,
      endTime: endTime,
      groupId: e.group_id,
      taskPayloadString: taskPayloadString
    };
    await redis.set(`XinghanXiuxian:Player:${e.user_id}:action`, JSON.stringify(actionDetails));

    await scheduleTask(taskPayload, endTime);
    e.reply(`现在开始降妖${time}分钟`);
  }

  /**
   * 人物结束闭关
   * @param e
   * @returns {Promise<void>}
   */
  async chuGuan(e) {
    const usr_qq = e.user_id;

    if (!(await DAL.existPlayer(usr_qq))) {
      e.reply('请先踏入仙途');
      return;
    }

    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    // 检查 action 状态
    const actionKey = `XinghanXiuxian:Player:${usr_qq}:action`;
    const actionJson = await redis.get(actionKey);
    if (!actionJson) {
      e.reply('你并未在闭关，无需出关。');
      return;
    }
    const actionDetails = JSON.parse(actionJson);
    if (actionDetails.action !== '闭关') {
      e.reply(`你正在${actionDetails.action}中，无法执行 #出关。`);
      return;
    }

    try {
      // 结算
      const taskPayloadForSettle = {
        type: 'settleBiguan',
        userId: usr_qq,
        startTime: actionDetails.startTime,
        endTime: actionDetails.endTime,
        groupId: actionDetails.groupId
      };
      await settleBiguan(taskPayloadForSettle, false, e);
      const taskPayloadString = actionDetails.taskPayloadString;
      await redis.zRem('tasks:scheduled', taskPayloadString);

      await redis.del(actionKey);

    } catch (error) {
      console.error(`[ERROR] 用户 ${usr_qq} 出关失败:`, error);
      e.reply('出关时发生未知错误，请联系管理员。');
    }
  }


  /**
   * 人物结束降妖
   * @param e
   * @returns {Promise<void>}
   */
  async endWork(e) {
    const usr_qq = e.user_id;

    if (!(await DAL.existPlayer(usr_qq))) {
      e.reply('请先踏入仙途');
      return;
    }

    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    // 检查 action 状态
    const actionKey = `XinghanXiuxian:Player:${usr_qq}:action`;
    const actionJson = await redis.get(actionKey);
    if (!actionJson) {
      e.reply('你并未在降妖途中。');
      return;
    }
    const actionDetails = JSON.parse(actionJson);
    if (actionDetails.action !== '降妖') {
      e.reply(`你正在${actionDetails.action}中，无法执行 #降妖归来。`);
      return;
    }

    try {
      // 结算
      const taskPayloadForSettle = {
        type: 'work',
        userId: usr_qq,
        startTime: actionDetails.startTime,
        endTime: actionDetails.endTime,
        groupId: actionDetails.groupId
      };
      await work(taskPayloadForSettle, false, e);
      const taskPayloadString = actionDetails.taskPayloadString;
      await redis.zRem('tasks:scheduled', taskPayloadString);

      await redis.del(actionKey);

    } catch (error) {
      console.error(`[ERROR] 用户 ${usr_qq} 降妖归来失败:`, error);
      e.reply('降妖归来时发生未知错误，请联系管理员。');
    }
  }
}

