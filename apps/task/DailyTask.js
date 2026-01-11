import plugin from '../../../../lib/plugins/plugin.js';
import { getTaskStatusText } from '../../logic/daily_task_logic.js';

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
        const msg = await getTaskStatusText(usr_qq);
        await e.reply(msg);
    }
}
