import plugin from '../../../lib/plugins/plugin.js';
import * as DAL from '../api/data-access.js';
import { loadItemConfig } from '../model/ConfigLoader.js';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import Show from '../model/show.js';
import { getActivityStatus } from '../logic/fishing_logic.js';

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
        { reg: /^#星魂装备(\d)号\s*(.*)/, fnc: 'equipStarSoul' }
      ]
    });
  }

  /**
   * 通用的活动状态检查函数
   * @param e 事件对象
   * @returns {Promise<boolean>} 活动是否正在进行
   */
  async checkActivity(e) {
    // 复用我们在 fishing_logic.js 中已经写好的函数
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

    logger.mark('--- [万象天机-读取诊断] ---');
    logger.mark('1. 从数据库读取到的 player.equipped_star_souls 原始内容:');
    console.log(playerData.equipped_star_souls);

    const equipped = playerData.equipped_star_souls || {};

    let teamData = [];
    for (let i = 1; i <= 4; i++) {
      const soulName = equipped[i];
      if (soulName) {
        const soulInfo = allStarSouls.find(s => s.name === soulName);
        teamData.push({ slot: i, equipped: true, ...soulInfo });
      } else {
        teamData.push({ slot: i, equipped: false, name: '未装备' });
      }
    }

    logger.mark('2. 准备传递给前端模板的 teamData 数组:');
    console.log(teamData);
    logger.mark('--- [诊断结束] ---');

    const renderData = {
      team: teamData,
      pifu: playerData.pifu,
      pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
    };
    const dataForPuppeteer = await new Show(e).get_imgData('astral_combat_status', teamData);
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