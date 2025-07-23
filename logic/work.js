//不可导入任何app/module中的代码
import * as DAL from '../api/data-access.js';
import * as Notifier from '../handlers/notifier.js';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import data from '../model/XiuxianData.js';


const pluginRoot = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin');
const dataPath = path.join(pluginRoot, 'resources', 'data');
const configPath = path.join(pluginRoot, 'config');

const Level_list = JSON.parse(fs.readFileSync(path.join(dataPath, 'Level', '练气境界.json'), 'utf-8'));
const xiuxianConfigData = YAML.parse(fs.readFileSync(path.join(configPath, 'xiuxian', 'xiuxian.yaml'), 'utf-8'));

/**
 * 降妖结算的核心逻辑
 * @param {object} task - 任务载荷
 * @param {boolean} [isRandom=true] - 是否触发随机事件（提前不触发）
 * @param e - 机器人对象，提前结算调用
 */
export async function work(task, isRandom = true, e = null) {
  const { userId, startTime, endTime, groupId } = task;

  // 计算实际降妖时长
  const actualEndTime = isRandom ? endTime : Date.now(); // 正常结束用计划时间，提前结束用当前时间
  let durationMinutes = Math.floor((actualEndTime - startTime) / 60000);

  // 沿用旧逻辑，确保收益计算方式一致
  const y = xiuxianConfigData.biguan.time;
  const x = xiuxianConfigData.biguan.cycle;
  for (var i = x; i > 0; i--) {
    if (durationMinutes >= y * i) {
      durationMinutes = y * i;
      break;
    }
  }
  try {
    if (durationMinutes < y) {
      await Notifier.notify(groupId, userId, `降妖归来！时间过短，未获得任何收益。`, e);
      return;
    }
  } catch (err) {
    console.log(err);
  }

  // 非手动结算就删除对应的动作
  if (!e) {
    const actionKey = `XinghanXiuxian:Player:${userId}:action`;
    await redis.del(actionKey);
  }

  const playerData = (await DAL.getAllPlayerData(userId))?.player;
  if (!playerData) return;
  let now_level_id = data.Level_list.find(item => item.level_id == playerData.level_id).level_id;
  let size = this.xiuxianConfigData.work.size;
  let lingshi = size * now_level_id;
  let other_lingshi = 0;//额外的灵石
  let Time = time * 2;
  let msg = [`【${playerData.名号}】降妖归来！`];
  if (isRandom) {//随机事件预留空间
    let rand = Math.random();
    if (rand < 0.2) {
      rand = Math.trunc(rand * 10) + 40;
      other_lingshi = rand * Time;
      msg.push('\n降妖路途偶遇珍宝，额外获得灵石' + rand * Time);
    } else if (rand > 0.8) {
      rand = Math.trunc(rand * 10) + 5;
      other_lingshi = -1 * rand * Time;
      msg.push('\n由于你的疏忽,货物被人顺手牵羊,老板大发雷霆,灵石减少' + rand * Time);
    }
  }
  let get_lingshi = lingshi * Time + other_lingshi * 1.5;//最后获取到的灵石

  // 使用 DAL 更新数据
  await DAL.transaction_update(userId, (player) => {
    player.灵石 += get_lingshi;
  });

  //给出消息提示
  if (is_random) {
    msg.push('\n增加灵石' + get_lingshi);
  } else {
    msg.push('\n增加灵石' + get_lingshi);
  }

  await Notifier.notify(groupId, userId, msg.join(''), e);
}