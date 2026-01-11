import plugin from '../../../../lib/plugins/plugin.js';
import { getTaskRenderData } from '../../logic/daily_task_logic.js';
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import path from 'path';

export class DailyTask extends plugin {
    constructor() {
        super({
            name: 'DailyTask',
            dsc: '每日任务',
            event: 'message',
            priority: 600,
            rule: [
                {
                    reg: '^#每日任务$',
                    fnc: 'showDailyTask'
                }
            ]
        });
    }

    async showDailyTask(e) {
        if (!e.isGroup) {
            return;
        }
        const usr_qq = e.user_id;

        // 1. 获取渲染数据
        const data = await getTaskRenderData(usr_qq);

        // 2. 准备模板路径
        const pluginPath = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin');
        const htmlPath = path.join(pluginPath, 'resources', 'html', 'daily_task', 'daily_task.html');

        // 3. 添加资源路径变量（CSS 需要）
        const pluResPath = `file:///${pluginPath.replace(/\\/g, '/')}/resources/`;

        // 4. 渲染
        const img = await puppeteer.screenshot('daily_task', {
            tplFile: htmlPath,
            pluResPath: pluResPath,
            ...data,
            imgType: 'jpeg',
            quality: 90
        });

        // 5. 回复图片
        await e.reply(img);
    }
}
