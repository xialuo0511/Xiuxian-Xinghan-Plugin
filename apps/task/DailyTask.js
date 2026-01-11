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
        const htmlPath = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'resources', 'html', 'daily_task', 'daily_task.html');

        // 3. 渲染
        const img = await puppeteer.screenshot('daily_task', {
            tplFile: htmlPath,
            ...data,
            imgType: 'jpeg',
            quality: 90
        });

        // 4. 回复图片
        await e.reply(img);
    }
}
