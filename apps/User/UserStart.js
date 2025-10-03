import plugin from '../../../../lib/plugins/plugin.js';
import config from '../../model/Config.js';
import {
  Gulid,
  verc
} from '../../api/api.js';

import { createNewPlayerData } from '../../logic/player_init.js';
import * as DAL from '../../api/data-access.js';
import {
  transformPlayerDataForRender,
  aggregatePlayerData
} from '../../logic/player_view_logic.js';
import { processDailyCheckIn } from '../../logic/checkin_logic.js';

import {
  updatePlayerName,
  updatePlayerDeclaration,
  updatePlayerSex,
  updatePlayerAvatarFrame
} from '../../logic/player_profile.js';

import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';

export class UserStart extends plugin {
  constructor() {
    super({
      /** 功能名称 */
      name: 'UserStart',
      /** 功能描述 */
      dsc: '初始模块',
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 600,
      rule: [
        {
          reg: '^#踏入仙途$',
          fnc: 'Create_player'
        },
        {
          reg: '^#我的练气$',
          fnc: 'Show_player'
        },
        {
          reg: '^#修仙签到$',
          fnc: 'daily_gift'
        },
        {
          reg: '^#设置性别(男|女)$',
          fnc: 'setSex'
        },
        {
          reg: '^#改名.*$',
          fnc: 'changeName'
        },
        {
          reg: '^#设置道宣.*$',
          fnc: 'setDeclaration'
        },
        {
          reg: '^#设置头像框.*$',
          fnc: 'setAvatarFrame'
        }

      ]
    });
    this.xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');
  }

  async Create_player(e) {
    if (!e.isGroup) {
      e.reply('请在群聊内发送此信息');
      return;
    }

    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);

    if (usr_qq == 80000000) {
      return;
    }

    // 检查存档是否存在
    if (await DAL.existPlayer(usr_qq)) {
      await this.Show_player(e);
      return;
    }

    // 获取玩家总数
    const playerKeys = await redis.keys('XinghanXiuxian:Data:Player:*');
    const playerCount = playerKeys.length;

    // 调用创建函数
    const success = await createNewPlayerData(usr_qq, playerCount);

    // 根据结果响应用户
    if (success) {
      e.reply('你看到前方有一道光，那是通往仙途的入口...');
      // 延迟一下再显示面板，更有仪式感
      setTimeout(() => {
        this.Show_player(e);
      }, 1000);
    } else {
      e.reply('仙途之路似乎出现了些许波折，创建失败，请联系管理员。');
    }
  }

  async Show_player(e) {
    if (!verc({ e })) return;

    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);

    // 聚合所有原始数据
    const rawData = await aggregatePlayerData(usr_qq);
    if (!rawData) {
      // existPlayer 已经在聚合函数中处理了，如果返回 null，说明玩家不存在或数据有问题
      e.reply('当前数据异常，请联系管理员处理');
      return;
    }

    // 将原始数据转换为用于渲染的视图模型
    const renderData = await transformPlayerDataForRender(rawData, e);
    // 生成图片并回复
    const dataForPuppeteer = await new Show(e).get_playerData(renderData);
    const img = await puppeteer.screenshot('player', {
      ...dataForPuppeteer,
      _page: {
        deviceScaleFactor: 2 // 开启2倍超清渲染
      }
    });
    e.reply(img);
  }

  async setAvatarFrame(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);
    if (!await DAL.existPlayer(usr_qq)) {
      return;
    }

    const frameName = e.msg.replace('#设置头像框', '').trim();
    const result = await updatePlayerAvatarFrame(usr_qq, frameName);

    e.reply(result.message);
  }

  async setSex(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);
    if (!await DAL.existPlayer(usr_qq)) {
      return;
    }

    const newSex = e.msg.replace('#设置性别', '').trim();
    const result = await updatePlayerSex(usr_qq, newSex);

    e.reply(result.message);
  }

  async changeName(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);
    if (!await DAL.existPlayer(usr_qq)) {
      return;
    }

    const newName = e.msg.replace('#改名', '').trim();
    const result = await updatePlayerName(usr_qq, newName);

    e.reply(result.message);
    if (result.success) {
      // 成功后显示新面板
      await this.Show_player(e);
    }
  }

  async setDeclaration(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);
    if (!await DAL.existPlayer(usr_qq)) {
      return;
    }

    const newDeclaration = e.msg.replace('#设置道宣', '').trim();
    const result = await updatePlayerDeclaration(usr_qq, newDeclaration);

    e.reply(result.message);
    if (result.success) {
      await this.Show_player(e);
    }
  }

  async daily_gift(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);

    if (!await DAL.existPlayer(usr_qq)) {
      return;
    }

    let result = null;
    const maxRetries = 3; // 最多重试3次
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // 调用核心逻辑处理签到
      result = await processDailyCheckIn(usr_qq);

      if (result.success) {
        // 如果成功，则跳出循环
        break;
      }

      // 如果失败是因为冲突，并且还有重试机会
      if (!result.success && result.message.includes('冲突') && attempt < maxRetries) {
        logger.warn(`[签到冲突] 用户 ${usr_qq} 签到失败，正在进行第 ${attempt} 次重试...`);
        // 等待一个短暂的随机时间，避免连续冲突
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
        continue; // 继续下一次循环尝试
      }
    }

    // 根据结果响应
    if (!result.success) {
      e.reply(result.message);
      return;
    }

    const now = new Date();
    const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const calendarData = {
      // 基础日历数据
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      today: now.getDate(),

      // 每日签到数据
      checkedInDays: result.checkInData.checkedInDays,
      consecutiveDays: result.checkInData.consecutiveDays,
      dailyRewards: result.dailyRewards,

      // 累计签到数据，传递给HTML
      monthly_cumulative_days: result.cumulativeData.monthly_cumulative_days,
      claimed_monthly_rewards: result.cumulativeData.claimed_monthly_rewards,
      total_days_in_month: totalDaysInMonth,
      monthly_rewards_config: Object.values(config.getConfig('xiuxian', 'sign_in_rewards'))
    };

    // 生成并发送图片
    const dataForPuppeteer = await new Show(e).get_checkin_calendarData(calendarData);
    const img = await puppeteer.screenshot('checkin_calendar', { ...dataForPuppeteer });

    // 发送签到成功图片，并@用户
    await e.reply([segment.at(e.user_id),
      img]);
  }
}