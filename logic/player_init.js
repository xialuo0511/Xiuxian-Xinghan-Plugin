import * as DAL from '../api/data-access.js';
import { Add_HP, get_random_talent } from '../apps/Xiuxian/xiuxian.js';
import data from '../model/XiuxianData.js';

/**
 * 默认的玩家核心数据结构
 */
const DEFAULT_PLAYER_DATA = {
  'sex': 0,
  '宣言': '这个人很懒还没有写',
  'level_id': 1,
  'Physique_id': 1,
  'race': 1,
  '修为': 1,
  '血气': 1,
  '灵石': 10000,
  '神石': 0,
  'favorability': 0,
  'breakthrough': false,
  'linggen': [],
  'linggenshow': 1,
  '学习的功法': [],
  '修炼效率提升': 0,
  '连续签到天数': 0,
  '攻击加成': 0,
  '防御加成': 0,
  '生命加成': 0,
  'power_place': 1,
  '当前血量': 8000,
  'lunhui': 0,
  'lunhuiBH': 0,
  '轮回点': 10,
  'occupation': [],
  'occupation_level': 1,
  'daofaxianshu': 0,
  'daofaxianshu_endtime': 0,
  '镇妖塔层数': 0,
  '神魄段数': 0,
  '魔道值': 0,
  '饱食度': 0,
  '热量': 0,
  '仙宠': [],
  '练气皮肤': 0,
  '装备皮肤': 0,
  '幸运': data.necklace_list.find(item => item.name == '幸运儿').加成,
  '熔炉': 0,
  '附魔台': 0,
  '书架': 0,
  '师徒任务阶段': 0,
  '师徒积分': 0,
  '副职': {
    '职业名': [],
    '职业经验': 0,
    '职业等级': 1
  },
  'all_touxiangkuang': [data.Touxiang_list.find(item => item.name == '默认头像框')],
  'zb_touxiangkuang': [data.Touxiang_list.find(item => item.name == '默认头像框')]
};

/**
 * 默认的玩家装备结构
 */
const DEFAULT_EQUIPMENT_DATA = {
  '武器': data.wuqi_list.find(item => item.name == '烂铁匕首'),
  '护具': data.huju_list.find(item => item.name == '破铜护具'),
  '法宝': data.fabao_list.find(item => item.name == '廉价炮仗'),
  '项链': data.necklace_list.find(item => item.name == '幸运儿')
};

/**
 * 默认的玩家纳戒结构
 */
const DEFAULT_NAJIE_DATA = {
  '等级': 1,
  '灵石上限': 5000,
  '灵石': 0,
  '装备': [],
  '丹药': [],
  '道具': [],
  '功法': [],
  '草药': [],
  '材料': [],
  '食材': [],
  '盒子': [],
  '仙宠': [],
  '仙宠口粮': []
};

/**
 * 创建并初始化一个全新的玩家
 * @param {string} userId 玩家QQ
 * @param {string} userAvatar 玩家头像
 * @param {number} totalPlayers 当前玩家总数
 * @returns {Promise<boolean>} 是否创建成功
 */
export async function createNewPlayerData(userId, totalPlayers) {
  try {
    const talent = await get_random_talent();
    const n = totalPlayers + 1;

    // 使用 ... 展开操作符来合并默认结构和动态数据
    const newPlayer = {
      ...DEFAULT_PLAYER_DATA,
      'id': userId,
      '名号': `路人甲${n}号`,
      '灵根': talent,
      '修炼效率提升': talent.eff
    };

    const newEquipment = { ...DEFAULT_EQUIPMENT_DATA };
    const newNajie = { ...DEFAULT_NAJIE_DATA };

    // 使用 Promise.all 并发保存数据，提高效率
    await Promise.all([
      DAL.savePlayer(userId, newPlayer),
      DAL.saveEquipment(userId, newEquipment),
      DAL.saveNajie(userId, newNajie)
    ]);

    // 最后回血
    await Add_HP(userId, 999999);

    return true;
  } catch (error) {
    console.error(`[创建玩家失败] User: ${userId}`, error);
    return false;
  }
}