// /logic/player_view_logic.js (优化版)

import * as DAL from '../api/data-access.js';
import {
  Read_qinmidu,
  isNotNull
} from '../apps/Xiuxian/xiuxian.js';
import data from '../model/XiuxianData.js';
import { GetPower, bigNumberTransform } from '../apps/ShowImeg/showData.js';
import config from '../model/Config.js';

const versionData = config.getdefSet('version', 'version');

/**
 * 进度条渲染辅助函数
 */
function Strand(now, max, leftColor, rightColor) {
  if (max == 0 || !max) return { style: 'style=width:0%', num: 0 }; // 防止除以0
  let num = (now / max * 100);
  if (num > 100) num = 100;
  if (num < 0) num = 0;
  num = num.toFixed(0);
  return {
    style: `style="background: linear-gradient(to right, ${leftColor}, ${rightColor}); width: ${num}%"`
  };
}

/**
 * 科学计数法格式化辅助函数
 */
function formatToScientific(value) {
  if (value == 0 || !value) {
    return { formatted: 0, exponent: '' };
  }
  if (value < 100000) {
    return { formatted: value, exponent: '' };
  }
  const exponent = Math.floor(Math.log10(value));
  const base = value / Math.pow(10, exponent);
  return {
    formatted: `${base.toFixed(2)} x 10`,
    exponent: exponent
  };
}

/**
 * [聚合层] 负责从所有数据源收集渲染面板所需的原始数据
 */
export async function aggregatePlayerData(userId) {
  if (!await DAL.existPlayer(userId)) {
    return null;
  }
  const [playerAllData, currentAction, qinmiduData, dingjixianshi] = await Promise.all([
    DAL.getAllPlayerData(userId),
    DAL.getPlayerAction(userId),
    Read_qinmidu().catch(() => []),
    redis.get(`xiuxian:player:${userId}:dingjixianshi`).catch(() => 0)
  ]);
  if (!playerAllData) return null;
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
 * [处理层] 负责将原始数据计算并格式化为最终用于渲染的视图模型
 */
export async function transformPlayerDataForRender(rawData, e) {
  const { player, equipment, qinmidu, dingjixianshi } = rawData;
  const usr_qq = player.id;

  // 状态
  let status = '空闲';
  if (rawData.action) {
    const action = rawData.action;
    let m = Math.floor((action.endTime - Date.now()) / 60000);
    let s = Math.floor(((action.endTime - Date.now()) % 60000) / 1000);
    status = `${action.action}(剩余:${m > 0 ? m : 0}分${s > 0 ? s : 0}秒)`;
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
  const levelInfo = data.Level_list.find(item => item.level_id == player.level_id) || { level: '未知', exp: 0 };
  const levelMaxInfo = data.LevelMax_list.find(item => item.level_id == player.Physique_id) || {
    level: '未知',
    exp: 0
  };

  // 职业信息
  let occupationInfo = {
    occupation: '无',
    occupation_level_name: '-',
    occupation_exp: '-',
    occupation_need_exp: '-',
    strand_liandan: {
      num: 0,
      leftColor: '#BA55D3',
      rightColor: '#8A2BE2'
    }
  };
  if (player.occupation && player.occupation.length > 0) {
    const occupationLevelInfo = data.occupation_exp_list.find(item => item.id == player.occupation_level);
    if (occupationLevelInfo) {
      occupationInfo = {
        occupation: player.occupation,
        occupation_level_name: occupationLevelInfo.name,
        occupation_exp: player.occupation_exp,
        occupation_need_exp: occupationLevelInfo.experience,
        strand_liandan: {
          num: (player.occupation_exp / occupationLevelInfo.experience * 100).toFixed(0),
          leftColor: '#BA55D3',
          rightColor: '#8A2BE2'
        }
      };
    }
  }

  // 装备评级
  const pinji = ['劣',
    '普',
    '优',
    '精',
    '极',
    '绝',
    '顶'];
  const 武器评级 = isNotNull(equipment.武器?.pinji) ? pinji[equipment.武器.pinji] : '无';
  const 护具评级 = isNotNull(equipment.护具?.pinji) ? pinji[equipment.护具.pinji] : '无';
  const 法宝评级 = isNotNull(equipment.法宝?.pinji) ? pinji[equipment.法宝.pinji] : '无';

  // 婚姻状况
  let hunyin = '无';
  const marriage = qinmidu.find(item => (item.QQ_A == usr_qq || item.QQ_B == usr_qq) && item.婚姻 > 0);
  if (marriage) {
    const partnerId = marriage.QQ_A == usr_qq ? marriage.QQ_B : marriage.QQ_A;
    const partnerData = (await DAL.getAllPlayerData(partnerId))?.player;
    if (partnerData) hunyin = partnerData.名号;
  }

  // 科学计数法格式化
  const atkSci = formatToScientific(player.攻击);
  const defSci = formatToScientific(player.防御);


  // 返回最终的视图模型
  return {
    pifu: player.练气皮肤,
    touxiang: player.zb_touxiangkuang?.[0]?.id || 0,
    head_pic: e.member.getAvatarUrl() || `https://q1.qlogo.cn/g?b=qq&s=0&nk=${usr_qq}`,
    PowerMini: bigNumberTransform(GetPower(player.攻击, player.防御, player.血量上限, player.暴击率)),
    player: player,
    user_id: usr_qq,
    lingshi: bigNumberTransform(player.灵石),
    dingjixianshi: dingjixianshi,
    this_association: player.宗门 || { 宗门名称: '无', 职位: '无' },

    player_atk: atkSci.formatted,
    player_atk2: atkSci.exponent,
    player_def: defSci.formatted,
    player_def2: defSci.exponent,
    bao: `${(player.暴击率 * 100).toFixed(0)}%`,

    talent: (talentEff * 100).toFixed(0),
    occupation: occupationInfo.occupation,
    婚姻状况: hunyin,

    // 四个进度条
    strand_hp: {
      num: (player.当前血量 / player.血量上限 * 100).toFixed(0),
      leftColor: '#e57373',
      rightColor: '#d32f2f'
    },
    rank_lianqi: levelInfo.level,
    expmax_lianqi: levelInfo.exp,
    strand_lianqi: {
      num: (player.修为 / levelInfo.exp * 100).toFixed(0),
      leftColor: '#02e4f8',
      rightColor: '#0077ff'
    },
    rank_llianti: levelMaxInfo.level,
    expmax_llianti: levelMaxInfo.exp,
    strand_llianti: {
      num: (player.血气 / levelMaxInfo.exp * 100).toFixed(0),
      leftColor: '#FFD700',
      rightColor: '#FFA500'
    },
    rank_liandan: occupationInfo.occupation_level_name,
    expmax_liandan: occupationInfo.occupation_need_exp,
    strand_liandan: occupationInfo.strand_liandan,

    linggen: displayLinggen,
    player_action: status,
    daofa: daofa,

    equipment: {
      武器: equipment.武器 || { name: '暂无', atk: 0, def: 0, HP: 0, bao: 0 },
      护具: equipment.护具 || { name: '暂无', atk: 0, def: 0, HP: 0, bao: 0 },
      法宝: equipment.法宝 || { name: '暂无', atk: 0, def: 0, HP: 0, bao: 0 },
      项链: equipment.项链 || { name: '暂无', 属性: '无', 加成: 0 }
    },
    仙宠: player.仙宠 && player.仙宠.name ? player.仙宠 : { name: '暂无', 品级: '', 等级: 0, type: '无', 加成: 0 },

    武器评级, 护具评级, 法宝评级,
    修仙版本: versionData
  };
}
