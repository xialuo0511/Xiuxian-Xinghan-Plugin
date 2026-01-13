
import plugin from '../../../../lib/plugins/plugin.js';
import puppeteer from '../../api/puppeteer-wrapper.js'; // 使用自定义截图模块
import path from 'path';

// 春节活动配置
const ACTIVITY_CONFIG = {
    startTime: new Date('2026-02-02 09:00:00').getTime(), // 活动开始时间
    endTime: new Date('2026-03-08 23:59:59').getTime(),   // 活动结束时间
    commands: [
        { cmd: '#进入天马牧场', desc: '进入天马牧场秘境' },
        { cmd: '#参与讨伐', desc: '参与魔驹讨伐战' },
        { cmd: '#灯谜祈福', desc: '每日答题赢好礼' },
        { cmd: '#马年庆典铺', desc: '兑换限定皮肤与道具' }
    ]
};

export class SpringFestival extends plugin {
    constructor() {
        super({
            name: 'SpringFestival_Activity',
            dsc: '2026马年春节活动',
            event: 'message',
            priority: 600,
            rule: [
                {
                    reg: '^#?(新春活动|万马奔腾|春节活动)$',
                    fnc: 'showActivityPage'
                }
            ]
        });
    }

    /**
     * 展示活动主页
     */
    async showActivityPage(e) {
        const now = Date.now();
        const { startTime, endTime } = ACTIVITY_CONFIG;

        // 活动已结束，不响应
        if (now > endTime) {
            return false; // 返回false让其他插件处理或忽略
        }

        // 判断活动状态
        let activityStatus = 'active'; // 'pending' | 'active'
        let targetTime = endTime;
        let countdownLabel = '距离活动结束还有';

        if (now < startTime) {
            activityStatus = 'pending';
            targetTime = startTime;
            countdownLabel = '距离活动开始还有';
        }

        // 渲染数据
        const data = {
            user_id: e.user_id,
            activity_status: activityStatus,
            target_time: targetTime,
            countdown_label: countdownLabel,
            commands: ACTIVITY_CONFIG.commands,
            pluResPath: `file://${process.cwd().replace(/\\/g, '/')}/plugins/xiuxian-emulator-plugin/resources`
        };

        // 模板文件路径
        const htmlPath = path.join(process.cwd(), 'plugins/xiuxian-emulator-plugin/resources/html/event/spring_festival/index.html');

        // 生成图片
        const img = await puppeteer.screenshot('spring_festival_index', {
            tplFile: htmlPath,
            ...data,
            imgType: 'jpeg',
            quality: 90
        });

        await e.reply(img);
    }
}
