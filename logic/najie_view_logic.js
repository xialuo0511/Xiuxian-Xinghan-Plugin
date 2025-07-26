import * as DAL from '../api/data-access.js';
import config from '../model/Config.js';

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
 * 将纳戒内的所有物品整合并分页
 * @param {object} najie - 原始纳戒数据
 * @param {number} page - 当前页码
 * @param {number} pageSize - 每页数量
 * @returns {object}
 */
function paginateItems(najie, page = 1, pageSize = 20) {
  const itemCategories = {
    '装备': najie.装备, '丹药': najie.丹药, '道具': najie.道具,
    '功法': najie.功法, '草药': najie.草药, '材料': najie.材料,
    '食材': najie.食材, '盒子': najie.盒子, '仙宠': najie.仙宠,
    '仙宠口粮': najie.仙宠口粮
  };

  let allItems = [];
  for (const category in itemCategories) {
    if (itemCategories[category] && itemCategories[category].length > 0) {
      itemCategories[category].forEach(item => {
        // 为每个物品添加一个分类属性，方便模板显示
        allItems.push({ ...item, category: category });
      });
    }
  }

  const totalItems = allItems.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const currentPage = Math.min(page, totalPages) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedItems = allItems.slice(startIndex, startIndex + pageSize);

  return {
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
 * @param {number} page - 请求的页码
 * @returns {Promise<object|null>}
 */
export async function prepareNajieRenderData(userId, page = 1) {
  const playerAllData = await DAL.getAllPlayerData(userId);
  if (!playerAllData) {
    return null;
  }

  const { player, najie } = playerAllData;
  const paginatedData = paginateItems(najie, page);

  return {
    pifu: player.练气皮肤,
    user_id: userId,
    player: player,
    najie: najie, // 原始najie数据用于显示等级和储量

    // 分页后的物品数据
    paginatedItems: paginatedData.items,
    pagination: paginatedData.pagination,

    // 顶部信息条
    strand_hp: Strand(player.当前血量, player.血量上限),
    strand_lingshi: Strand(najie.灵石, najie.灵石上限),

    修仙版本: versionData
  };
}
