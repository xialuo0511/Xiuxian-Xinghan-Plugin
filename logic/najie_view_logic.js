import * as DAL from '../api/data-access.js';
import config from '../model/Config.js';
import { pinyin } from 'pinyin-pro';

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
 * @param {object} najie - 原始纳戒数据
 * @param {object} options - 包含搜索和分页的选项
 * @returns {object}
 */
function paginateItems(najie, options = {}) {
  const {
    searchType = 'all',
    searchTerm = '',
    page = 1,
    pageSize = 20 // 您可以根据模板调整每页数量
  } = options;

  let allItems = [];
  // 您的扁平化逻辑非常棒，我们直接复用
  for (const category in najie) {
    const items = najie[category];
    if (Array.isArray(items)) {
      items.forEach(item => {
        if (item && item.name) { // 增加一个健壮性检查
          allItems.push({ ...item, category: category });
        }
      });
    }
  }

  let filteredItems = allItems;

  // 筛选逻辑
  if (searchType === 'category') {
    filteredItems = allItems.filter(item => item.category === searchTerm);
  } else if (searchType === 'name') {
    const searchTermLower = searchTerm.toLowerCase();
    filteredItems = allItems.filter(item => {
      if (!item.name) return false;
      const pinyinInitials = pinyin(item.name, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '').toLowerCase();
      return pinyinInitials.includes(searchTermLower) || item.name.includes(searchTerm); // 同时支持首字母和模糊搜索
    });
  }

  // 如果按名称搜索，处理特殊返回情况
  if (searchType === 'name') {
    if (filteredItems.length === 0) {
      return { status: 'not_found' };
    }
    if (filteredItems.length === 1) {
      return { status: 'single_item', item: filteredItems[0] };
    }
  }

  const totalItems = filteredItems.length;
  // 如果没有任何物品（即使不过滤），也返回一个空状态
  if (totalItems === 0) {
    return { status: 'empty' };
  }

  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const currentPage = Math.min(page, totalPages) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + pageSize);

  return {
    status: 'success', // 表示成功，需要渲染图片
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
 * @param {string} userId - 玩家ID
 * @param {object} options - 搜索和分页选项
 * @returns {Promise<object|null>}
 */
export async function prepareNajieRenderData(userId, options = {}) {
  const playerAllData = await DAL.getAllPlayerData(userId);
  if (!playerAllData) {
    return { status: 'error', message: '无法获取玩家信息。' };
  }

  const { player, najie } = playerAllData;
  const paginatedData = paginateItems(najie, options);

  // 直接透传 paginateItems 返回的状态
  if (paginatedData.status !== 'success') {
    if (paginatedData.status === 'empty') {
      // 如果纳戒为空，我们仍然希望显示一个空的面板
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
