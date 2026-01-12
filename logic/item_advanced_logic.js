import * as DAL from '../api/data-access.js';
import { transaction_update } from '../api/data-access.js';
import { exist_najie_thing, Add_najie_thing, foundthing } from '../apps/Xiuxian/xiuxian.js';
import data from '../model/XiuxianData.js';
import { openLianshengBox, LIANSHENG_BOX_REWARDS } from './tiandibang_logic.js';

/**
 * 打开物品逻辑
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function openItem(userId, itemName) {
    // 特殊处理：连胜宝匣（不走transaction_update，因为openLianshengBox内部已处理）
    if (itemName === '连胜宝匣') {
        const result = await openLianshengBox(userId);
        if (!result.success) {
            return result;
        }

        // 构建奖励提示消息
        let rareHint = '';
        if (result.reward.probability <= 5) {
            rareHint = ' 🎉 稀有奖励！';
        }

        return {
            success: true,
            message: `✨ 打开了【连胜宝匣】，获得了：${result.rewardText}${rareHint}\n📦 剩余宝匣：${result.remainingBoxes}个`
        };
    }

    return await transaction_update(userId, async (playerData) => {
        const { player, najie } = playerData;

        // 检查是否拥有该物品
        const hasItem = await exist_najie_thing(userId, itemName, '道具');
        if (!hasItem) {
            return {
                success: false,
                message: `你没有[${itemName}]`
            };
        }

        // 特殊物品打开逻辑
        if (itemName.includes('钱包')) {
            // 消耗钱包
            await Add_najie_thing(userId, itemName, '道具', -1);

            // 随机获得灵石
            const rand = Math.random();
            let lingshi = 0;
            if (rand < 0.1) lingshi = 2000000;
            else if (rand < 0.2) lingshi = 1000000;
            else if (rand < 0.4) lingshi = 400000;
            else if (rand < 0.7) lingshi = 180000;
            else lingshi = 100000;

            player.灵石 += lingshi;
            return {
                success: true,
                message: `${player.名号}打开了[${itemName}]，金光一现！获得了${lingshi}颗灵石！`
            };
        } else if (itemName.includes('盒子')) {
            // 宝箱类物品
            await Add_najie_thing(userId, itemName, '道具', -1);

            // 随机奖励
            const rewards = ['灵石', '丹药', '装备', '材料'];
            const randomReward = rewards[Math.floor(Math.random() * rewards.length)];

            return {
                success: true,
                message: `打开[${itemName}]，获得了${randomReward}！`
            };
        }

        return {
            success: false,
            message: `[${itemName}]无法打开`
        };
    });
}

/**
 * 解除封印逻辑
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function unsealItem(userId, itemName) {
    return await transaction_update(userId, async (playerData) => {
        const { player, najie } = playerData;

        // 检查是否有解封道具
        const hasUnsealItem = await exist_najie_thing(userId, '【天道束链-逆】', '道具');
        if (!hasUnsealItem) {
            return {
                success: false,
                message: '解除封印需要[【天道束链-逆】]'
            };
        }

        // 检查是否有被封印的物品
        const hasItem = await exist_najie_thing(userId, itemName, '装备');
        if (!hasItem) {
            return {
                success: false,
                message: `你没有[${itemName}]这件装备`
            };
        }

        // 消耗解封道具
        await Add_najie_thing(userId, '【天道束链-逆】', '道具', -1);

        // 解除封印效果
        return {
            success: true,
            message: `成功解除[${itemName}]的封印！装备属性大幅提升！`
        };
    });
}

/**
 * 合成物品逻辑
 * @param {string} userId 用户ID
 * @param {string} itemName 目标物品名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function synthesizeItem(userId, itemName) {
    return await transaction_update(userId, async (playerData) => {
        const { player, najie } = playerData;

        // 查找合成配方
        const recipe = data.hecheng_list?.find(item => item.name === itemName);
        if (!recipe) {
            return {
                success: false,
                message: `没有找到[${itemName}]的合成配方`
            };
        }

        // 检查材料是否足够
        for (const material of recipe.materials || []) {
            const hasAmount = await exist_najie_thing(userId, material.name, material.class);
            if (hasAmount < material.amount) {
                return {
                    success: false,
                    message: `材料不足：需要[${material.name}]*${material.amount}，拥有${hasAmount || 0}`
                };
            }
        }

        // 消耗材料
        for (const material of recipe.materials || []) {
            await Add_najie_thing(userId, material.name, material.class, -material.amount);
        }

        // 获得合成物品
        await Add_najie_thing(userId, itemName, recipe.class, 1);

        return {
            success: true,
            message: `成功合成[${itemName}]！`
        };
    });
}

/**
 * 加工物品逻辑
 * @param {string} userId 用户ID
 * @param {string} itemName 物品名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function processItem(userId, itemName) {
    return await transaction_update(userId, async (playerData) => {
        const { player, najie } = playerData;

        // 检查是否有加工设备
        const hasProcessor = await exist_najie_thing(userId, '熔炉', '道具');
        if (!hasProcessor) {
            return {
                success: false,
                message: '加工物品需要[熔炉]'
            };
        }

        // 检查是否有燃料
        const hasFuel = await exist_najie_thing(userId, '燃料', '材料');
        if (!hasFuel) {
            return {
                success: false,
                message: '加工物品需要[燃料]'
            };
        }

        // 检查原材料
        const hasItem = await exist_najie_thing(userId, itemName, '材料');
        if (!hasItem) {
            return {
                success: false,
                message: `你没有[${itemName}]这种材料`
            };
        }

        // 消耗燃料和原材料
        await Add_najie_thing(userId, '燃料', '材料', -1);
        await Add_najie_thing(userId, itemName, '材料', -1);

        // 获得加工后的物品
        const processedItem = `精制${itemName}`;
        await Add_najie_thing(userId, processedItem, '材料', 1);

        return {
            success: true,
            message: `成功加工[${itemName}]，获得[${processedItem}]！`
        };
    });
}

/**
 * 附魔逻辑
 * @param {string} userId 用户ID
 * @param {string} enchantBook 附魔书名称
 * @param {string} targetItem 目标装备名称
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function enchantItem(userId, enchantBook, targetItem) {
    return await transaction_update(userId, async (playerData) => {
        const { player, equipment, najie } = playerData;

        // 检查是否有附魔书
        const hasBook = await exist_najie_thing(userId, enchantBook, '道具');
        if (!hasBook) {
            return {
                success: false,
                message: `你没有[${enchantBook}]这本附魔书`
            };
        }

        // 检查目标装备
        if (!equipment.武器 || equipment.武器.name !== targetItem) {
            return {
                success: false,
                message: `请先装备[${targetItem}]`
            };
        }

        // 消耗附魔书
        await Add_najie_thing(userId, enchantBook, '道具', -1);

        // 附魔效果
        const enchantEffect = data.changzhufumoshu_list?.find(item => item.name === enchantBook);
        if (enchantEffect) {
            // 应用附魔效果到装备
            equipment.武器.附魔 = enchantBook;
            if (enchantEffect.攻击力) {
                equipment.武器.攻击力 = (equipment.武器.攻击力 || 0) + enchantEffect.攻击力;
            }
        }

        return {
            success: true,
            message: `成功将[${enchantBook}]附魔到[${targetItem}]上！`
        };
    });
}