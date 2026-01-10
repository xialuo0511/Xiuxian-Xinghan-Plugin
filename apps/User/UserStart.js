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
import * as partnerLogic from '../../logic/partner_logic.js';
import { loadItemConfig } from '../../model/ConfigLoader.js';

const collaborativeSigninConfig = loadItemConfig('collaborative_signin.yaml');

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

    // 加载玩家的皮肤配置
    const SkinLogic = await import('../../logic/skin_logic.js');
    const skinConfig = await SkinLogic.GetPlayerCurrentSkin(usr_qq);
    console.log(`[SkinDebug] User: ${usr_qq}, Skin: ${skinConfig?.id}, Name: ${skinConfig?.name}`);
    renderData.skinConfig = skinConfig;

    // 生成皮肤CSS样式块
    if (skinConfig && skinConfig.colors) {
      const c = skinConfig.colors;
      renderData.skinStyle = `<style>
      :root {
        --skin-primary: ${c.primary || '#6a3906'};
        --skin-secondary: ${c.secondary || '#a88763'};
        --skin-background: ${c.background || 'rgba(253, 250, 245, 0.88)'};
        --skin-text: ${c.text || '#4a2c1a'};
        --skin-border: ${c.border || '#d2b48c'};
        --skin-accent: ${c.accent || '#7a5533'};
      }
      </style>`;
    } else {
      renderData.skinStyle = '';
    }

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
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);

    if (!await DAL.existPlayer(usr_qq)) {
      return;
    }

    const result = await processDailyCheckIn(usr_qq);

    if (!result.success) {
      return e.reply(result.message);
    }

    const now = new Date();
    const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const personalRewardsConfig = loadItemConfig('sign_in_rewards.yaml');

    const calendarData = {
      // 基础日历数据
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      today: now.getDate(),
      checkedInDays: result.checkInData.checkedInDays,
      consecutiveDays: result.checkInData.consecutiveDays,
      dailyRewards: result.dailyRewards,

      personal_progress: {
        count: result.cumulativeData.monthly_cumulative_days,
        total_days_in_month: totalDaysInMonth,
        tiers: personalRewardsConfig.map(tier => ({
          ...tier,
          isClaimed: result.cumulativeData.claimed_monthly_rewards.includes(tier.days),
          position: (tier.days / totalDaysInMonth) * 100
        }))
      },
      extraRewardsInfo: result.extraRewardsInfo,

      show_coop_signin: false
    };

    // 检查并添加协同签到数据
    const partnerId = await partnerLogic.getPartnerId(usr_qq);
    if (partnerId) {
      const relationshipKey = partnerLogic.getRelationshipKey(usr_qq, partnerId);
      const partnerLevel = parseInt(await redis.hGet(relationshipKey, 'level') || '0');

      if (partnerLevel >= 2) {
        const yyyymm = `${now.getFullYear()}-${now.getMonth() + 1}`;
        const monthlyProgressKey = `XinghanXiuxian:co_signin:${yyyymm}:${relationshipKey}`;
        const coopData = await redis.hGetAll(monthlyProgressKey);
        const claimedTiers = JSON.parse(coopData.claimed || '[]');

        calendarData.show_coop_signin = true;
        calendarData.coop_progress = {
          count: parseInt(coopData.count || '0'),
          total_days_in_month: totalDaysInMonth,
          tiers: collaborativeSigninConfig.map(tier => ({
            ...tier,
            isClaimed: claimedTiers.includes(tier.days),
            position: (tier.days / totalDaysInMonth) * 100
          }))
        };
      }
    }

    // 生成并发送图片
    const dataForPuppeteer = await new Show(e).get_checkin_calendarData(calendarData);
    const img = await puppeteer.screenshot('checkin_calendar', {
      ...dataForPuppeteer,
      _page: { deviceScaleFactor: 2 }
    });

    await e.reply([segment.at(e.user_id),
      img]);
  }
}