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
        { reg: /^#钓鱼图鉴$/, fnc: 'showCodex' },
        { reg: /^#渔友商行$/, fnc: 'showFishShop' },
        { reg: /^#渔获兑换(.*)/, fnc: 'buyFromShop' }
      ]
    });
  }

  /**
   * 新增一个通用的活动状态检查函数
   * @param e 事件对象
   * @returns {Promise<boolean>} 活动是否正在进行
   */
  async checkActivity(e) {
    return fishingLogic.getActivityStatus(EVENT_KEY);

  }

  async showFishShop(e) {
    if (!await this.checkActivity(e)) return true;
    const shopData = await fishingLogic.getFishShopData(e.user_id);
    logger.mark('[商店数据诊断] 准备渲染的数据:', shopData);
    const dataForPuppeteer = await new Show(e).get_imgData('fishingShop', shopData);
    const img = await puppeteer.screenshot('fishingShop', { ...dataForPuppeteer });
    await e.reply(img);
  }

  async buyFromShop(e) {
    if (!await this.checkActivity(e)) return true;
    const itemName = e.msg.replace(/#渔获兑换/, '').trim();
    if (!itemName) {
      return e.reply('请输入要兑换的物品名称，例如：#渔获兑换 寒铁鱼竿', true);
    }
    const result = await fishingLogic.buyFromFishShop(e.user_id, itemName);
    await e.reply(result.message, true);
  }

  async showCodex(e) {
    if (!await this.checkActivity(e)) return true;
    const codexData = await fishingLogic.getAnglerCodex(e.user_id);
    const dataForPuppeteer = await new Show(e).get_imgData('fishingCodex', codexData);
    const img = await puppeteer.screenshot('fishingCodex', { ...dataForPuppeteer });
    await e.reply(img);
  }

  async showStatus(e) {
    if (!await this.checkActivity(e)) return true;
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
    if (!await this.checkActivity(e)) return true;
    const itemName = e.msg.replace(/#钓鱼竿装备/, '').trim();
    if (!itemName) return e.reply('请指定要装备的鱼竿名称。', true);
    const result = await fishingLogic.equip(e.user_id, 'rod', itemName);
    await e.reply(result.message, true);
  }

  async equipBait(e) {
    if (!await this.checkActivity(e)) return true;
    const itemName = e.msg.replace(/#鱼饵装备/, '').trim();
    if (!itemName) return e.reply('请指定要装备的鱼饵名称。', true);
    const result = await fishingLogic.equip(e.user_id, 'bait', itemName);
    await e.reply(result.message, true);
  }

  async goFish(e) {
    if (!await this.checkActivity(e)) return true;
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