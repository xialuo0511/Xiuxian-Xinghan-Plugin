import * as DAL from '../api/data-access.js';
import { loadItemConfig } from '../model/ConfigLoader.js';
import path from 'path';
import YAML from 'yaml';
import fs from 'fs';
import { foundthing } from '../apps/Xiuxian/xiuxian.js';

const configPath = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'config', 'activity_schedule.yaml');
const file = fs.readFileSync(configPath, 'utf8');
let activityConfig = YAML.parse(file);
const activities = activityConfig?.activities || [];
const allRods = loadItemConfig('fishing_rods.yaml');
const allBaits = loadItemConfig('fishing_baits.yaml');
const allCatches = loadItemConfig('fishing_items.yaml');
const fishShopConfig = loadItemConfig('fishing_shop.yaml');

/**
 * 获取渔友商行所需的数据
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getFishShopData(userId) {
  const { najie } = await DAL.getAllPlayerData(userId);
  const activityItems = najie['活动'] || [];

  // 1. 统计玩家拥有的鱼（货币）
  let ownedFish = {};
  activityItems.forEach(item => {
    // 简单假设所有渔获都可以作为货币，您也可以在这里精确指定
    ownedFish[item.name] = item.数量;
  });

  // 2. 获取玩家的购买记录
  const purchaseHistoryKey = `XinghanXiuxian:fish_shop_history:${userId}:${EVENT_KEY}`; // 按活动分别记录
  const purchaseHistory = await redis.hGetAll(purchaseHistoryKey);

  // 3. 组装商品列表
  const shopItems = fishShopConfig.map(item => ({
    ...item,
    purchased: parseInt(purchaseHistory[item.name] || '0')
  }));

  return {
    ownedFish: ownedFish,
    shopItems: shopItems
  };
}

/**
 * 从渔友商行兑换物品
 * @param {string} userId
 * @param {string} itemName
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function buyFromFishShop(userId, itemName) {
  const shopItem = fishShopConfig.find(i => i.name === itemName);
  if (!shopItem) {
    return { success: false, message: `渔友商行中并无 [${itemName}] 此物。` };
  }

  const purchaseHistoryKey = `XinghanXiuxian:fish_shop_history:${userId}:${EVENT_KEY}`;

  // 1. 检查限购
  const purchasedAmount = parseInt(await redis.hGet(purchaseHistoryKey, itemName) || '0');
  if (purchasedAmount >= shopItem.purchaseLimit) {
    return { success: false, message: `[${itemName}] 每人限购 ${shopItem.purchaseLimit} 个，你已达到上限。` };
  }

  // 2. 检查货币（鱼）是否足够
  for (const cost of shopItem.price) {
    const ownedAmount = await DAL.getNajieItemAmount(userId, cost.name, '活动');
    if (ownedAmount < cost.amount) {
      return {
        success: false,
        message: `你的 [${cost.name}] 不足，兑换需要 ${cost.amount} 个，你只有 ${ownedAmount} 个。`
      };
    }
  }

  // 3. 扣除货币（鱼）
  for (const cost of shopItem.price) {
    await DAL.updateNajieItem(userId, cost.name, '活动', -cost.amount);
  }

  // 4. 发放购买的物品
  const itemDef = await foundthing(itemName);
  if (!itemDef) {
    logger.error(`[渔友商行] 致命错误：商店物品 [${itemName}] 在物品库中不存在！`);
    // 回滚已扣除的货币
    for (const cost of shopItem.price) {
      await DAL.updateNajieItem(userId, cost.name, '活动', cost.amount);
    }
    return { success: false, message: '系统错误：商品信息不存在，请联系管理员。' };
  }
  await DAL.updateNajieItem(userId, itemName, itemDef.class, 1, itemDef);

  // 5. 更新购买记录
  await redis.hIncrBy(purchaseHistoryKey, itemName, 1);

  return { success: true, message: `恭喜！你成功兑换了 [${itemName}] x 1！` };
}

/**
 * 获取钓鱼图鉴所需的数据
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getAnglerCodex(userId) {
  const { najie } = await DAL.getAllPlayerData(userId);

  // 检查函数，用于获取纳戒中某个活动物品的数量
  const getOwnedAmount = (itemName) => {
    const category = najie['活动'];
    if (!Array.isArray(category)) return 0;
    const item = category.find(i => i && i.name === itemName);
    return item?.数量 || 0;
  };

  // 1. 处理鱼竿
  const rods = allRods.map(rod => ({
    ...rod,
    owned_amount: getOwnedAmount(rod.name)
  }));

  // 2. 处理鱼饵
  const baits = allBaits.map(bait => ({
    ...bait,
    owned_amount: getOwnedAmount(bait.name)
  }));

  // 3. 处理所有渔获
  const catches = allCatches.map(fish => ({
    ...fish,
    owned_amount: getOwnedAmount(fish.name)
  }));

  return {
    rods,
    baits,
    catches
  };
}

/**
 * 检查指定key的活动当前是否正在进行
 * @param {string} eventKey - 活动的唯一ID
 * @returns {object|null} 如果活动正在进行，则返回活动对象，否则返回null
 */
export function getActivityStatus(eventKey) {
  const activity = activities.find(a => a.eventKey === eventKey);
  if (!activity) return null;

  const now = Date.now();
  const startTime = new Date(activity.startTime).getTime();
  const endTime = new Date(activity.endTime).getTime();

  if (now >= startTime && now <= endTime) {
    return activity;
  }
  return null;
}

/**
 * 获取玩家当前的钓鱼装备信息
 * @param {string} userId
 * @returns {Promise<{rod: object|null, bait: object|null}>}
 */
export async function getFishingGear(userId) {
  const gearKey = `XinghanXiuxian:player_fishing_gear:${userId}`;
  const equipped = await redis.hGetAll(gearKey);

  const rod = allRods.find(r => r.name === equipped.rod);
  const bait = allBaits.find(b => b.name === equipped.bait);

  return { rod, bait };
}

/**
 * 装备渔具
 * @param {string} userId
 * @param {'rod' | 'bait'} itemType 装备类型
 * @param {string} itemName 物品名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function equip(userId, itemType, itemName) {
  const config = (itemType === 'rod') ? allRods : allBaits;
  const item = config.find(i => i.name === itemName);

  if (!item) {
    return { success: false, message: `不存在名为 [${itemName}] 的${itemType === 'rod' ? '鱼竿' : '鱼饵'}。` };
  }

  const ownedAmount = await DAL.getNajieItemAmount(userId, itemName, '活动');
  if (ownedAmount < 1) {
    return { success: false, message: `你的纳戒中没有 [${itemName}]。` };
  }

  const gearKey = `XinghanXiuxian:player_fishing_gear:${userId}`;
  await redis.hSet(gearKey, itemType, itemName);

  return { success: true, message: `已成功装备【${itemName}】。` };
}

/**
 * 执行钓鱼
 * @param {string} userId
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function goFishing(userId) {
  const { rod, bait } = await getFishingGear(userId);

  if (!rod || !bait) {
    const missing = [];
    if (!rod) missing.push('鱼竿');
    if (!bait) missing.push('鱼饵');
    // 特殊回复事件1：没装备
    return { success: false, message: `工欲善其事，必先利其器。你尚未装备${missing.join('和')}，对着江面徒然发呆。` };
  }

  const baitAmount = await DAL.getNajieItemAmount(userId, bait.name, '活动');
  if (baitAmount < 1) {
    return { success: false, message: `你的【${bait.name}】已经用完了，去渔友商行补充一些吧。` };
  }

  // 消耗一个鱼饵
  await DAL.updateNajieItem(userId, bait.name, '活动', -1);

  // 掷骰子判断是否成功
  if (Math.random() > rod.success_rate) {
    // 特殊回复事件2：失败
    const failReplies = [
      `鱼线动了一下，你猛地一提，结果只钓上来一只破旧的草鞋...`,
      `你在江边打了个盹，醒来时发现鱼饵已被不知名的小鱼偷吃干净了。`,
      `一条大鱼上钩了！你与之搏斗了半天，结果线断鱼跑，空欢喜一场。`
    ];
    const randomReply = failReplies[Math.floor(Math.random() * failReplies.length)];
    return { success: false, message: randomReply };
  }

  // --- 钓鱼成功 ---
  let loot = [];
  for (let i = 0; i < rod.yield; i++) {
    // 从鱼饵的物品池中随机抽取一个
    const randomLootName = bait.item_pool[Math.floor(Math.random() * bait.item_pool.length)];
    loot.push(randomLootName);
  }

  // 发放物品
  let lootMessage = '收获颇丰！你钓上了：';
  for (const itemName of loot) {
    const itemDef = await foundthing(itemName);
    if (itemDef) {
      await DAL.updateNajieItem(userId, itemName, itemDef.class, 1, itemDef);
      lootMessage += `\n  - [${itemName}] x 1`;
    }
  }

  return { success: true, message: lootMessage };
}