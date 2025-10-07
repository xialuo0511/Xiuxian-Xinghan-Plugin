import { prepareNajieRenderData } from '../../logic/najie_view_logic.js'; // 确保路径正确
import plugin from '../../../../lib/plugins/plugin.js';
import config from '../../model/Config.js';
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
          reg: '^#我的纳戒.*',
          fnc: 'Show_najie'
        },
        {
          reg: '^#升级纳戒$',
          fnc: 'Lv_up_najie'
        },
        {
          reg: /^#设定纳戒\s+([\u4e00-\u9fa5a-zA-Z0-9]+)\s+(#[0-9a-fA-F]{6})$/,
          fnc: 'setNajieColor'
        }
      ]
    });
    this.xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');
  }

  async setNajieColor(e) {
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);

    const match = e.msg.match(/^#设定纳戒\s+([\u4e00-\u9fa5a-zA-Z0-9]+)\s+(#[0-9a-fA-F]{6})$/);
    if (!match) return;

    const categoryName = match[1];
    const colorCode = match[2];

    const settingsKey = `XinghanXiuxian:player_settings:${usr_qq}`;
    const colorConfigJson = await redis.hGet(settingsKey, 'najie_category_colors');

    let colorMap = {};
    if (colorConfigJson) {
      try {
        colorMap = JSON.parse(colorConfigJson);
      } catch (error) {
      }
    }

    colorMap[categoryName] = colorCode;

    await redis.hSet(settingsKey, 'najie_category_colors', JSON.stringify(colorMap));
    await e.reply(`已成功将分类【${categoryName}】的颜色设置为 ${colorCode}！`, true);
  }


  async Show_najie(e) {
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await Gulid(usr_qq);

    if (!await DAL.existPlayer(usr_qq)) {
      return;
    }

    let msg = e.msg.replace(/#我的纳戒/i, '').trim();

    let options = {
      searchType: 'all',
      searchTerm: '',
      page: 1
    };

    // 提取末尾的页码 (e.g., "道具2", "nsmg3")
    const pageMatch = msg.match(/(\d+)$/);
    if (pageMatch) {
      options.page = parseInt(pageMatch[0]);
      msg = msg.replace(/(\d+)$/, '').trim(); // 移除页码部分
    }

    // 判断搜索类型
    if (msg.startsWith('+')) {
      options.searchType = 'category';
      options.searchTerm = msg.substring(1).trim();
    } else if (msg) {
      options.searchType = 'name';
      options.searchTerm = msg.trim();
    }

    const result = await prepareNajieRenderData(usr_qq, options);

    // 根据不同的返回状态进行处理
    switch (result.status) {
      case 'success':
        const dataForPuppeteer = await new Show(e).get_najieData(result.renderData);
        const img = await puppeteer.screenshot('najie', { ...dataForPuppeteer });
        await e.reply(img);
        break;
      case 'not_found':
        await e.reply(`你的纳戒中似乎没有与【${options.searchTerm}】相关的物品。`, true);
        break;
      case 'single_item':
        const item = result.item;
        await e.reply(`你拥有【${item.name}】x ${item.数量}。`, true);
        break;
      case 'error':
        await e.reply(result.message, true);
        break;
    }
    return true;
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