import fs from 'fs';
import { __PATH } from '../apps/Xiuxian/xiuxian.js';
import { Read_player, Read_najie, Read_equipment } from '../apps/Xiuxian/xiuxian.js';

/**
 * 检查玩家存档逻辑
 * @returns {Promise<{success: boolean, reports: string[]}>}
 */
export async function checkPlayerArchives() {
    const files = fs.readdirSync(__PATH.player_path)
        .filter(file => file.endsWith('.json'));
    
    const reports = [];
    const brokenArchives = { player: [], najie: [], equipment: [] };

    for (const file of files) {
        const userId = file.replace('.json', '');
        
        // 检查玩家存档
        try {
            await Read_player(userId);
        } catch {
            brokenArchives.player.push(userId);
        }
        
        // 检查纳戒存档
        try {
            await Read_najie(userId);
        } catch {
            brokenArchives.najie.push(userId);
        }
        
        // 检查装备存档
        try {
            await Read_equipment(userId);
        } catch {
            brokenArchives.equipment.push(userId);
        }
    }

    // 生成报告
    if (brokenArchives.player.length > 0) {
        reports.push('存档异常：\n' + brokenArchives.player.join('\n'));
    } else {
        reports.push('存档：正常');
    }

    if (brokenArchives.najie.length > 0) {
        reports.push('纳戒异常：\n' + brokenArchives.najie.join('\n'));
    } else {
        reports.push('纳戒：正常');
    }

    if (brokenArchives.equipment.length > 0) {
        reports.push('装备异常：\n' + brokenArchives.equipment.join('\n'));
    } else {
        reports.push('装备：正常');
    }

    return {
        success: true,
        reports
    };
}