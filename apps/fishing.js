import plugin from '../../../lib/plugins/plugin.js';
import * as fishingLogic from '../logic/fishing_logic.js';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import Show from '../model/show.js';

const EVENT_KEY = 'hanjiang_fishing_2025_10'; // 本次活动的唯一ID

export class fishing extends plugin {
  constructor() {
    super({
      name: '寒江独钓',
      dsc: '钓鱼活动玩法',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^#寒江独钓$/, fnc: 'showStatus' },
        { reg: /^#钓鱼竿装备(.*)/, fnc: 'equipRod' },
        { reg: /^#鱼饵装备(.*)/, fnc: 'equipBait' },
        { reg: /^#钓鱼$/, fnc: 'goFish' },
        { reg: /^#钓鱼图鉴$/, fnc: 'showCodex' }
      ]
    });
  }

  async showCodex(e) {
    const codexData = await fishingLogic.getAnglerCodex(e.user_id);
    const dataForPuppeteer = await new Show(e).get_imgData('fishingCodex', codexData);
    const img = await puppeteer.screenshot('fishingCodex', { ...dataForPuppeteer });
    await e.reply(img);
  }

  // 所有指令前的通用活动检查
  async before(e) {
    const activity = fishingLogic.getActivityStatus(EVENT_KEY);
    if (!activity) {
      e.reply('【寒江独钓】活动尚未开启或已经结束。', true);
      return false; // 返回false可以中断后续指令的执行
    }
    e.activity = activity; // 将活动信息挂载到e对象上，方便后续使用
    return true;
  }

  async showStatus(e) {
    const gear = await fishingLogic.getFishingGear(e.user_id);
    const dataForRender = {
      ...gear,
      activity: fishingLogic.getActivityStatus(EVENT_KEY)
    };
    const dataForPuppeteer = await new Show(e).get_imgData('fishingStatus', dataForRender);
    const img = await puppeteer.screenshot('fishingStatus', { ...dataForPuppeteer });
    await e.reply(img);
  }

  async equipRod(e) {
    const itemName = e.msg.replace(/#钓鱼竿装备/, '').trim();
    if (!itemName) return e.reply('请指定要装备的鱼竿名称。', true);
    const result = await fishingLogic.equip(e.user_id, 'rod', itemName);
    await e.reply(result.message, true);
  }

  async equipBait(e) {
    const itemName = e.msg.replace(/#鱼饵装备/, '').trim();
    if (!itemName) return e.reply('请指定要装备的鱼饵名称。', true);
    const result = await fishingLogic.equip(e.user_id, 'bait', itemName);
    await e.reply(result.message, true);
  }

  async goFish(e) {
    // 增加一个简单的冷却，例如10秒
    const cdKey = `XinghanXiuxian:fishing_cd:${e.user_id}`;
    if (await redis.get(cdKey)) {
      return e.reply('收竿亦有道，不可操之过急。', true);
    }
    await redis.set(cdKey, '1', { EX: 10 });

    const result = await fishingLogic.goFishing(e.user_id);
    await e.reply(result.message, true);
  }
}