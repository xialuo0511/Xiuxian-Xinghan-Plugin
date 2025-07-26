import { prepareNajieRenderData } from '../../logic/najie_view_logic.js'; // 确保路径正确
import plugin from '../../../../lib/plugins/plugin.js';
import config from '../../model/Config.js';
import { Read_player, existplayer, Read_najie, Write_najie } from '../Xiuxian/xiuxian.js';
import { Add_灵石 } from '../Xiuxian/xiuxian.js';
import { get_najie_img } from '../ShowImeg/showData.js';
import { Gulid, puppeteer, Show } from '../../api/api.js';
import * as DAL from '../../api/data-access.js';
import { handleNajieUpgrade } from '../../logic/najie_logic.js'; // 引入新的逻辑函数
import { Go } from './UserHome.js'; // 假设Go函数已更新为DAL版本

/**
 * 全局
 */
let allaction = false;//全局状态判断
/**
 * 交易系统
 */

export class UserAction extends plugin {
  constructor() {
    super({
      /** 功能名称 */
      name: 'UserAction',
      /** 功能描述 */
      dsc: '交易模块',
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 600,
      rule: [
        {
          reg: '^#我的纳戒',
          fnc: 'Show_najie'
        },
        {
          reg: '^#升级纳戒$',
          fnc: 'Lv_up_najie'
        }
      ]
    });
    this.xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');
  }


  async Show_najie(e) {
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);

    if (!await DAL.existPlayer(usr_qq)) {
      return; // 玩家不存在则不处理
    }

    // 从消息中解析页码, e.g., "#我的纳戒 2"
    let page = e.msg.match(/\d+/)?.[0] || 1;
    page = parseInt(page);

    // 调用新的逻辑函数准备数据
    const renderData = await prepareNajieRenderData(usr_qq, page);

    if (!renderData) {
      e.reply('获取纳戒信息失败，请稍后再试。');
      return;
    }

    const dataForPuppeteer = await new Show(e).get_najieData(renderData);
    const img = await puppeteer.screenshot('najie', { ...dataForPuppeteer });

    e.reply(img);
  }

  async Lv_up_najie(e) {
    if (!e.isGroup) {
      return e.reply('修仙游戏请在群聊中游玩');
    }

    const userId = await Go(e); // 使用更新后的Go函数进行状态检查
    if (!userId) {
      return; // Go函数内部会处理回复
    }

    try {
      // 调用核心逻辑处理函数
      const result = await handleNajieUpgrade(userId);
      // 直接回复结果
      e.reply(result.message);
    } catch (error) {
      console.error(`[纳戒升级] 用户 ${userId} 操作失败:`, error);
      e.reply('升级过程中似乎遇到了意料之外的阻碍，请稍后再试。');
    }
  }
}