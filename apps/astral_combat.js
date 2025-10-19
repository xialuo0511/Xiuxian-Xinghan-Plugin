import plugin from '../../../lib/plugins/plugin.js';
import * as DAL from '../api/data-access.js';
import { loadItemConfig } from '../model/ConfigLoader.js';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import Show from '../model/show.js';
import { getActivityStatus } from '../logic/fishing_logic.js';
import { runCombat } from '../logic/combat/CombatEngine.js';

const allStarSouls = loadItemConfig('star_souls.yaml');
const EVENT_KEY = 'wanxiang_tianji_2025_10';

export class astral_combat extends plugin {
  constructor() {
    super({
      name: '万象天机',
      dsc: '星魂战斗活动',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^#万象天机$/, fnc: 'showTeamStatus' },
        { reg: /^#星魂装备(\d)号\s*(.*)/, fnc: 'equipStarSoul' },
        { reg: /^#测试战斗$/, fnc: 'testCombat' }
      ]
    });
  }


  async testCombat(e) {
    if (!await this.checkActivity(e)) return true;
    // 1. 获取玩家的完整数据
    const playerData = (await DAL.getAllPlayerData(e.user_id))?.player;
    if (!playerData) {
      return e.reply('无法获取您的角色信息。', true);
    }

    // 2. 从玩家数据中提取已装备的星魂名称
    const equippedSoulNames = Object.values(playerData.equipped_star_souls || {}).filter(Boolean); // filter(Boolean) 会移除所有 null 或 undefined 的空位

    if (equippedSoulNames.length === 0) {
      return e.reply('你尚未装备任何星魂，无法开始战斗。', true);
    }

    // 3. 根据名称，从配置中找到完整的星魂数据
    const playerSouls = equippedSoulNames.map(name =>
      allStarSouls.find(s => s.name === name)
    ).filter(Boolean); // 再次过滤，以防玩家装备了不存在的星魂

    // 敌人队伍可以保持不变，或您也可以根据需要修改
    const enemyNames = ['石傀儡'];

    // 运行战斗引擎
    const result = await runCombat(playerSouls, enemyNames);

    // 渲染日志
    const renderData = {
      log: result.log,
      pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
    };

    const dataForPuppeteer = await new Show(e).get_imgData('astral_combat_log', renderData);
    const img = await puppeteer.screenshot('astral_combat_log', { ...dataForPuppeteer });
    await e.reply(img);
  }

  /**
   * 通用的活动状态检查函数
   * @param e 事件对象
   * @returns {Promise<boolean>} 活动是否正在进行
   */
  async checkActivity(e) {
    const activity = getActivityStatus(EVENT_KEY);
    if (!activity) {
      // 在活动时间外，静默返回，不响应指令
      return false;
    }
    e.activity = activity;
    return true;
  }

  async showTeamStatus(e) {
    if (!await this.checkActivity(e)) return true;

    const playerData = (await DAL.getAllPlayerData(e.user_id))?.player;
    if (!playerData) {
      return e.reply('无法获取您的角色信息。', true);
    }

    const equipped = playerData.equipped_star_souls || {};

    let teamData = [];
    for (let i = 1; i <= 4; i++) {
      const soulName = equipped[i];
      if (soulName) {
        const soulInfo = allStarSouls.find(s => s.name === soulName);
        if (soulInfo) {
          if (soulInfo.base_stats && soulInfo.base_stats.resistance !== undefined) {
            soulInfo.base_stats.resistance_percent = (soulInfo.base_stats.resistance * 100).toFixed(0) + '%';
          }
          teamData.push({ slot: i, equipped: true, ...soulInfo });
        } else {
          teamData.push({ slot: i, equipped: false, name: '数据错误' });
        }
      } else {
        teamData.push({ slot: i, equipped: false, name: '未装备' });
      }
    }

    const renderData = {
      team: teamData,
      pifu: playerData.pifu || playerData.练气皮肤,
      pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
    };


    const dataForPuppeteer = await new Show(e).get_imgData('astral_combat_status', renderData);
    const img = await puppeteer.screenshot('astral_combat_status', { ...dataForPuppeteer });
    await e.reply(img);
  }

  async equipStarSoul(e) {
    // 在每个指令的开头都进行检查
    if (!await this.checkActivity(e)) return true;
    const match = e.msg.match(/^#星魂装备(\d)号\s*(.*)/);
    const slot = parseInt(match[1]);
    const soulName = match[2].trim();

    if (slot < 1 || slot > 4) {
      return e.reply('只能装备在1-4号位哦。', true);
    }

    // 检查纳戒中是否有该星魂
    const ownedAmount = await DAL.getNajieItemAmount(e.user_id, soulName, '活动');
    if (ownedAmount < 1) {
      return e.reply(`你的纳戒中没有【${soulName}】。`, true);
    }

    // 更新玩家数据
    await DAL.transaction_update(e.user_id, (player) => {
      if (!player.equipped_star_souls) player.equipped_star_souls = {};
      player.equipped_star_souls[slot] = soulName;
    });

    await e.reply(`已将【${soulName}】装备至${slot}号位！`);
  }
}