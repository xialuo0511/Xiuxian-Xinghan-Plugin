import plugin from '../../../../lib/plugins/plugin.js';
import {
  getBlessPlaceList,
  getSecretPlaceList,
  enterBlessPlace,
  contestBlessPlace,
  exploreLingmai,
  checkLastExploreTime,
  buildGuild,
  exploreSecretPlace,
  handleSecretPlaceBattle
} from '../../logic/bless_place_logic.js';
import { existplayer } from '../../model/player.js';
import { Read_player } from '../../model/Cache.js';
import { ForwardMsg } from '../../model/ForwardMsg.js';

export class BlessPlace extends plugin {
  constructor() {
    super({
      name: 'BlessPlace',
      dsc: '洞天福地',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#洞天福地列表$',
          fnc: 'List_blessPlace'
        },
        {
          reg: '^#开采灵脉$',
          fnc: 'exploitation_vein'
        },
        {
          reg: '^#入驻洞天.*$',
          fnc: 'Settled_Blessed_Place'
        },
        {
          reg: '^#建设宗门$',
          fnc: 'construction_Guild'
        },
        {
          reg: '^#宗门秘境$',
          fnc: 'mij'
        },
        {
          reg: '^#探索宗门秘境.*$',
          fnc: 'Go_Guild_Secrets'
        },
        {
          reg: '^#沉迷宗门秘境.*$',
          fnc: 'Go_Guild_Secretsplus'
        }

      ]
    });
  }

  /**
   * 洞天福地列表
   */
  async List_blessPlace(e) {
    if (!e.isGroup) return;

    try {
      const result = await getBlessPlaceList();
      if (result.success) {
        await ForwardMsg(e, result.data);
      } else {
        e.reply(result.message);
      }
    } catch (error) {
      console.error('洞天福地列表获取失败:', error);
      e.reply('获取洞天福地列表失败，请稍后重试');
    }
  }

  /**
   * 宗门秘境列表
   */
  async mij(e) {
    if (!e.isGroup) return;

    try {
      const result = await getSecretPlaceList();
      if (result.success) {
        await ForwardMsg(e, result.data);
      } else {
        e.reply(result.message);
      }
    } catch (error) {
      console.error('宗门秘境列表获取失败:', error);
      e.reply('获取宗门秘境列表失败，请稍后重试');
    }
  }

  /**
   * 入驻洞天福地
   */
  async Settled_Blessed_Place(e) {
    if (!e.isGroup) return;

    const usr_qq = e.user_id;
    const placeName = e.msg.replace(/^#入驻洞天/, '').trim();

    if (!placeName) {
      e.reply('请指定要入驻的洞天福地名称');
      return;
    }

    // 基础检查
    const ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return;

    try {
      const result = await enterBlessPlace(usr_qq, placeName);
      e.reply(result.message);
    } catch (error) {
      console.error('入驻洞天福地失败:', error);
      e.reply('入驻洞天福地失败，请稍后重试');
    }
  }

  /**
   * 开采灵脉
   */
  async exploitation_vein(e) {
    if (!e.isGroup) return;

    const usr_qq = e.user_id;

    // 基础检查
    const ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return;

    try {
      const result = await exploreLingmai(usr_qq);
      e.reply(result.message);
    } catch (error) {
      console.error('开采灵脉失败:', error);
      e.reply('开采灵脉失败，请稍后重试');
    }
  }

  /**
   * 探索宗门秘境
   */
  async Go_Guild_Secrets(e) {
    if (!e.isGroup) return;

    const usr_qq = e.user_id;
    const secretName = e.msg.replace(/^#探索宗门秘境/, '').trim();

    if (!secretName) {
      e.reply('请指定要探索的秘境名称');
      return;
    }

    // 基础检查
    const ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return;

    try {
      const result = await exploreSecretPlace(usr_qq, secretName, false);
      e.reply(result.message);
    } catch (error) {
      console.error('探索宗门秘境失败:', error);
      e.reply('探索宗门秘境失败，请稍后重试');
    }
  }

  /**
   * 沉迷宗门秘境
   */
  async Go_Guild_Secretsplus(e) {
    if (!e.isGroup) return;

    const usr_qq = e.user_id;
    const secretName = e.msg.replace(/^#沉迷宗门秘境/, '').trim();

    if (!secretName) {
      e.reply('请指定要沉迷的秘境名称');
      return;
    }

    // 基础检查
    const ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return;

    try {
      const result = await exploreSecretPlace(usr_qq, secretName, true);
      e.reply(result.message);
    } catch (error) {
      console.error('沉迷宗门秘境失败:', error);
      e.reply('沉迷宗门秘境失败，请稍后重试');
    }
  }

  /**
   * 宗门建设
   */
  async construction_Guild(e) {
    if (!e.isGroup) return;

    const usr_qq = e.user_id;

    // 基础检查
    const ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return;

    try {
      const result = await buildGuild(usr_qq);
      e.reply(result.message);
    } catch (error) {
      console.error('宗门建设失败:', error);
      e.reply('宗门建设失败，请稍后重试');
    }
  }
}

// 导出辅助函数供其他模块使用
export { handleSecretPlaceBattle };