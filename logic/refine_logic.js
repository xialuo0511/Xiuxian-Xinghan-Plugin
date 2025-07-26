import * as DAL from '../api/data-access.js';
import { transaction_update } from '../api/data-access.js';
import { exist_najie_thing, Add_najie_thing } from '../apps/Xiuxian/xiuxian.js';

/**
 * 装备精炼逻辑
 * @param {string} userId 用户ID
 * @param {string} equipmentInfo 装备信息 "装备名*品级"
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function refineEquipment(userId, equipmentInfo) {
    if (!equipmentInfo.trim()) {
        return { success: false, message: '未输入名称' };
    }

    const code = equipmentInfo.split('*');
    const equipmentName = code[0];
    const gradeText = code[1]; // 品级文字

    if (!gradeText) {
        return { success: false, message: '未输入品级' };
    }

    const grades = ['劣', '普', '优', '精', '极', '绝', '顶'];
    const gradeIndex = grades.indexOf(gradeText);
    
    if (gradeIndex === -1) {
        return { success: false, message: '品级格式错误，请使用：劣/普/优/精/极/绝/顶' };
    }

    if (gradeIndex === 6) {
        return { success: false, message: '已达到顶级' };
    }

    return await transaction_update(userId, async (playerData) => {
        const { najie } = playerData;

        // 检查是否有该装备
        const hasEquipment = await exist_najie_thing(userId, equipmentName, '装备');
        if (!hasEquipment) {
            return {
                success: false,
                message: `你没有[${equipmentName}]这样的装备`
            };
        }

        // 检查是否有指定品级的装备
        const targetEquipment = najie.装备.find(item => 
            item.name === equipmentName && item.pinji === gradeIndex
        );
        
        if (!targetEquipment) {
            return {
                success: false,
                message: `你没有${gradeText}品级的${equipmentName}`
            };
        }

        // 检查数量是否足够（每个阶级需要3件）
        const requiredAmount = 3;
        if (targetEquipment.数量 < requiredAmount) {
            return {
                success: false,
                message: `你目前只有[${equipmentName}【${gradeText}】]*${targetEquipment.数量}，还需${requiredAmount - targetEquipment.数量}件方可精炼`
            };
        }

        // 执行精炼
        await Add_najie_thing(userId, equipmentName, '装备', -requiredAmount, gradeIndex);
        await Add_najie_thing(userId, equipmentName, '装备', 1, gradeIndex + 1);

        return {
            success: true,
            message: `精炼成功获得${equipmentName}【${grades[gradeIndex + 1]}】*1`
        };
    });
}