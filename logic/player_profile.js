import * as DAL from '../api/data-access.js';
import { redisClient as redis } from '../api/redis.js';
import { shijianc } from '../apps/Xiuxian/xiuxian.js';

/**
 * 更新玩家的道号
 * @param {string} userId - 玩家ID
 * @param {string} newName - 新的道号
 * @returns {Promise<{success: boolean, message: string, player: object|null}>}
 */
export async function updatePlayerName(userId, newName) {
  if (!newName || newName.length === 0) {
    return { success: false, message: '改名格式为:【#改名张三】请输入正确名字', player: null };
  }
  if (newName.length > 8) {
    return { success: false, message: '玩家名字最多八字', player: null };
  }

  const nowTime = Date.now();
  const lastSetNameTime = parseInt(await redis.get(`xiuxian:player:${userId}:last_setname_time`)) || 0;
  const today = await shijianc(nowTime);
  const lastDay = await shijianc(lastSetNameTime);

  if (today.Y === lastDay.Y && today.M === lastDay.M && today.D === lastDay.D) {
    return { success: false, message: '每日只能改名一次', player: null };
  }

  let updateResult = null;
  const success = await DAL.transaction_update(userId, (player) => {
    if (player.灵石 < 1000) {
      updateResult = { success: false, message: '改名需要1000灵石', player: null };
      return false; // 返回false来中止事务
    }
    player.灵石 -= 1000;
    player.名号 = newName;
    updateResult = { success: true, message: `道号成功更改为【${newName}】!`, player: player };
    return true; // 返回true来提交事务
  });

  if (success) {
    await redis.set(`xiuxian:player:${userId}:last_setname_time`, nowTime);
    return updateResult;
  }

  // 如果事务因灵石不足等原因中止，则返回具体原因
  return updateResult || { success: false, message: '改名失败，请稍后再试', player: null };
}

/**
 * 更新玩家的道宣
 * @param {string} userId - 玩家ID
 * @param {string} newDeclaration - 新的道宣
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function updatePlayerDeclaration(userId, newDeclaration) {
  if (!newDeclaration || newDeclaration.length === 0) {
    return { success: false, message: '道宣不能为空' };
  }
  if (newDeclaration.length > 50) {
    return { success: false, message: '道宣最多50字符' };
  }

  const nowTime = Date.now();
  const lastSetTime = parseInt(await redis.get(`xiuxian:player:${userId}:last_setxuanyan_time`)) || 0;
  const today = await shijianc(nowTime);
  const lastDay = await shijianc(lastSetTime);

  if (today.Y === lastDay.Y && today.M === lastDay.M && today.D === lastDay.D) {
    return { success: false, message: '每日仅可更改一次' };
  }

  const success = await DAL.transaction_update(userId, (player) => {
    player.宣言 = newDeclaration;
    return true;
  });

  if (success) {
    await redis.set(`xiuxian:player:${userId}:last_setxuanyan_time`, nowTime);
    return { success: true, message: '道宣设置成功!' };
  }

  return { success: false, message: '道宣设置失败，请稍后再试' };
}

/**
 * 更新玩家的性别
 * @param {string} userId - 玩家ID
 * @param {string} newSex - 新的性别 ('男' or '女')
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function updatePlayerSex(userId, newSex) {
  if (newSex !== '男' && newSex !== '女') {
    return { success: false, message: '请发送#设置性别男 或 #设置性别女' };
  }

  let updateResult = null;
  const success = await DAL.transaction_update(userId, (player) => {
    if (player.sex !== 0) {
      updateResult = { success: false, message: '每个存档仅可设置一次性别！' };
      return false;
    }
    player.sex = newSex === '男' ? 2 : 1;
    updateResult = { success: true, message: `${player.名号}的性别已成功设置为 ${newSex}。` };
    return true;
  });

  return updateResult || { success: false, message: '性别设置失败，请稍后再试' };
}

/**
 * 更新玩家装备的头像框
 * @param {string} userId - 玩家ID
 * @param {string} frameName - 头像框名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function updatePlayerAvatarFrame(userId, frameName) {
  let updateResult = null;
  const success = await DAL.transaction_update(userId, (player) => {
    const frame = player.all_touxiangkuang.find(item => item.name === frameName);
    if (!frame) {
      updateResult = { success: false, message: '您暂未拥有此头像框' };
      return false;
    }
    player.zb_touxiangkuang = [frame]; // 替换为新头像框
    updateResult = { success: true, message: '头像框更换成功！' };
    return true;
  });

  return updateResult || { success: false, message: '头像框更换失败，请稍后再试' };
}
