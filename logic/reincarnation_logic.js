import * as DAL from '../api/data-access.js';
import { isNotNull, get_random_fromARR, Add_najie_thing, Add_HP } from '../apps/Xiuxian/xiuxian.js';
import data from '../model/XiuxianData.js';

/**
 * 处理轮回的核心逻辑
 * @param {string} userId 玩家ID
 * @returns {Promise<{success: boolean, messages: string[]}>}
 */
export async function handleReincarnation(userId) {
  let messages = [];

  // 使用事务一次性安全地读取和修改玩家数据
  const result = await DAL.transaction_update(userId, async (player, equipment, najie) => {
    if (!isNotNull(player.lunhui)) {
      player.lunhui = 0;
    }

    if (player.lunhui >= 9) {
      messages.push('你已经轮回完结！');
      return false; // 中止事务
    }
    if (player.level_id < 42) {
      messages.push('法境未到仙无法轮回！');
      return false;
    }
    if (equipment.武器.HP < 0) {
      messages.push(`身上携带邪祟之物，无法进行轮回,请将[${equipment.武器.name}]放下后再进行轮回`);
      return false;
    }
    if (player.轮回点 <= 0) {
      messages.push(`此生轮回点已消耗殆尽，未能躲过天机！\n被天庭发现，但因为没有轮回点未被关入天牢，\n仅被警告一次，轮回失败！`);
      player.当前血量 = 10;
      return 'failed_but_updated'; // 失败但需要保存状态
    }

    player.轮回点--;

    // 失败惩罚
    if (Math.random() <= 1 / 9) {
      messages.push(`本次轮回的最后关头，终究还是未能躲过天机！\n被天庭搜捕归案，关入天牢受尽折磨，轮回失败！`);
      player.当前血量 = 1;
      player.修为 -= 10000000;
      player.血气 += 5141919;
      player.灵石 -= 10000000;
      return 'failed_but_updated';
    }

    // 成功，开始重置属性
    player.lunhui += 1;
    const reincarnationLevel = player.lunhui;
    const reincarnationInfo = data.lunhui_list.find(item => item.id == reincarnationLevel);

    if (!reincarnationInfo) {
      messages.push('未找到对应的轮回信息，请联系管理员');
      return false;
    }

    // 更新灵根和功法
    player.灵根 = {
      'id': reincarnationInfo.id,
      'name': reincarnationInfo.name,
      'type': '转生',
      'eff': reincarnationInfo.eff,
      '法球倍率': reincarnationInfo.法球倍率
    };
    await Add_najie_thing(userId, reincarnationInfo.gongfa, '功法', 1);

    // 重置境界和状态
    player.level_id = 9;
    player.power_place = 1;

    if (player.lunhuiBH == 0) {
      player.Physique_id = Math.trunc(player.Physique_id / 2);
      player.修为 = 0;
      player.血气 = 0;
    } else { // lunhuiBH == 1
      player.修为 -= 10000000;
      player.血气 -= 10000000;
      player.lunhuiBH = 0;
    }

    messages.push(`你已打破规则，轮回成功，现在你为${reincarnationInfo.name}！${reincarnationInfo.desc || ''}`);
    return true; // 成功提交事务
  });

  if (!result) { // 事务因前置条件不满足而中止
    return { success: false, messages };
  }
  if (result === 'failed_but_updated') { // 事务因失败惩罚而中止，但数据已更新
    return { success: false, messages };
  }

  // 事务成功后，处理宗门等外部逻辑
  await Add_HP(userId, 99999999);

  const ascendedPlayer = (await DAL.getAllPlayerData(userId))?.player;
  if (ascendedPlayer.宗门 && isNotNull(ascendedPlayer.宗门)) {
    const sectName = ascendedPlayer.宗门.宗门名称;
    const sect = await DAL.getAssociation(sectName);

    if (sect && sect.power != 0) { // 是仙宗
      messages.push('轮回后降临凡界，仙宗命牌失效！');
      if (ascendedPlayer.宗门.职位 !== '宗主') {
        sect[ascendedPlayer.宗门.职位] = sect[ascendedPlayer.宗门.职位].filter(id => id != userId);
        sect.所有成员 = sect.所有成员.filter(id => id != userId);
        await DAL.saveAssociation(sectName, sect);
        await DAL.transaction_update(userId, (p) => {
          delete p.宗门;
          return true;
        });
        messages.push('退出宗门成功');
      } else { // 宗主轮回
        sect.所有成员 = sect.所有成员.filter(id => id != userId);
        if (sect.所有成员.length < 1) {
          await redis.del(`XinghanXiuxian:Data:Association:${sectName}`);
          messages.push('一声巨响,原本的宗门轰然倒塌,随着流沙沉没,仙界中再无半分痕迹');
        } else {
          let nextMasterId;
          if (sect.副宗主?.length > 0) nextMasterId = await get_random_fromARR(sect.副宗主);
          else if (sect.长老?.length > 0) nextMasterId = await get_random_fromARR(sect.长老);
          else if (sect.内门弟子?.length > 0) nextMasterId = await get_random_fromARR(sect.内门弟子);
          else nextMasterId = await get_random_fromARR(sect.所有成员);

          const nextMasterData = (await DAL.getAllPlayerData(nextMasterId))?.player;
          if (nextMasterData) {
            sect[nextMasterData.宗门.职位] = sect[nextMasterData.宗门.职位].filter(id => id != nextMasterId);
            sect.宗主 = nextMasterId;
            await DAL.saveAssociation(sectName, sect);
            await DAL.transaction_update(nextMasterId, (p) => {
              p.宗门.职位 = '宗主';
              return true;
            });
            messages.push(`轮回前,遵循你的嘱托,${nextMasterData.名号}将继承你的衣钵,成为新一任的宗主`);
          }
        }
        await DAL.transaction_update(userId, (p) => {
          delete p.宗门;
          return true;
        });
      }
    }
  }

  return { success: true, messages };
}
