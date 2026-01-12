import plugin from '../../../../lib/plugins/plugin.js';
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import customPuppeteer from '../../api/puppeteer-wrapper.js';
import Help from '../../model/help.js';
import Help1 from '../../model/xunbaohelp.js';
import Help2 from '../../model/shituhelp.js';
import Help3 from '../../model/huodonghelp.js';
import yijieHelp from '../../model/yijie.js';
import md5 from 'md5';
import path from 'path';

let helpData = {
  md5: '',
  img: '',
};

/**
 * 修仙帮助模块
 */

export class BotHelp extends plugin {
  constructor() {
    super({
      /** 功能名称 */
      name: 'BotHelp',
      /** 功能描述 */
      dsc: '修仙帮助',
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 400,
      rule: [
        {
          reg: '^#修仙帮助$',
          fnc: 'Xiuxianhelp',
        },
        {
          reg: '^#修仙管理$',
          fnc: 'adminsuper',
        },
        {
          reg: '^#宗门管理$',
          fnc: 'AssociationAdmin',
        },
        {
          reg: '^#修仙扩展$',
          fnc: 'Xiuxianhelpcopy',
        },
        {
          reg: '^#寻宝帮助$',
          fnc: 'xunbaohelp',
        },
        {
          reg: '^#(版本活动|活动帮助)$',
          fnc: 'huodonghelp',
        },
        {
          reg: '^#师徒帮助$',
          fnc: 'shituhelp',
        },
        {
          reg: '^#异界帮助$',
          fnc: 'yijiehelp',
        },
        {
          reg: '^#修仙版本日志$',
          fnc: 'showUpdateLog',
        }
      ],
    });
  }

  async showUpdateLog(e) {
    // 渲染数据
    const renderData = {
      pluResPath: `file://${process.cwd().replace(/\\/g, '/')}/plugins/xiuxian-emulator-plugin/resources/`
    };

    const htmlPath = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'resources', 'html', 'help', 'update_log.html');

    // 生成图片
    const img = await puppeteer.screenshot('help', {
      tplFile: htmlPath,
      ...renderData,
      imgType: 'jpeg',
      quality: 90
    });

    await e.reply(img);
  }

  async yijiehelp(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let data = await yijieHelp.yiijehelp(e);
    if (!data) return;
    let img = await this.cache(data);
    await e.reply(img)
  }

  async huodonghelp(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let data = await Help3.huodonghelp(e);
    if (!data) return;
    let img = await this.cache(data);
    await e.reply(img);
  }

  async xunbaohelp(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let data = await Help1.xunbaohelp(e);
    if (!data) return;
    let img = await this.cache(data);
    await e.reply(img);
  }

  async Xiuxianhelpcopy(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let data = await Help.gethelpcopy(e);
    if (!data) return;
    let img = await this.cache(data);
    await e.reply(img);
  }

  /**
   * rule - 修仙帮助
   * @returns
   */
  async Xiuxianhelp(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let data = await Help.get(e);
    if (!data) return;
    let img = await this.cache(data);
    await e.reply(img);
  }

  async adminsuper(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let data = await Help.setup(e);
    if (!data) return;
    let img = await this.cache(data);
    await e.reply(img);
  }

  async AssociationAdmin(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let data = await Help.Association(e);
    if (!data) return;
    let img = await this.cache(data);
    await e.reply(img);
  }

  async shituhelp(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let data = await Help2.shituhelp(e);
    if (!data) return;
    let img = await this.cache(data);
    await e.reply(img);
  }

  async cache(data) {
    let tmp = md5(JSON.stringify(data));
    if (helpData.md5 == tmp) return helpData.img;
    helpData.img = await customPuppeteer.screenshot('help', data);
    helpData.md5 = tmp;
    return helpData.img;
  }
}
