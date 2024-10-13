import plugin from '../../../../lib/plugins/plugin.js';
import common from '../../../../lib/common/common.js';
import config from '../../model/Config.js';
import fs, { read } from 'node:fs';
import {
  Add_najie_thing,
  Add_灵石,
  isNotNull,
  Read_player,
} from '../Xiuxian/xiuxian.js';
/**
 * 定时任务
 */

export class AuctionTask extends plugin {
  constructor() {
    super({
      name: 'AuctionTask',
      dsc: '定时任务',
      event: 'message',
      priority: 300,
      rule: [],
    });
    this.set = config.getdefSet('task', 'task');
    this.task = {
      cron: this.set.action_task,
      name: 'AuctionTask',
      fnc: () => this.Auctiontask(),
    };
  }

  async Auctiontask() {
    try {
      let auction = await redis.get('xiuxian:AuctionofficialTask');
      const redisGlKey = 'xiuxian:AuctionofficialTask_GroupList';
      const groupList = await redis.sMembers(redisGlKey);
      console.log(groupList)
      if (!isNotNull(auction) || !groupList) {
        return;
      }
      try {
        auction = JSON.parse(auction);
      } catch (error) {
        console.log(error);
      }

      let nowTime = new Date().getTime();
      let msg = '';
      let last_offer_price = auction.last_offer_price;
      if (auction.last_offer_price + 5 * 60 * 1000 > nowTime) {
        let m = parseInt(
          (last_offer_price + 5 * 60 * 1000 - nowTime) / 1000 / 60
        );
        let s = parseInt(
          (last_offer_price + 5 * 60 * 1000 - nowTime - m * 60 * 1000) / 1000
        );
        msg = `${auction.thing.name}拍卖中，距离拍卖结束还有${m}分${s}秒，目前最高价${auction.last_price}`;
        for (let group_id of groupList) {
          this.pushInfo(group_id, true, msg);
        }
      } else {
        let last_offer_player = auction.last_offer_player;
        if (last_offer_player == 0) {
          // await Add_najie_thing(
          //   auction.qq,
          //   auction.thing.name,
          //   auction.thing.class,
          //   auction.amount,
          //   auction.thing.pinji
          // );
          let player = await Read_player(auction.qq);
          msg = `流拍，${auction.thing.name}已退回${player.名号}的纳戒`;
        } else {
          await Add_灵石(last_offer_player, -auction.last_price);
          await Add_najie_thing(
            last_offer_player,
            auction.thing.name,
            auction.thing.class,
            auction.amount,
            auction.thing.pinji
          );
          await Add_灵石(auction.qq, parseInt(auction.last_price * 0.9));
          let player = await Read_player(last_offer_player);
          msg = `拍卖结束，${player.名号}最终拍得该物品！`;
        }

        for (let group_id of groupList) {
          this.pushInfo(group_id, true, msg);
        }
        await redis.del('xiuxian:auction');
      }
    } catch (error) {
      console.log("AuctionTask异常： " + error);
    }

  }

  /**
   * 推送消息，群消息推送群，或者推送私人
   * @param id
   * @param is_group
   * @returns {Promise<void>}
   */
  async pushInfo(id, is_group, msg) {
    if (is_group) {
      await Bot.pickGroup(id)
        .sendMsg(msg)
        .catch(err => {
          logger.mark(err);
        });
    } else {
      await common.relpyPrivate(id, msg);
    }
  }
}
