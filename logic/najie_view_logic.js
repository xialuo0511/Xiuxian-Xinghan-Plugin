import * as DAL from '../api/data-access.js';
import config from '../model/Config.js';
import { pinyin } from 'pinyin-pro';
import path from 'path';
import fs from 'fs'; // 引入拼音库
import YAML from 'yaml';
import { loadItemConfig } from '../model/ConfigLoader.js';


const versionData = config.getdefSet('version', 'version');

/**
 * 进度条渲染辅助函数
 */
function Strand(now, max) {
  if (max == 0) return { style: 'style=width:0%', num: 0 };
  let num = (now / max * 100).toFixed(0);
  if (num > 100) num = 100;
  if (num < 0) num = 0;
  return {
    style: `style=width:${num}%`,
    num: num
  };
}

/**
 * 将纳戒内的所有物品筛选、整合并分页
 */
async function paginateItems(najie, options = {}) {
  const {
    searchType = 'all',
    searchTerm = '',
    page = 1,
    pageSize = 20
  } = options;

  const defaultColors = loadItemConfig('category_colors.yaml');
  let colorMap = {};
  defaultColors.forEach(item => {
    colorMap[item.category] = item.color;
  });

  const settingsKey = `XinghanXiuxian:player_settings:${userId}`;
  const userColorsJson = await redis.hGet(settingsKey, 'najie_category_colors');
  if (userColorsJson) {
    try {
      const userColors = JSON.parse(userColorsJson);
      Object.assign(colorMap, userColors);
    } catch (e) {
    }
  }

  const configPath = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'config', 'activity_schedule.yaml');
  const file = fs.readFileSync(configPath, 'utf8');
  let activitySchedule = YAML.parse(file);

  let allItems = [];
  for (const category in najie) {
    const items = najie[category];
    if (Array.isArray(items)) {
      items.forEach(item => {
        if (item && item.name) {
          let enhancedItem = { ...item, category: category };
          if (item.eventKey && activitySchedule?.activities) {
            const activity = activitySchedule.activities.find(a => a.eventKey === item.eventKey);
            if (activity) {
              enhancedItem.endTime = activity.endTime; // 将活动结束时间附加到物品上
            }
          }
          allItems.push(enhancedItem);
        }
      });
    }
  }

  let filteredItems = allItems;

  if (searchType === 'category') {
    filteredItems = allItems.filter(item => item.category === searchTerm);
  } else if (searchType === 'name' && searchTerm) {
    const searchTermLower = searchTerm.toLowerCase();
    filteredItems = allItems.filter(item => {
      if (!item.name) return false;

      // 1. 获取拼音首字母
      const pinyinInitials = pinyin(item.name, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '').toLowerCase();

      // 2. 获取完整拼音
      const fullPinyin = pinyin(item.name, { toneType: 'none' }).replace(/\s/g, '').toLowerCase();

      // 3. 同时检查首字母、完整拼音、中文名是否包含搜索词
      return pinyinInitials.includes(searchTermLower) ||
        fullPinyin.includes(searchTermLower) ||
        item.name.toLowerCase().includes(searchTermLower);
    });
  }

  if (searchType === 'name') {
    if (filteredItems.length === 0) {
      return { status: 'not_found' };
    }
    if (filteredItems.length === 1) {
      return { status: 'single_item', item: filteredItems[0] };
    }
  }

  const totalItems = filteredItems.length;
  if (totalItems === 0 && searchType !== 'name') { // 如果不是名称搜索且结果为空
    return { status: 'empty' };
  }

  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const currentPage = Math.min(page, totalPages) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + pageSize);

  return {
    status: 'success',
    items: paginatedItems,
    pagination: {
      currentPage: currentPage,
      totalPages: totalPages,
      totalItems: totalItems
    }
  };
}

/**
 * 为纳戒视图准备最终的渲染数据
 */
export async function prepareNajieRenderData(userId, options = {}) {
  const playerAllData = await DAL.getAllPlayerData(userId);
  if (!playerAllData) {
    return { status: 'error', message: '无法获取玩家信息。' };
  }

  const { player, najie } = playerAllData;
  const paginatedData = paginateItems(najie, options);

  if (paginatedData.status !== 'success') {
    if (paginatedData.status === 'empty') {
      paginatedData.items = [];
      paginatedData.pagination = { currentPage: 1, totalPages: 1, totalItems: 0 };
    } else {
      return paginatedData;
    }
  }

  return {
    status: 'success',
    renderData: {
      pifu: player.练气皮肤,
      user_id: userId,
      player: player,
      najie: najie,
      paginatedItems: paginatedData.items,
      pagination: paginatedData.pagination,
      strand_hp: Strand(player.当前血量, player.血量上限),
      strand_lingshi: Strand(najie.灵石, najie.灵石上限),
      修仙版本: versionData
    }
  };
}