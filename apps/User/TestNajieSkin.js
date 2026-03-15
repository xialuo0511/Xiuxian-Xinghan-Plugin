import plugin from '../../../../lib/plugins/plugin.js';
import Show from '../../model/show.js';
import customPuppeteer from '../../api/puppeteer-wrapper.js';
import * as DAL from '../../api/data-access.js';
import * as SkinLogic from '../../logic/skin_logic.js';
import { prepareNajieRenderData } from '../../logic/najie_view_logic.js';

export class TestNajieSkin extends plugin {
  constructor() {
    super({
      name: '纳戒主题测试',
      dsc: '测试纳戒主题渲染',
      event: 'message',
      priority: 500,
      rule: [
        {
          reg: '^#测试纳戒(.+)$',
          fnc: 'testNajieSkin'
        }
      ]
    });
  }

  async testNajieSkin(e) {
    if (!e.isMaster) {
      return e.reply('仅管理员可使用此指令');
    }

    if (!e.isGroup) {
      return e.reply('请在群聊中使用此指令');
    }

    const userId = e.user_id;
    if (!await DAL.existPlayer(userId)) {
      return e.reply('请先发送#踏入仙途创建角色');
    }

    const skinName = e.msg.replace(/^#测试纳戒/, '').trim();
    if (!skinName) {
      return e.reply('请输入皮肤名称，例如：#测试纳戒雨霁青岚');
    }

    const skin = SkinLogic.FindSkinByName(skinName);
    if (!skin) {
      return e.reply(`未找到名为【${skinName}】的皮肤`);
    }

    const najieView = await prepareNajieRenderData(userId, { page: 1, pageSize: 20 });
    if (!najieView || najieView.status !== 'success') {
      return e.reply(najieView?.message || '未找到纳戒数据');
    }

    const renderData = {
      ...najieView.renderData,
      skinConfig: skin
    };

    await e.reply(`正在预览纳戒主题【${skin.name}】...`);

    const dataForPuppeteer = await new Show(e).get_najieData(renderData);
    const img = await customPuppeteer.screenshot('najie', { ...dataForPuppeteer });
    await e.reply(img);
  }
}
