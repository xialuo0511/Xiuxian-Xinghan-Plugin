import * as DAL from '../api/data-access.js';
import {
  Read_qinmidu,
  isNotNull
} from '../apps/Xiuxian/xiuxian.js';
import data from '../model/XiuxianData.js';
import {
  GetPower,
  bigNumberTransform
} from '../apps/ShowImeg/showData.js';
import config from '../model/Config.js';

const versionData = config.getdefSet('version', 'version');

/**
 * 进度条渲染辅助函数
 * @param {Number} now 当前值
 * @param {Number} max 最大值
 * @returns {object}
 */
function Strand(now, max) {
  let num = (now / max * 100).toFixed(0);
  if (num > 100) num = 100;
  return {
    style: `style=width:${num}%`,
    num: num
  };
}

/**
 * 负责从所有数据源收集渲染面板所需的原始数据
 * @param {string} userId 玩家QQ
 * @returns {Promise<object|null>}
 */
export async function aggregatePlayerData(userId) {
  if (!await DAL.existPlayer(userId)) {
    return null;
  }

  // 并发获取所有需要的数据，提高效率
  const [playerAllData, currentAction, qinmiduData, dingjixianshi] = await Promise.all([
    DAL.getAllPlayerData(userId),
    DAL.getPlayerAction(userId),
    Read_qinmidu().catch(() => []), // 如果读取失败则返回空数组
    redis.get(`xiuxian:player:${userId}:dingjixianshi`).catch(() => 0)
  ]);

  if (!playerAllData) {
    return null;
  }

  return {
    player: playerAllData.player,
    equipment: playerAllData.equipment,
    najie: playerAllData.najie,
    action: currentAction,
    qinmidu: qinmiduData,
    dingjixianshi: dingjixianshi || 0
  };
}

/**
 * 负责将原始数据计算并格式化为最终用于渲染的视图模型
 * @param {object} rawData - 从 aggregatePlayerData 获取的原始数据
 * @param {object} e - 消息事件对象
 * @returns {object} - 最终传递给 puppeteer 的数据对象
 */
export async function transformPlayerDataForRender(rawData, e) {
  const { player, equipment, najie, action, qinmidu, dingjixianshi } = rawData;
  const usr_qq = player.id;

  // 状态
  let status = '空闲';
  if (action) {
    let m = Math.floor((action.endTime - Date.now()) / 60000);
    let s = Math.floor(((action.endTime - Date.now()) % 60000) / 1000);
    status = `${action.action}(剩余时间:${m}分${s}秒)`;
  }

  // 道法仙术
  let daofa = '未购买';
  const now_Time = Date.now();
  if (player.daofaxianshu > 0) {
    if (player.daofaxianshu_endtime > now_Time) {
      const remaining = player.daofaxianshu_endtime - now_Time;
      const days = Math.floor(remaining / (24 * 3600 * 1000));
      daofa = days > 0 ? `剩余时长:${days}日` : `剩余时长:${new Date(remaining).toISOString().substr(11, 8)}`;
    } else {
      daofa = '已过期';
    }
  }

  // 灵根显示逻辑
  let displayLinggen = { ...player.灵根 };
  let talentEff = player.修炼效率提升;
  if (player.linggenshow !== 0) {
    displayLinggen = { type: '无', name: '未知', 法球倍率: 0 };
    talentEff = 0;
  }

  // 境界信息
  const levelInfo = data.Level_list.find(item => item.level_id == player.level_id);
  const levelMaxInfo = data.LevelMax_list.find(item => item.level_id == player.Physique_id);

  // 装备评级
  const pinji = ['劣', '普', '优', '精', '极', '绝', '顶'];
  const 武器评级 = isNotNull(equipment.武器.pinji) ? pinji[equipment.武器.pinji] : '无';
  const 护具评级 = isNotNull(equipment.护具.pinji) ? pinji[equipment.护具.pinji] : '无';
  const 法宝评级 = isNotNull(equipment.法宝.pinji) ? pinji[equipment.法宝.pinji] : '无';

  // 婚姻状况
  let hunyin = '未知';
  const marriage = qinmidu.find(item => (item.QQ_A == usr_qq || item.QQ_B == usr_qq) && item.婚姻 > 0);
  if (marriage) {
    const partnerId = marriage.QQ_A == usr_qq ? marriage.QQ_B : marriage.QQ_A;
    const partnerData = (await DAL.getAllPlayerData(partnerId))?.player;
    if (partnerData) {
      hunyin = partnerData.名号;
    }
  }

  return {
    // --- 基础信息 ---
    user_id: usr_qq,
    nickname: player.名号,
    head_pic: e.member?.getAvatarUrl() || `https://q1.qlogo.cn/g?b=qq&s=0&nk=${usr_qq}`,
    declaration: player.宣言 || '这个人很懒什么都没写',
    player_action: status,
    pifu: player.练气皮肤,
    touxiang: player.zb_touxiangkuang[0].id,

    // --- 核心数据 ---
    lingshi: bigNumberTransform(player.灵石),
    dingjixianshi: dingjixianshi,
    player_maxHP: player.血量上限,
    player_nowHP: player.当前血量,

    // --- 境界与修为 ---
    rank_lianqi: levelInfo.level,
    exp: player.修为,
    expmax_lianqi: levelInfo.exp,
    rank_llianti: levelMaxInfo.level,
    exp2: player.血气,
    expmax_llianti: levelMaxInfo.exp,

    // --- 战斗与属性 ---
    PowerMini: bigNumberTransform(GetPower(player.攻击, player.防御, player.血量上限, player.暴击率)),
    player_atk: player.攻击,
    player_def: player.防御,
    player_bao: `${(player.暴击率 * 100).toFixed(2)}%`,
    player_bao2: player.暴击伤害,

    // --- 灵根与功法 ---
    linggen: displayLinggen,
    talent: (talentEff * 100).toFixed(2),
    learned_gongfa: player.学习的功法,

    // --- 装备信息 ---
    equipment: equipment,
    arms: equipment.武器,
    armor: equipment.护具,
    treasure: equipment.法宝,
    武器评级, 护具评级, 法宝评级,

    // --- 社交与其他 ---
    this_association: player.宗门 || { 宗门名称: '无', 职位: '无' },
    婚姻状况: hunyin,
    daofa,

    // --- 进度条数据 ---
    strand_hp: Strand(player.当前血量, player.血量上限),
    strand_lianqi: Strand(player.修为, levelInfo.exp),
    strand_llianti: Strand(player.血气, levelMaxInfo.exp),

    修仙版本: versionData
  };
}