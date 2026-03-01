// /apps/Explore/SecretPlace.js (优化版)

import data from '../../model/XiuxianData.js';
import * as DAL from '../../api/data-access.js';
import { Gulid, puppeteer, Show, plugin } from '../../api/api.js';

// 【新增】: 导入新的逻辑函数
import { enterRealm } from '../../logic/realm_logic.js';
import { getFormattedAddictionHistory, clearAddictionHistoryIfCompleted } from '../../logic/addiction_history_logic.js';

export class SecretPlace extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_SecretPlace',
      dsc: '修仙模块-探索',
      event: 'message',
      priority: 600,
      rule: [
        { reg: '^#秘境$', fnc: 'secretPlaceList' },
        { reg: '^#降临秘境.*$', fnc: 'goSecretPlace' },
        { reg: '^#沉迷秘境.*$', fnc: 'goSecretPlaceAddiction' },
        { reg: '^#禁地$', fnc: 'forbiddenAreaList' },
        { reg: '^#前往禁地.*$', fnc: 'goForbiddenArea' },
        { reg: '^#沉迷禁地.*$', fnc: 'goForbiddenAreaAddiction' },
        { reg: '^#沉迷仙境.*$', fnc: 'goFairyRealmAddiction' },
        { reg: '^#沉迷收获$', fnc: 'showAddictionHistory' },
        { reg: '^#清除沉迷记录$', fnc: 'clearAddictionHistory' },
        { reg: '^#逃离', fnc: 'giveUp' }
      ]
    });
  }

  // 预检函数
  async preCheck(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return null;
    }
    const userId = await Gulid(e.user_id.toString().replace('qg_', ''));
    if (!await DAL.existPlayer(userId)) {
      return null;
    }
    // 检查玩家是否正在执行其他操作
    const action = await DAL.getPlayerAction(userId);
    if (action) {
      const remainingTime = action.endTime - Date.now();
      if (remainingTime > 0) {
        const m = Math.floor(remainingTime / 60000);
        const s = Math.floor((remainingTime % 60000) / 1000);
        e.reply(`正在${action.action}中，剩余时间：${m > 0 ? m : 0}分${s > 0 ? s : 0}秒`);
        return null;
      }
    }
    return userId;
  }

  // --- 列表展示 ---
  async secretPlaceList(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;
    const renderData = {
      didian_list: data.didian_list,
      addres: '秘境'
    };
    const img = await this.renderList(e, renderData, 'secret_place');
    await e.reply(img);
  }

  async forbiddenAreaList(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;
    const renderData = {
      didian_list: data.forbiddenarea_list,
      addres: '禁地'
    };
    const img = await this.renderList(e, renderData, 'secret_place'); // 可复用模板
    await e.reply(img);
  }

  // 统一的列表渲染函数
  async renderList(e, data, template) {
    const dataForPuppeteer = await new Show(e).get_secret_placeData(data);
    return await puppeteer.screenshot(template, { ...dataForPuppeteer });
  }

  // --- 进入地点 ---
  async goSecretPlace(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;
    const realmName = e.msg.replace('#降临秘境', '').trim();
    // 调用统一的 enterRealm, isAddiction 为 false
    const result = await enterRealm(userId, realmName, '秘境', e, 1, false);
    e.reply(result.message);
  }

  async goForbiddenArea(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;
    const realmName = e.msg.replace('#前往禁地', '').trim();
    const result = await enterRealm(userId, realmName, '禁地', e, 1, false);
    e.reply(result.message);
  }

  async goSecretPlaceAddiction(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;
    const input = e.msg.replace('#沉迷秘境', '').trim();
    const [realmName, countStr] = input.split('*');
    const runCount = parseInt(countStr) || 1;

    // 调用统一的 enterRealm, isAddiction 为 true
    const result = await enterRealm(userId, realmName, '秘境', e, runCount, true);
    e.reply(result.message);
  }

  async goForbiddenAreaAddiction(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;
    const input = e.msg.replace('#沉迷禁地', '').trim();
    const [realmName, countStr] = input.split('*');
    const runCount = parseInt(countStr) || 1;
    const result = await enterRealm(userId, realmName, '禁地', e, runCount, true);
    e.reply(result.message);
  }

  async goFairyRealmAddiction(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;
    const input = e.msg.replace('#沉迷仙境', '').trim();
    const [realmName, countStr] = input.split('*');
    const runCount = parseInt(countStr) || 1;
    const result = await enterRealm(userId, realmName, '仙境', e, runCount, true);
    e.reply(result.message);
  }

  // --- 逃离 ---
  async giveUp(e) {
    const userId = await this.preCheck(e);
    if (!userId) return;

    const actionKey = `XinghanXiuxian:Player:${userId}:action`;
    const actionJson = await redis.get(actionKey);
    if (!actionJson) {
      e.reply('哪都没去，你逃个锤子');
      return;
    }

    const action = JSON.parse(actionJson);
    if (action.action.includes('探索')) {
      const taskPayloadString = action.taskPayloadString;
      if (taskPayloadString) {
        await redis.zRem('tasks:scheduled', taskPayloadString);
      } else {
        console.warn(`[探索逃离] 玩家 ${userId} 的状态中缺少 taskPayloadString，可能无法清理后台任务。`);
      }

      await redis.del(actionKey);
      e.reply('逃离成功！');
    } else {
      e.reply('你当前的状态无法逃离。');
    }
  }

  // --- 沉迷收获系统 ---
  async showAddictionHistory(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    const userId = await Gulid(e.user_id.toString().replace('qg_', ''));
    if (!await DAL.existPlayer(userId)) {
      return;
    }

    const historyData = await getFormattedAddictionHistory(userId);
    if (!historyData) {
      e.reply('暂无沉迷记录。使用 #沉迷秘境xxx*n 开始沉迷探索后即可查看收获。');
      return;
    }

    try {
      const dataForPuppeteer = await new Show(e).get_imgData('addiction_history', historyData);
      const img = await puppeteer.screenshot('addiction_history', { ...dataForPuppeteer });
      await e.reply(img);
    } catch (err) {
      console.error('[沉迷收获] 渲染图片失败:', err);
      // 降级为文字版
      let msg = `【沉迷收获详情】\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `沉迷地点：${historyData.location}\n`;
      msg += `地点类型：${historyData.locationType}\n`;
      msg += `探索进度：${historyData.completedRuns}/${historyData.totalRuns}\n`;
      msg += `失败次数：${historyData.failedRuns}\n`;
      msg += `获得修为：${historyData.xiuweiGained.toLocaleString()}\n`;
      msg += `获得血气：${historyData.xueqiGained.toLocaleString()}\n`;
      msg += `开始时间：${historyData.startTime}\n`;
      msg += `结束时间：${historyData.endTime}\n`;
      msg += `持续时间：${historyData.duration}\n`;
      msg += `状态：${historyData.statusText}\n`;
      if (historyData.itemsGained.length > 0) {
        msg += `获得物品：\n`;
        historyData.itemsGained.forEach((item, i) => {
          msg += `  ${i + 1}. [${item.name}] x${item.amount}\n`;
        });
      }
      msg += `━━━━━━━━━━━━━━━━━━━━━━`;
      e.reply(msg);
    }
  }

  async clearAddictionHistory(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    const userId = await Gulid(e.user_id.toString().replace('qg_', ''));
    if (!await DAL.existPlayer(userId)) {
      return;
    }

    const result = await clearAddictionHistoryIfCompleted(userId);
    e.reply(result.message);
  }
}
