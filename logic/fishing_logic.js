import * as DAL from '../api/data-access.js';
import { loadItemConfig } from '../model/ConfigLoader.js';
import { redisClient } from '../api/redis.js';
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
const catchableItemNames = new Set(allCatches.map(c => c.name));

const EVENT_KEY = 'hanjiang_fishing_2025_10';

/**
 * 获取渔友商行所需的数据
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getFishShopData(userId) {
  const playerData = await DAL.getAllPlayerData(userId);
  if (!playerData || !playerData.najie) {
    logger.warn(`[渔友商行] 未能获取到玩家 ${userId} 的纳戒数据。`);
    return {
      ownedFish: {},
      hasOwnedFish: false,
      shopItems: []
    };
  }

  const activityItems = playerData.najie['活动'] || [];

  let ownedFish = {};
  activityItems.forEach(item => {
    if (catchableItemNames.has(item.name)) {
      ownedFish[item.name] = item.数量;
    }
  });

  const purchaseHistoryKey = `XinghanXiuxian:fish_shop_history:${userId}:${EVENT_KEY}`;
  const purchaseHistory = await redisClient.hGetAll(purchaseHistoryKey);

  const shopItems = fishShopConfig.map(item => {
    const enhancedPrice = item.price.map(cost => {
       const found = activityItems.find(i => i.name === cost.name);
       const owned = found ? found.数量 : 0;
       return { ...cost, owned };
    });

    return {
      ...item,
      price: enhancedPrice,
      purchased: parseInt(purchaseHistory[item.name] || '0')
    };
  });

  return {
    ownedFish: ownedFish,
    hasOwnedFish: Object.keys(ownedFish).length > 0,
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
  const purchasedAmount = parseInt(await redisClient.hGet(purchaseHistoryKey, itemName) || '0');
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
  await redisClient.hIncrBy(purchaseHistoryKey, itemName, 1);

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
 * 【升级版】获取玩家当前的钓鱼状态信息（渔具及鱼饵数量）
 * @param {string} userId
 * @returns {Promise<{rod: object|null, bait: object|null, bait_amount: number}>}
 */
export async function getFishingStatus(userId) {
  const gearKey = `XinghanXiuxian:player_fishing_gear:${userId}`;
  const equipped = await redisClient.hGetAll(gearKey);

  const rod = allRods.find(r => r.name === equipped.rod);
  const bait = allBaits.find(b => b.name === equipped.bait);

  let baitAmount = 0;
  // 【核心修改】如果玩家已装备鱼饵，则查询其在纳戒中的数量
  if (bait) {
    baitAmount = await DAL.getNajieItemAmount(userId, bait.name, '活动');
  }

  // 获取今日秘境鱼饵掉落情况
  const today = new Date().toISOString().slice(0, 10);
  const dropLimitKey = `XinghanXiuxian:secret_place_bait_drops:${userId}:${today}`;
  const dailyDrops = [];
  const dropsConfig = [
    { name: '极寒冰蚕', dailyCap: 5 },
    { name: '妖兽内丹碎片', dailyCap: 5 },
    { name: '万灵诱引散', dailyCap: 5 }
  ];

  for (const baitItem of dropsConfig) {
      const current = parseInt(await redisClient.hGet(dropLimitKey, baitItem.name) || '0');
      dailyDrops.push({ name: baitItem.name, current, max: baitItem.dailyCap });
  }

  return {
    rod,
    bait,
    bait_amount: baitAmount, // 将数量也一并返回
    daily_drops: dailyDrops
  };
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
  await redisClient.hSet(gearKey, itemType, itemName);

  return { success: true, message: `已成功装备【${itemName}】。` };
}

/**
 * 执行钓鱼
 * @param {string} userId
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function goFishing(userId) {
  const { rod, bait } = await getFishingStatus(userId);

  if (!rod || !bait) {
    const missing = [];
    if (!rod) missing.push('鱼竿');
    if (!bait) missing.push('鱼饵');
    // 特殊回复事件1：没装备
    return { success: false, message: `工欲善其事，必先利其器。你尚未装备${missing.join('和')}，对着江面徒然发呆。` };
  }

  const baitAmount = await DAL.getNajieItemAmount(userId, bait.name, '活动');
  if (baitAmount < 1) {
    return { success: false, message: `你的【${bait.name}】已经用完了，可通过【修仙签到】或【秘境探索】获取。` };
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


/**
 * 检查秘境探索中是否掉落鱼饵
 * @param {string} userId
 * @param {string} eventKey 关联的活动key，用于检查活动状态
 * @returns {Promise<string>} 掉落信息消息
 */
export async function checkSecretPlaceBaitDrops(userId, eventKey) {
  const activity = getActivityStatus(eventKey);
  if (!activity) {
    return ''; // 活动未开启，不掉落
  }

  const drops = [
    { name: '极寒冰蚕', chance: 0.25, dailyCap: 5 },
    { name: '妖兽内丹碎片', chance: 0.15, dailyCap: 5 },
    { name: '万灵诱引散', chance: 0.05, dailyCap: 5 }
  ];

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dropLimitKey = `XinghanXiuxian:secret_place_bait_drops:${userId}:${today}`;

  let dropMessages = [];

  for (const bait of drops) {
    // 获取玩家今日已获得该鱼饵的数量
    const currentDrops = parseInt(await redisClient.hGet(dropLimitKey, bait.name) || '0');

    if (currentDrops < bait.dailyCap && Math.random() < bait.chance) {
      // 达到上限前，且概率命中
      const itemDef = await foundthing(bait.name);
      if (itemDef) {
        await DAL.updateNajieItem(userId, bait.name, itemDef.class, 1, itemDef);
        await redisClient.hIncrBy(dropLimitKey, bait.name, 1);
        dropMessages.push(`你意外获得了【${bait.name}】x1！(今日已获得${currentDrops + 1}/${bait.dailyCap})`);
      } else {
        logger.error(`[秘境鱼饵掉落] 致命错误：鱼饵 [${bait.name}] 在物品库中不存在！`);
      }
    }
  }

  return dropMessages.join('\n');
}

/**
 * 为首次参与钓鱼活动的玩家发放初始奖励
 * @param {string} userId
 * @param {string} eventKey
 * @returns {Promise<string|null>} 如果成功发放奖励，则返回提示消息，否则返回null
 */
export async function grantFirstTimeBonus(userId, eventKey) {
  const bonusKey = `XinghanXiuxian:fishing_bonus:${eventKey}:${userId}`;

  // 使用 redis.set 的 NX 模式，这是一个原子操作，能保证只成功设置一次
  const wasSet = await redisClient.set(bonusKey, 'true', { NX: true });

  if (wasSet) {
    // 如果设置成功，说明是第一次
    const rodName = '绿竹鱼竿';
    const rodDef = await foundthing(rodName);
    if (rodDef) {
      await DAL.updateNajieItem(userId, rodName, '活动', 1, rodDef);
      return `初次临江，仙缘已至。你获得了【${rodName}】x1，开启你的垂钓之旅吧！`;
    }
  }

  return null; // 如果不是第一次，或发放失败，则不返回任何消息
}