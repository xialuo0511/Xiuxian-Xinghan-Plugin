import * as DAL from '../api/data-access.js';
import { timestampToTime, shijianc, player_efficiency } from '../apps/Xiuxian/xiuxian.js';
import config from '../model/Config.js';

// 宗门配置常量
const 宗门人数上限 = [6,
  9,
  12,
  15,
  18,
  21,
  24,
  27];
const 副宗主人数上限 = [1,
  1,
  1,
  1,
  2,
  2,
  3,
  3];
const 长老人数上限 = [1,
  2,
  3,
  4,
  5,
  7,
  8,
  9];
const 内门弟子上限 = [2,
  3,
  4,
  5,
  6,
  8,
  10,
  12];
const 宗门灵石池上限 = [2000000,
  5000000,
  8000000,
  11000000,
  15000000,
  20000000,
  25000000,
  30000000];

// 境界列表 - 从 DAL 获取
let Level_list = null;

/**
 * 获取境界列表
 */
async function getLevelList() {
  if (!Level_list) {
    // 从 DAL 获取境界配置数据
    Level_list = await DAL.getGameConfig('Level_list') || [];
  }
  return Level_list;
}

/**
 * 检查创建宗门条件
 * @param {string} userId 用户ID
 * @returns {Object} 检查结果
 */
export async function checkCreateAssociationConditions(userId) {
  const player = await DAL.getAllPlayerData(userId);
  if (!player) {
    return { success: false, message: '玩家数据不存在' };
  }

  const levelList = await getLevelList();
  const now_level_id = levelList.find(item => item.level_id == player.level_id)?.level_id;

  if (now_level_id < 22) {
    return { success: false, message: '修为达到化神再来吧' };
  }

  if (now_level_id >= 42 && now_level_id < 45) {
    return {
      success: false,
      message: '你的仙宗成立了！\n你未通过仙界宗门管理委员会的宗主测试！\n仙界宗门管理委员会将你的宗门强制注销了！\n请修炼到玄仙再来注册！'
    };
  }

  if (player.宗门) {
    return { success: false, message: '已经有宗门了' };
  }

  if (player.灵石 < 10000) {
    return { success: false, message: '开宗立派是需要本钱的,攒到一万灵石再来吧' };
  }

  return { success: true };
}

/**
 * 验证宗门名称
 * @param {string} associationName 宗门名称
 * @returns {Object} 验证结果
 */
export async function validateAssociationName(associationName) {
  if (associationName.length > 6) {
    return { success: false, message: '宗门名字最多只能设置6个字符,请重新输入:' };
  }

  const reg = /[^\u4e00-\u9fa5]/g; // 汉字检验正则
  const res = reg.test(associationName);
  if (res) {
    return { success: false, message: '宗门名字只能使用中文,请重新输入:' };
  }

  const existingAssociation = await DAL.getAssociation(associationName);
  if (existingAssociation) {
    return { success: false, message: '该宗门已经存在,请重新输入:' };
  }

  return { success: true };
}

/**
 * 创建宗门
 * @param {string} associationName 宗门名称
 * @param {string} userId 宗主用户ID
 * @returns {Object} 创建结果
 */
export async function createAssociation(associationName, userId) {
  return await DAL.transaction_update(async () => {
    const player = await DAL.getAllPlayerData(userId);
    if (!player) {
      throw new Error('玩家数据不存在');
    }

    // 检查玩家灵石
    if (player.灵石 < 10000) {
      throw new Error('灵石不足');
    }

    const now = new Date();
    const nowTime = now.getTime();
    const date = timestampToTime(nowTime);

    // 更新玩家数据
    player.宗门 = {
      '宗门名称': associationName,
      '职位': '宗主',
      'time': [date,
        nowTime]
    };
    player.灵石 -= 10000;

    await DAL.savePlayer(userId, player);

    // 创建宗门数据
    const levelList = await getLevelList();
    const now_level_id = levelList.find(item => item.level_id == player.level_id)?.level_id;
    let x, xian, dj;

    if (now_level_id > 41) {
      x = 1;
      xian = 10;
      dj = 42;
    } else {
      x = 0;
      xian = 1;
      dj = 1;
    }

    const Association = {
      '宗门名称': associationName,
      '宗门等级': 1,
      '创立时间': [date,
        nowTime],
      '灵石池': 0,
      '宗门驻地': 0,
      '宗门建设等级': 0,
      '宗门神兽': 0,
      '宗主': userId,
      '副宗主': [],
      '长老': [],
      '内门弟子': [],
      '外门弟子': [],
      '所有成员': [userId],
      '药园': {
        '药园等级': 1,
        '作物': [{
          'name': '凝血草',
          'start_time': nowTime,
          'who_plant': userId
        }]
      },
      '维护时间': nowTime,
      '大阵血量': 114514 * xian,
      '最低加入境界': dj,
      'power': x
    };

    await DAL.saveAssociation(associationName, Association);
    await player_efficiency(userId);

    return { success: true, message: '宗门创建成功' };
  });
}

/**
 * 升级宗门
 * @param {string} userId 用户ID
 * @returns {Object} 升级结果
 */
export async function upgradeAssociation(userId) {
  return await DAL.transaction_update(async () => {
    const player = await DAL.getAllPlayerData(userId);
    if (!player || !player.宗门) {
      throw new Error('你尚未加入宗门');
    }

    if (player.宗门.职位 !== '宗主' && player.宗门.职位 !== '副宗主') {
      throw new Error('只有宗主、副宗主可以操作');
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    if (ass.宗门等级 === 宗门人数上限.length) {
      throw new Error('已经是最高等级宗门');
    }

    const xian = ass.power === 1 ? 10 : 1;
    const upgradeCost = ass.宗门等级 * 300000 * xian;

    if (ass.灵石池 < upgradeCost) {
      throw new Error(`本宗门目前灵石池中仅有${ass.灵石池}灵石,当前宗门升级需要${upgradeCost}灵石,数量不足`);
    }

    ass.灵石池 -= upgradeCost;
    ass.宗门等级 += 1;

    await DAL.saveAssociation(ass.宗门名称, ass);
    await player_efficiency(userId);

    return {
      success: true,
      message: `宗门升级成功，当前宗门等级为${ass.宗门等级},宗门人数上限提高到:${宗门人数上限[ass.宗门等级 - 1]}`
    };
  });
}

/**
 * 任命职位
 * @param {string} userId 操作者用户ID
 * @param {string} targetUserId 被任命者用户ID
 * @param {string} appointment 职位名称
 * @returns {Object} 任命结果
 */
export async function appointPosition(userId, targetUserId, appointment) {
  return await DAL.transaction_update(async () => {
    const player = await DAL.getAllPlayerData(userId);
    const targetPlayer = await DAL.getAllPlayerData(targetUserId);

    if (!player || !player.宗门) {
      throw new Error('你尚未加入宗门');
    }

    if (!targetPlayer || !targetPlayer.宗门) {
      throw new Error('对方尚未加入宗门');
    }

    if (player.宗门.职位 !== '宗主' && player.宗门.职位 !== '副宗主') {
      throw new Error('只有宗主、副宗主可以操作');
    }

    if (userId === targetUserId) {
      throw new Error('???');
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    const isinass = ass.所有成员.includes(targetUserId);
    if (!isinass) {
      throw new Error('只能设置宗门内弟子的职位');
    }

    const now_apmt = targetPlayer.宗门.职位;

    // 权限检查
    if (player.宗门.职位 === '副宗主' && now_apmt === '宗主') {
      throw new Error('你想造反吗！？');
    }

    if (player.宗门.职位 === '副宗主' && (now_apmt === '副宗主' || now_apmt === '长老')) {
      throw new Error(`宗门${now_apmt}任免请上报宗主！`);
    }

    if (appointment === now_apmt) {
      throw new Error(`此人已经是本宗门的${appointment}`);
    }

    // 检查职位人数上限
    let full_apmt;
    if (appointment === '长老') {
      full_apmt = 长老人数上限[ass.宗门等级 - 1];
    } else if (appointment === '副宗主') {
      full_apmt = 副宗主人数上限[ass.宗门等级 - 1];
    } else if (appointment === '内门弟子') {
      full_apmt = 内门弟子上限[ass.宗门等级 - 1];
    }

    if (full_apmt && ass[appointment].length >= full_apmt) {
      throw new Error(`本宗门的${appointment}人数已经达到上限`);
    }

    // 更新职位
    targetPlayer.宗门.职位 = appointment;
    ass[now_apmt] = ass[now_apmt].filter(item => item !== targetUserId);
    ass[appointment].push(targetUserId);

    await DAL.savePlayer(targetUserId, targetPlayer);
    await DAL.saveAssociation(ass.宗门名称, ass);

    return {
      success: true,
      message: `${ass.宗门名称} ${player.宗门.职位} 已经成功将${targetPlayer.名号}任命为${appointment}!`,
      targetUserId
    };
  });
}

/**
 * 宗门维护
 * @param {string} userId 用户ID
 * @returns {Object} 维护结果
 */
export async function maintainAssociation(userId) {
  return await DAL.transaction_update(async () => {
    const player = await DAL.getAllPlayerData(userId);
    if (!player || !player.宗门) {
      throw new Error('你尚未加入宗门');
    }

    if (player.宗门.职位 !== '宗主' && player.宗门.职位 !== '副宗主') {
      throw new Error('只有宗主、副宗主可以操作');
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    const now = new Date();
    const nowTime = now.getTime();

    const xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');
    const time = xiuxianConfigData.CD.association;
    const nextmt_time = await shijianc(ass.维护时间 + 60000 * time);

    if (ass.维护时间 > nowTime - 1000 * 60 * 60 * 24 * 7) {
      throw new Error(`当前无需维护,下次维护时间:${nextmt_time.Y}年${nextmt_time.M}月${nextmt_time.D}日${nextmt_time.h}时${nextmt_time.m}分${nextmt_time.s}秒`);
    }

    const maintenanceCost = ass.宗门等级 * 50000;
    if (ass.灵石池 < maintenanceCost) {
      throw new Error(`目前宗门维护需要${maintenanceCost}灵石,本宗门灵石池储量不足`);
    }

    ass.灵石池 -= maintenanceCost;
    ass.维护时间 = nowTime;

    await DAL.saveAssociation(ass.宗门名称, ass);

    const nextTime = await shijianc(ass.维护时间 + 60000 * time);
    return {
      success: true,
      message: `宗门维护成功,下次维护时间:${nextTime.Y}年${nextTime.M}月${nextTime.D}日${nextTime.h}时${nextTime.m}分${nextTime.s}秒`
    };
  });
}

/**
 * 查看护宗大阵
 * @param {string} userId 用户ID
 * @returns {Object} 查看结果
 */
export async function viewProtectionArray(userId) {
  const player = await DAL.getAllPlayerData(userId);
  if (!player || !player.宗门) {
    throw new Error('你尚未加入宗门');
  }

  const ass = await DAL.getAssociation(player.宗门.宗门名称);
  return {
    success: true,
    message: `护宗大阵血量:${ass.大阵血量}`
  };
}

/**
 * 维护护宗大阵
 * @param {string} userId 用户ID
 * @param {number} lingshi 灵石数量
 * @returns {Object} 维护结果
 */
export async function maintainProtectionArray(userId, lingshi) {
  return await DAL.transaction_update(async () => {
    const player = await DAL.getAllPlayerData(userId);
    if (!player || !player.宗门) {
      throw new Error('你尚未加入宗门');
    }

    if (!['宗主',
      '副宗主',
      '长老'].includes(player.宗门.职位)) {
      throw new Error('只有宗主、副宗主或长老可以操作');
    }

    if (!Number.isInteger(lingshi) || lingshi <= 0) {
      throw new Error('请输入正确灵石数');
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    if (ass.灵石池 < lingshi) {
      throw new Error(`宗门灵石池只有${ass.灵石池}灵石,数量不足`);
    }

    const xian = ass.power === 1 ? 2 : 5;
    ass.大阵血量 += lingshi * xian;
    ass.灵石池 -= lingshi;

    await DAL.saveAssociation(ass.宗门名称, ass);

    return {
      success: true,
      message: `维护成功,宗门还有${ass.灵石池}灵石,护宗大阵增加了${lingshi * xian}血量`
    };
  });
}

/**
 * 设置宗门门槛
 * @param {string} userId 用户ID
 * @param {string} levelName 境界名称
 * @returns {Object} 设置结果
 */
export async function setAssociationThreshold(userId, levelName) {
  return await DAL.transaction_update(async () => {
    const player = await DAL.getAllPlayerData(userId);
    if (!player || !player.宗门) {
      throw new Error('你尚未加入宗门');
    }

    if (!['宗主',
      '副宗主',
      '长老'].includes(player.宗门.职位)) {
      throw new Error('只有宗主、副宗主或长老可以操作');
    }

    const levelList = await getLevelList();
    if (!levelList.some(item => item.level === levelName)) {
      throw new Error('境界不存在');
    }

    let jr_level_id = levelList.find(item => item.level === levelName).level_id;
    const ass = await DAL.getAssociation(player.宗门.宗门名称);

    if (ass.power === 0 && jr_level_id > 41) {
      jr_level_id = 41;
      return {
        success: true,
        message: '不知哪位大能立下誓言：凡界无仙！\n已成功设置宗门门槛，当前门槛:' + levelList.find(item => item.level_id === 41).level
      };
    }

    if (ass.power === 1 && jr_level_id < 42) {
      jr_level_id = 42;
      return {
        success: true,
        message: '仅仙人可加入仙宗\n已成功设置宗门门槛，当前门槛:' + levelList.find(item => item.level_id === 42).level
      };
    }

    ass.最低加入境界 = jr_level_id;
    await DAL.saveAssociation(ass.宗门名称, ass);

    return {
      success: true,
      message: '已成功设置宗门门槛，当前门槛:' + levelName
    };
  });
}

/**
 * 逐出宗门成员
 * @param {string} userId 操作者用户ID
 * @param {string} targetUserId 被逐出者用户ID
 * @returns {Object} 逐出结果
 */
export async function expelMember(userId, targetUserId) {
  return await DAL.transaction_update(async () => {
    const player = await DAL.getAllPlayerData(userId);
    const targetPlayer = await DAL.getAllPlayerData(targetUserId);

    if (!player || !player.宗门) {
      throw new Error('你尚未加入宗门');
    }

    if (!targetPlayer) {
      throw new Error('此人未踏入仙途！');
    }

    if (!targetPlayer.宗门) {
      throw new Error('对方尚未加入宗门');
    }

    if (userId === targetUserId) {
      throw new Error('???');
    }

    const ass = await DAL.getAssociation(player.宗门.宗门名称);
    const targetAss = await DAL.getAssociation(targetPlayer.宗门.宗门名称);

    if (ass.宗门名称 !== targetAss.宗门名称) {
      throw new Error('只能逐出本宗门成员');
    }

    // 权限检查
    if (player.宗门.职位 === '宗主') {
      // 宗主可以踢出任何人（除了自己）
    } else if (player.宗门.职位 === '副宗主') {
      if (targetPlayer.宗门.职位 === '宗主') {
        throw new Error('造反啦？');
      }
      if (['长老',
        '副宗主'].includes(targetPlayer.宗门.职位)) {
        throw new Error(`宗门${targetPlayer.宗门.职位}任免请上报宗主！`);
      }
    } else if (player.宗门.职位 === '长老') {
      if (['宗主',
        '副宗主'].includes(targetPlayer.宗门.职位)) {
        throw new Error('造反啦？');
      }
      if (targetPlayer.宗门.职位 === '长老') {
        throw new Error(`宗门${targetPlayer.宗门.职位}任免请上报宗主！`);
      }
    } else {
      throw new Error('权限不足');
    }

    // 从宗门中移除成员
    targetAss[targetPlayer.宗门.职位] = targetAss[targetPlayer.宗门.职位].filter(item => item !== targetUserId);
    targetAss.所有成员 = targetAss.所有成员.filter(item => item !== targetUserId);

    // 清除玩家宗门信息
    delete targetPlayer.宗门;
    targetPlayer.favorability = 0;

    await DAL.saveAssociation(targetAss.宗门名称, targetAss);
    await DAL.savePlayer(targetUserId, targetPlayer);
    await player_efficiency(targetUserId);

    return {
      success: true,
      message: '已踢出！'
    };
  });
}