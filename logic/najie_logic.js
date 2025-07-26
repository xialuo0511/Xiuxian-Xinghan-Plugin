import * as DAL from '../api/data-access.js';
import config from '../model/Config.js';

const xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');

/**
 * 处理纳戒升级的核心逻辑
 * @param {string} userId 玩家ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function handleNajieUpgrade(userId) {
  const { najie_num, najie_price } = xiuxianConfigData;
  let result = { success: false, message: '升级失败，未知错误。' };

  // 使用事务来确保玩家灵石和纳戒等级的一致性
  const transactionSuccess = await DAL.transaction_update(userId, (player, equipment, najie) => {
    const currentLevel = najie.等级;

    // 检查是否已达最高级
    if (currentLevel >= najie_num.length) {
      result = { success: false, message: '你的纳戒已经是最高级的了。' };
      return false; // 中止事务
    }

    const price = najie_price[currentLevel];

    // 检查灵石是否足够
    if (player.灵石 < price) {
      result = { success: false, message: `灵石不足, 还需要准备 ${price - player.灵石} 灵石。` };
      return false; // 中止事务
    }

    // 扣除灵石并升级纳戒
    player.灵石 -= price;
    najie.等级 += 1;
    najie.灵石上限 = najie_num[currentLevel]; // 使用升级前的等级作为索引

    result = {
      success: true,
      message: `你的纳戒升级成功, 花了 ${price} 灵石, 目前纳戒灵石存储上限为 ${najie.灵石上限}, 可以使用【#我的纳戒】来查看。`
    };

    return true; // 提交事务
  });

  if (!transactionSuccess && !result.message.includes('灵石不足') && !result.message.includes('最高级')) {
    result.message = '纳戒升级失败，请稍后再试。';
  }

  return result;
}