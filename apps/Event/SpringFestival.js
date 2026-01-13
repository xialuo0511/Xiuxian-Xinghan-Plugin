
import plugin from '../../../../lib/plugins/plugin.js';
import puppeteer from '../../api/puppeteer-wrapper.js'; // 使用自定义截图模块
import path from 'path';

// 春节活动配置
const ACTIVITY_CONFIG = {
    endTime: new Date('2026-03-08 23:59:59').getTime(), // 活动时间：2026/2/2 09:00 ~ 2026/3/8 23:59
    commands: [
        { cmd: '#新春签到', desc: '领红包，积攒好运' },
        { cmd: '#赶年兽', desc: '全服合力，击退年兽' },
        { cmd: '#新春集市', desc: '兑换限定皮肤与道具' },
        { cmd: '#万马奔腾', desc: '查看活动主页' }
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
        // 渲染数据
        const data = {
            user_id: e.user_id,
            activity_end_time: ACTIVITY_CONFIG.endTime,
            commands: ACTIVITY_CONFIG.commands,
            // 传递图片路径前缀 (虽然通常在css里引用，但也可以传给模板备用)
            img_path: `file://${process.cwd().replace(/\\/g, '/')}/plugins/xiuxian-emulator-plugin/resources/img/event/spring_2026/`,
            pluResPath: `file://${process.cwd().replace(/\\/g, '/')}/plugins/xiuxian-emulator-plugin/resources/`
        };

        // 模板文件路径
        const htmlPath = path.join(process.cwd(), 'plugins/xiuxian-emulator-plugin/resources/html/event/spring_festival/index.html');

        // 生成图片
        // 注意：这里我们使用 scale: 2 和 png 来确保高清画质，尤其是为了展示华丽的春节素材
        const img = await puppeteer.screenshot('spring_festival_index', {
            tplFile: htmlPath,
            ...data,
            imgType: 'jpeg', // 使用jpeg (默认也是jpeg 90)，但这里背景复杂，jpeg 90足够且体积小
            quality: 90
        });

        await e.reply(img);
    }
}
