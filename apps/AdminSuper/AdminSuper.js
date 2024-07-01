import plugin from '../../../../lib/plugins/plugin.js';
import fs from 'node:fs';
import data from '../../model/XiuxianData.js';
import config from '../../model/Config.js';
import {
  existplayer,
  Add_修为,
  Add_血气,
  Add_顶级仙石,
  isNotNull,
  Write_player,
  Write_najie,
  Read_equipment,
  Read_najie,
  Write_equipment,
  ForwardMsg,
  TEXT_battle,
  Read_updata_log,
  Add_HP,
  Add_najie_thing,
  exist_najie_thing,
  Write_yijie_player,
  Write_yijie_beibao
} from '../Xiuxian/xiuxian.js';
import { Read_Exchange, Write_Exchange } from '../Exchange/Exchange.js';
import { Read_player, __PATH } from '../Xiuxian/xiuxian.js';
import { Read_Forum, Write_Forum } from '../Help/Forum.js';
import { createRequire } from "module"
import { get_yijie_player_img } from '../ShowImeg/showData.js'

const require = createRequire(import.meta.url)
const { execSync } = require("child_process")

//如需截图必须引入以下两库
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';
import { sql_run } from '../../api/api.js';

/**
 * 修仙设置
 */
export class AdminSuper extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_AdminSuper',
      dsc: '修仙设置',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: '^#解封.*$',
          fnc: 'relieve',
        },
        {
          reg: '^#解除所有$',
          fnc: 'Allrelieve',
        },
        {
          reg: '^#打落凡间.*$',
          fnc: 'Knockdown',
        },
        {
          reg: '^#清除冲水堂$',
          fnc: 'Deleteexchange',
        },
        {
          reg: '^#清除.*$',
          fnc: 'Deletepurchase',
        },
        {
          reg: '^#放出怪物$',
          fnc: 'OpenBoss',
        },
        {
          reg: '^#关上怪物$',
          fnc: 'DeleteBoss',
        },
        {
          reg: '^#清空委托$',
          fnc: 'DeleteForum',
        },
        {
          reg: '^#修仙世界$',
          fnc: 'Worldstatistics',
        },
        {
          reg: '^#发修为补偿.*$',
          fnc: 'xiuweiFuli',
        },
        {
          reg: '^#扣修为(.*)$',
          fnc: 'xiuweiDeduction',
        },
        {
          reg: '^#发血气补偿(.*)$',
          fnc: 'xueqiFuli',
        },
        {
          reg: '^#发顶级仙石(.*)$',
          fnc: 'faxianshi',
        },
        {
          reg: '^#扣血气(.*)$',
          fnc: 'xueqiDeduction',
        },
        {
          reg: '^#测试$',
          fnc: 'cesi',
        },
        {
          reg: '^#查看日志$',
          fnc: 'show_log',
        },
        {
          reg: '^#炼丹师更新$',
          fnc: 'liandanshi',
        },
        {
          reg: '^#自降修为.*$',
          fnc: 'off_xiuwei',
        },
        {
          reg: '^#自降境界至(.*)$',
          fnc: 'off_level',
        },
        {
          reg: '#全体清除(装备|道具|丹药|功法|草药|材料|盒子|仙宠|口粮|项链|食材)(抹除|替换为.*的的(装备|道具|丹药|功法|草药|材料|盒子|仙宠|口粮|项链|食材))$',
          fnc: 'replaceThing',
        },
        {
          reg: '#查看玩家面板.*$',
          fnc: 'mianban',
        },
        {
          reg: '#开通初级道法仙术.*$',
          fnc: 'ktdfxt',
        },
        {
          reg: '#取消开通初级道法仙术.*$',
          fnc: 'qx_ktdfxt',
        },
        {
          reg: '#开通高级道法仙术.*$',
          fnc: 'ktgjdfxt',
        },
        {
          reg: '#领取本月头像框$',
          fnc: 'lqtxk',
        }
      ],
    });
    this.xiuxianConfigData = config.getConfig('xiuxian', 'xiuxian');
  }

  async lqtxk(e) {
    let usr_qq = e.user_id
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
      e.reply(`请先踏入仙途`);
      return;
    }
    let player = await Read_player(usr_qq)
    let nowtime = new Date().getTime();
    if (player.daofaxianshu_endtime < nowtime) {
      e.reply(`请先开通【道法仙术】！`);
      return;
    }
    if (!player.all_touxiangkuang.find(item => item.name == "春花清明")) {
      let Touxiang = data.Touxiang_list.find(item => item.name == "春花清明")
      player.all_touxiangkuang.push(Touxiang)
      await Write_player(usr_qq, player)
      e.reply("领取成功！恭喜获得本月限定头像框【春花清明】")
      return;
    } else {
      e.reply("您已经领取过啦！")
      return;
    }
  }

  async ktdfxt(e) {
    if (!e.isMaster) {
      return;
    }
    let nowtime = new Date().getTime();
    let usr_qq
    try {
      let atItem = e.message.filter(item => item.type === 'at');
      usr_qq = atItem[0].qq;
    } catch (error) {
      usr_qq = e.msg.replace("#开通初级道法仙术", "");
    }
    let ifexistplay = data.existData("player", usr_qq);
    if (!ifexistplay) {
      return;
    }
    let player = await Read_player(usr_qq);
    let daofaxianshu_endtime = 2678400000
    if (player.daofaxianshu_endtime < nowtime) {
      player.daofaxianshu_endtime = daofaxianshu_endtime + nowtime
    } else {
      player.daofaxianshu_endtime += daofaxianshu_endtime
    }
    player.daofaxianshu = 1
    await Write_player(usr_qq, player)
    e.reply("开通成功！【初级道法仙术】的有效时长增加31天")
    return;
  }

  async ktgjdfxt(e) {
    if (!e.isMaster) {
      return;
    }
    let nowtime = Date.now()
    //没有at信息直接返回,不执行
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) {
      return;
    }
    //获取at信息
    let atItem = e.message.filter(item => item.type === 'at');
    //对方qq
    let usr_qq = atItem[0].qq;
    let ifexistplay = data.existData("player", usr_qq);
    if (!ifexistplay) {
      return;
    }
    let player = await Read_player(usr_qq);
    let daofaxianshu_endtime = 2592000000
    if (Number(player.daofaxianshu_endtime) < nowtime) {
      player.daofaxianshu_endtime = daofaxianshu_endtime + nowtime
    } else {
      player.daofaxianshu_endtime += daofaxianshu_endtime
    }
    player.daofaxianshu = 2
    await Write_player(usr_qq, player)
    e.reply("开通成功！【高级道法仙术】的有效时长增加30天")
    return;
  }

  async mianban(e) {
    if (!e.isMaster) {
      return;
    }
    //获取发送修为数量
    let usr_qq = e.msg.replace('#查看玩家面板', '');
    let ifexistplay = data.existData("yijie_player", usr_qq);
    if (!ifexistplay) {
      return;
    }
    let a = {}
    a.user_id = usr_qq
    let img = await get_yijie_player_img(a)
    e.reply(img);
    return;
  }

  async off_xiuwei(e) {
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let usr_qq = e.user_id;
    //有无账号
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
      return;
    }
    var number2 = e.msg.replace('#自降修为', '');
    let player = await Read_player(usr_qq);
    number2 = Math.floor(number2);
    if (number2 < 0) {
      number2 = 1000;
    }
    if (player.修为 < number2) {
      e.reply('你没有那么多修为');
      return;
    }
    Number(number2);
    if (!isNotNull(number2)) {
      e.reply('未输入数量');
      return;
    }
    if (number2 == '') {
      e.reply('你输入了个啥');
      return;
    }
    let containSpecial = new RegExp(/^[1-9]\d*$/);
    console.log(containSpecial.test(number2));
    if (!containSpecial.test(number2)) {
      e.reply('你小子');
      return;
    }
    await Add_修为(usr_qq, -number2);
    e.reply('扣除成功');
  }
  async off_level(e) {
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let usr_qq = e.user_id;
    //有无账号
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
      return;
    }
    var number2 = e.msg.replace('#自降境界至', '');
    let player = await Read_player(usr_qq);
    let newjingjie = data.Level_list.find(item => item.level == number2);
    if (!isNotNull(newjingjie)) {
      e.reply('未找到' + number2 + '境界');
      return;
    }
    if (player.level_id < newjingjie.level_id) {
      e.reply('你小子');
      return;
    }
    if (newjingjie.level_id < 42 && player.level_id > 41) {
      e.reply('你想再渡一次劫？');
      return;
    }
    //境界下降,攻防血重新加载,当前血量拉满
    if (newjingjie.level_id == 1) {
      e.reply('修仙者还想回归尘世？');
      return;
    }
    let oldjingjie = data.Level_list.find(
      item => item.level_id == player.level_id
    );

    player.level_id = newjingjie.level_id;

    player.攻击 -= oldjingjie.基础攻击;
    player.防御 -= oldjingjie.基础防御;
    player.血量上限 -= oldjingjie.基础血量;
    player.暴击率 -= oldjingjie.基础暴击;
    await Write_player(usr_qq, player);
    player.攻击 += newjingjie.基础攻击;
    player.防御 += newjingjie.基础防御;
    player.血量上限 += newjingjie.基础血量;
    player.暴击率 += newjingjie.基础暴击;
    await Write_player(usr_qq, player);
    //刷新装备
    let equipment = await Read_equipment(usr_qq);
    await Write_equipment(usr_qq, equipment);
    //补血
    await Add_HP(usr_qq, 99999999);
    e.reply('扣除成功');
  }
  async liandanshi(e) {
    if (!e.isMaster) {
      e.reply('你凑什么热闹');
      return;
    }
    let File = fs.readdirSync(__PATH.player_path);
    File = File.filter(file => file.endsWith('.json'));
    let File_length = File.length;
    let action1 = [];
    let i = 0;
    for (let k = 0; k < File_length; k++) {
      let this_qq = File[k].replace('.json', '');
      this_qq = parseInt(this_qq);
      action1[i] = {
        biguan: 0, //闭关状态
        biguanxl: 0, //增加效率
        xingyun: 0,
        lianti: 0,
        ped: 0,
        modao: 0,
        beiyong1: 0,
        beiyong2: 0,
        beiyong3: 0,
        beiyong4: 0,
        beiyong5: 0,
        qq: this_qq,
      };
      i++;
    }
    await redis.set(
      'xiuxian:player:' + 10 + ':biguang',
      JSON.stringify(action1)
    );

    e.reply('更新完毕');
    return;
  }

  async show_log(e) {
    let cm = 'git log -100 --oneline --pretty=format:"%h||[%cd]  %s" --date=format:"%m-%d %H:%M"'
    if (plugin) { cm = `cd ./plugins/xiuxian-emulator-plugin/ && ${cm}` }
    let logAll
    try { logAll = execSync(cm, { encoding: 'utf-8' }) } catch (error) { that.e.reply(error.toString(), true) }
    if (!logAll) return false
    logAll = logAll.split('\n')
    let log = []
    for (let str of logAll) {
      str = str.split('||')
      if (str[1].includes('Merge branch')) continue
      log.push(str[1])
    }
    log.forEach((item, index) => {
      // 删除空项
      if (!item) {
        log.splice(index, 1);
      }
    });
    let log_data = {
      log,
    };
    const data1 = await new Show(e).get_logData(log_data);
    let img = await puppeteer.screenshot('log', {
      ...data1,
    });
    e.reply(img);
    return;
  }

  async tiaoshi(e) {
    if (!e.isMaster) {
      e.reply('你凑什么热闹');
      return;
    }
    //str = '123';
    e.reply(img('http://119.23.246.247/index.php/archives/1/'));
    // let log_data = {
    //   log: str,
    // };
    // const data1 = await new Show(e).get_logData(log_data);
    // let img = await puppeteer.screenshot('http://119.23.246.247/index.php/archives/1/', {
    //   ...data1,
    // });
    // e.reply(img);
    return;
  }

  async cesi(e) {
    if (!e.isMaster) {
      e.reply('你凑什么热闹');
      return;
    }
    let a = await sql_run('select * from acton')
    console.log(a)
    return;
  }

  //修为补偿
  async xiuweiFuli(e) {
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    if (!e.isMaster) {
      return;
    }
    //获取发送修为数量
    let xiuweibuchang = e.msg.replace('#', '');
    xiuweibuchang = xiuweibuchang.replace('发', '');
    xiuweibuchang = xiuweibuchang.replace('修为补偿', '');
    const pattern = new RegExp('[0-9]+');
    const str = xiuweibuchang;
    if (!pattern.test(str)) {
      e.reply(`错误福利`);
      return;
    }
    //校验输入修为数
    if (
      parseInt(xiuweibuchang) == parseInt(xiuweibuchang) &&
      parseInt(xiuweibuchang) > 0
    ) {
      xiuweibuchang = parseInt(xiuweibuchang);
    } else {
      xiuweibuchang = 100; //没有输入正确数字或不是正数
    }
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) {
      return;
    }
    let atItem = e.message.filter(item => item.type === 'at');
    let this_qq = atItem[0].qq;
    //有无存档
    let ifexistplay = await existplayer(this_qq);
    if (!ifexistplay) {
      e.reply(`此人尚未踏入仙途`);
      return;
    }
    let player = await data.getData('player', this_qq);
    await Add_修为(this_qq, xiuweibuchang);
    e.reply(`【全服公告】 ${player.名号} 获得${xiuweibuchang}修为的补偿`);
    return;
  }

  async faxianshi(e) {
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    if (!e.isMaster) {
      return;
    }
    //获取发送修为数量
    let xiuweibuchang = e.msg.replace('#', '');
    xiuweibuchang = xiuweibuchang.replace('发', '');
    xiuweibuchang = xiuweibuchang.replace('顶级仙石', '');
    const pattern = new RegExp('[0-9]+');
    const str = xiuweibuchang;
    if (!pattern.test(str)) {
      e.reply(`错误福利`);
      return;
    }
    //校验输入修为数
    if (parseInt(xiuweibuchang) == parseInt(xiuweibuchang)) {
      xiuweibuchang = parseInt(xiuweibuchang);
    } else {
      xiuweibuchang = 1; //没有输入正确数字或不是正数
    }
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) {
      return;
    }
    let atItem = e.message.filter(item => item.type === 'at');
    let this_qq = atItem[0].qq;
    //有无存档
    let ifexistplay = await existplayer(this_qq);
    if (!ifexistplay) {
      e.reply(`此人尚未踏入仙途`);
      return;
    }
    let player = await data.getData('player', this_qq);
    await Add_顶级仙石(this_qq, xiuweibuchang);
    e.reply(`【全服公告】 ${player.名号} 获得顶级仙石*${xiuweibuchang}`);
    return;
  }

  // #扣修为
  async xiuweiDeduction(e) {
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    if (!e.isMaster) {
      return;
    }
    //获取发送修为数量
    let xiuweibuchang = e.msg.replace('#扣修为', '');
    const pattern = new RegExp('[0-9]+');
    if (!pattern.test(xiuweibuchang)) {
      e.reply(`错误福利`);
      return;
    }
    //校验输入修为数
    if (
      parseInt(xiuweibuchang) == parseInt(xiuweibuchang) &&
      parseInt(xiuweibuchang) > 0
    ) {
      xiuweibuchang = parseInt(xiuweibuchang);
    } else {
      xiuweibuchang = 100; //没有输入正确数字或不是正数
    }
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) {
      return;
    }
    let atItem = e.message.filter(item => item.type === 'at');
    let this_qq = atItem[0].qq;
    //有无存档
    let ifexistplay = await existplayer(this_qq);
    if (!ifexistplay) {
      e.reply(`此人尚未踏入仙途`);
      return;
    }
    let player = await data.getData('player', this_qq);
    await Add_修为(this_qq, -xiuweibuchang);
    e.reply(`${player.名号}被扣除${xiuweibuchang}修为`);
    return;
  }

  // 血气补偿
  async xueqiFuli(e) {
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    if (!e.isMaster) {
      return;
    }
    //获取发送修为数量
    let xueqibuchang = e.msg.replace('#', '');
    xueqibuchang = xueqibuchang.replace('发', '');
    xueqibuchang = xueqibuchang.replace('血气补偿', '');
    const pattern = new RegExp('[0-9]+');
    const str = xueqibuchang;
    if (!pattern.test(str)) {
      e.reply(`错误福利`);
      return;
    }
    //校验输入修为数
    if (
      parseInt(xueqibuchang) == parseInt(xueqibuchang) &&
      parseInt(xueqibuchang) > 0
    ) {
      xueqibuchang = parseInt(xueqibuchang);
    } else {
      xueqibuchang = 100; //没有输入正确数字或不是正数
    }
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) {
      return;
    }
    let atItem = e.message.filter(item => item.type === 'at');
    let this_qq = atItem[0].qq;
    //有无存档
    let ifexistplay = await existplayer(this_qq);
    if (!ifexistplay) {
      e.reply(`此人尚未踏入仙途`);
      return;
    }
    let player = await data.getData('player', this_qq);
    await Add_血气(this_qq, xueqibuchang);
    e.reply(`【全服公告】 ${player.名号} 获得${xueqibuchang}血气的补偿`);
    return;
  }

  // #扣血气
  async xueqiDeduction(e) {
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    if (!e.isMaster) {
      return;
    }
    //获取发送修为数量
    let xueqibuchang = e.msg.replace('#扣血气', '');
    const pattern = new RegExp('[0-9]+');
    if (!pattern.test(xueqibuchang)) {
      e.reply(`错误福利`);
      return;
    }
    //校验输入修为数
    if (
      parseInt(xueqibuchang) == parseInt(xueqibuchang) &&
      parseInt(xueqibuchang) > 0
    ) {
      xueqibuchang = parseInt(xueqibuchang);
    } else {
      xueqibuchang = 100; //没有输入正确数字或不是正数
    }
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) {
      return;
    }
    let atItem = e.message.filter(item => item.type === 'at');
    let this_qq = atItem[0].qq;
    //有无存档
    let ifexistplay = await existplayer(this_qq);
    if (!ifexistplay) {
      e.reply(`此人尚未踏入仙途`);
      return;
    }
    let player = await data.getData('player', this_qq);
    await Add_血气(this_qq, -xueqibuchang);
    e.reply(`${player.名号}被扣除${xueqibuchang}血气`);
    return;
  }

  async Worldstatistics(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    if (!e.isMaster) {
      return;
    }
    let acount = 0;
    let lower = 0;
    let senior = 0;
    lower = Number(lower);
    senior = Number(senior);
    //获取缓存中人物列表
    let playerList = [];
    let files = fs
      .readdirSync(
        './plugins/xiuxian-emulator-plugin/resources/data/xiuxian_player'
      )
      .filter(file => file.endsWith('.json'));
    for (let file of files) {
      file = file.replace('.json', '');
      playerList.push(file);
    }
    for (let player_id of playerList) {
      let player = await Read_player(player_id);
      let now_level_id;

      now_level_id = data.Level_list.find(
        item => item.level_id == player.level_id
      ).level_id;
      if (now_level_id <= 41) {
        lower++;
      } else {
        senior++;
      }
      acount++;
    }
    let msg = [];
    let Worldmoney = await redis.get('Xiuxian:Worldmoney');
    if (
      Worldmoney == null ||
      Worldmoney == undefined ||
      Worldmoney <= 0 ||
      Worldmoney == NaN
    ) {
      Worldmoney = 1;
    }
    Worldmoney = Number(Worldmoney);
    if (Worldmoney < 10000) {
      Worldmoney = Worldmoney.toFixed(2);
      msg = [
        '___[修仙世界]___' +
        '\n人数：' +
        acount +
        '\n修道者：' +
        senior +
        '\n修仙者：' +
        lower +
        '\n财富：' +
        Worldmoney +
        '\n人均：' +
        (Worldmoney / acount).toFixed(3),
      ];
    } else if (Worldmoney > 10000 && Worldmoney < 1000000) {
      Worldmoney = Worldmoney / 10000;
      Worldmoney = Worldmoney.toFixed(2);
      msg = [
        '___[修仙世界]___' +
        '\n人数：' +
        acount +
        '\n修道者：' +
        senior +
        '\n修仙者：' +
        lower +
        '\n财富：' +
        Worldmoney +
        '万' +
        '\n人均：' +
        (Worldmoney / acount).toFixed(3) +
        '万',
      ];
    } else if (Worldmoney > 1000000 && Worldmoney < 100000000) {
      Worldmoney = Worldmoney / 1000000;
      Worldmoney = Worldmoney.toFixed(2);
      msg = [
        '___[修仙世界]___' +
        '\n人数：' +
        acount +
        '\n修道者：' +
        senior +
        '\n修仙者：' +
        lower +
        '\n财富：' +
        Worldmoney +
        '百万' +
        '\n人均：' +
        (Worldmoney / acount).toFixed(3) +
        '百万',
      ];
    } else if (Worldmoney > 100000000) {
      Worldmoney = Worldmoney / 100000000;
      Worldmoney = Worldmoney.toFixed(2);
      msg = [
        '___[修仙世界]___' +
        '\n人数：' +
        acount +
        '\n修道者：' +
        senior +
        '\n修仙者：' +
        lower +
        '\n财富：' +
        Worldmoney +
        '亿' +
        '\n人均：' +
        (Worldmoney / acount).toFixed(3) +
        '亿',
      ];
    }
    await ForwardMsg(e, msg);
    return;
  }

  async DeleteForum(e) {
    if (!e.isMaster) {
      return;
    }
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let Forum;
    try {
      Forum = await Read_Forum();
    } catch {
      await Write_Forum([]);
      Forum = await Read_Forum();
    }
    for (let i = 0; i < Forum.length; i++) {
      Forum = Forum.filter(item => item.qq != Forum[i].qq);
      Write_Forum(Forum);
    }
    e.reply('已清理！');
    return;
  }

  async DeleteForum(e) {
    if (!e.isMaster) {
      return;
    }
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let Forum;
    try {
      Forum = await Read_Forum();
    } catch {
      await Write_Forum([]);
      Forum = await Read_Forum();
    }
    for (let i = 0; i < Forum.length; i++) {
      Forum = Forum.filter(item => item.qq != Forum[i].qq);
      Write_Forum(Forum);
    }
    e.reply('已清理！');
    return;
  }

  async DeleteBoss(e) {
    if (!e.isMaster) {
      return;
    }
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    //boss分为金角大王、银角大王、魔王
    //魔王boss
    await redis.set('BossMaxplus', 1);
    await redis.del('BossMaxplus');
    //金角大王
    await redis.set('BossMax', 1);
    await redis.del('BossMax');
    //银角大王
    await redis.set('BossMini', 1);
    await redis.del('BossMini');
    e.reply('关闭成功');
    return;
  }

  async OpenBoss(e) {
    if (!e.isMaster) {
      return;
    }
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let User_maxplus = 1; //所有仙人数
    User_maxplus = Number(User_maxplus);
    let User_max = 1; //所有高段
    User_max = Number(User_max);
    let User_mini = 1; //所有低段
    User_mini = Number(User_mini);
    let playerList = [];
    let files = fs
      .readdirSync(
        './plugins/xiuxian-emulator-plugin/resources/data/xiuxian_player'
      )
      .filter(file => file.endsWith('.json'));
    for (let file of files) {
      file = file.replace('.json', '');
      playerList.push(file);
    }
    for (let player_id of playerList) {
      let usr_qq = player_id;
      //读取信息
      let player = await Read_player(usr_qq);
      let now_level_id;
      if (!isNotNull(player.level_id)) {
        return;
      }
      now_level_id = data.Level_list.find(
        item => item.level_id == player.level_id
      ).level_id;
      if (now_level_id >= 42) {
        User_maxplus++;
      } else if (now_level_id > 21 && now_level_id < 42) {
        User_max++;
      } else {
        User_mini++;
      }
    }
    //打一下多少灵石
    //魔王初始化
    let money = 1000 * this.xiuxianConfigData.Boss.Boss;
    let attack = money * 2;
    let defense = money * 2;
    let blood = money * 2;
    //限制最高人数
    if (User_maxplus >= 30) {
      User_maxplus = 30;
    }
    //这里判断一下，为1就不丢数据了。
    await redis.set('BossMaxplus', 1);
    if (User_maxplus != 1) {
      //初始化属性
      let BossMaxplus = {
        name: '魔王',
        attack: attack * User_maxplus * 3,
        defense: defense * User_maxplus * 3,
        blood: blood * User_maxplus * 3,
        probability: '0.7',
        money: money * User_maxplus * 3,
        linggen: '仙之心·水',
      };
      //redis初始化
      await redis.set('xiuxian:BossMaxplus', JSON.stringify(BossMaxplus));
      await redis.set('BossMaxplus', 0);
    }
    if (User_max >= 25) {
      User_max = 25;
    }
    await redis.set('BossMax', 1);
    if (User_max != 1) {
      //初始化属性
      let BossMax = {
        name: '金角大王',
        attack: attack * User_max * 2,
        defense: defense * User_max * 2,
        blood: blood * User_max * 2,
        probability: '0.5',
        money: money * User_max * 2,
        linggen: '仙之心·火',
      };
      //redis初始化
      await redis.set('xiuxian:BossMax', JSON.stringify(BossMax));
      //金角大王
      await redis.set('BossMax', 0);
    }
    if (User_mini >= 20) {
      User_mini = 20;
    }
    await redis.set('BossMini', 1);
    if (User_mini != 1) {
      //初始化属性
      let BossMini = {
        name: '银角大王',
        attack: attack * User_mini,
        defense: defense * User_mini,
        blood: blood * User_mini,
        probability: '0.3',
        money: money * User_mini,
        linggen: '仙之心·风',
      };
      //redis初始化
      await redis.set('xiuxian:BossMini', JSON.stringify(BossMini));
      //银角大王
      await redis.set('BossMini', 0);
    }
    e.reply('开启成功');
    return;
  }

  async Deletepurchase(e) {
    if (!e.isMaster) {
      return;
    }
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    let thingqq = e.msg.replace('#', '');
    //拿到物品与数量
    thingqq = thingqq.replace('清除', '');
    if (thingqq == '') {
      return;
    }
    let x = 888888888;
    //根据物品的qq主人来购买
    let Exchange;
    try {
      Exchange = await Read_Exchange();
    } catch {
      //没有表要先建立一个！
      await Write_Exchange([]);
      Exchange = await Read_Exchange();
    }
    for (let i = 0; i < Exchange.length; i++) {
      //对比编号
      if (Exchange[i].qq == thingqq) {
        x = i;
        break;
      }
    }
    if (x == 888888888) {
      e.reply('找不到该商品编号！');
      return;
    }
    //删除该位置信息
    Exchange = Exchange.filter(item => item.qq != thingqq);
    await Write_Exchange(Exchange);
    //改状态
    await redis.set('xiuxian:player:' + thingqq + ':Exchange', 0);
    e.reply('清除' + thingqq);
    return;
  }

  async Deleteexchange(e) {
    if (!e.isMaster) {
      return;
    }
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    e.reply('开始清除！');
    let Exchange;
    try {
      Exchange = await Read_Exchange();
    } catch {
      //没有表要先建立一个！
      await Write_Exchange([]);
      Exchange = await Read_Exchange();
    }
    for (let i = 0; i < Exchange.length; i++) {
      //自我清除
      Exchange = Exchange.filter(item => item.qq != Exchange[i].qq);
      Write_Exchange(Exchange);
    }
    //遍历所有人，清除redis
    let playerList = [];
    let files = fs
      .readdirSync(
        './plugins/xiuxian-emulator-plugin/resources/data/xiuxian_player'
      )
      .filter(file => file.endsWith('.json'));
    for (let file of files) {
      file = file.replace('.json', '');
      playerList.push(file);
    }
    for (let player_id of playerList) {
      await redis.set('xiuxian:player:' + player_id + ':Exchange', 0);
    }
    e.reply('清除完成！');
    return;
  }

  async Allrelieve(e) {
    if (!e.isMaster) {
      return;
    }
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    e.reply('开始行动！');
    let playerList = [];
    let files = fs
      .readdirSync(
        './plugins/xiuxian-emulator-plugin/resources/data/xiuxian_player'
      )
      .filter(file => file.endsWith('.json'));
    for (let file of files) {
      file = file.replace('.json', '');
      playerList.push(file);
    }
    for (let player_id of playerList) {
      //清除游戏状态
      await redis.set('xiuxian:player:' + player_id + ':game_action', 1);
      let action = await redis.get('xiuxian:player:' + player_id + ':action');
      action = JSON.parse(action);
      //不为空，存在动作
      if (action != null) {
        await redis.del('xiuxian:player:' + player_id + ':action');
        let arr = action;
        arr.is_jiesuan = 1; //结算状态
        arr.shutup = 1; //闭关状态
        arr.working = 1; //降妖状态
        arr.power_up = 1; //渡劫状态
        arr.Place_action = 1; //秘境
        arr.Place_actionplus = 1; //沉迷状态
        arr.end_time = new Date().getTime(); //结束的时间也修改为当前时间
        delete arr.group_id; //结算完去除group_id
        await redis.set(
          'xiuxian:player:' + player_id + ':action',
          JSON.stringify(arr)
        );
      }
    }
    e.reply('行动结束！');
  }

  async relieve(e) {
    //主人判断
    if (!e.isMaster) {
      return;
    }
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    //没有at信息直接返回,不执行
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) {
      return;
    }
    //获取at信息
    let atItem = e.message.filter(item => item.type === 'at');
    //对方qq
    let qq = atItem[0].qq;
    //检查存档
    let ifexistplay = await existplayer(qq);
    if (!ifexistplay) {
      return;
    }
    //清除游戏状态
    await redis.set('xiuxian:player:' + qq + ':game_action', 1);
    //查询redis中的人物动作
    let action = await redis.get('xiuxian:player:' + qq + ':action');
    action = JSON.parse(action);
    //不为空，有状态
    if (action != null) {
      //把状态都关了
      let arr = action;
      arr.is_jiesuan = 1; //结算状态
      arr.shutup = 1; //闭关状态
      arr.working = 1; //降妖状态
      arr.power_up = 1; //渡劫状态
      arr.Place_action = 1; //秘境
      arr.Place_actionplus = 1; //沉迷状态
      arr.end_time = new Date().getTime(); //结束的时间也修改为当前时间
      delete arr.group_id; //结算完去除group_id
      await redis.set('xiuxian:player:' + qq + ':action', JSON.stringify(arr));
      e.reply('已解除！');
      return;
    }
    //是空的
    e.reply('不需要解除！');
    return;
  }

  async Knockdown(e) {
    //主人判断
    if (!e.isMaster) {
      return;
    }
    //不开放私聊功能
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    //没有at信息直接返回,不执行
    let isat = e.message.some(item => item.type === 'at');
    if (!isat) {
      return;
    }
    //获取at信息
    let atItem = e.message.filter(item => item.type === 'at');
    //对方qq
    let qq = atItem[0].qq;
    //检查存档
    let ifexistplay = await existplayer(qq);
    if (!ifexistplay) {
      e.reply('没存档你打个锤子！');
      return;
    }
    let player = await Read_player(qq);
    player.power_place = 1;
    e.reply('已打落凡间！');
    await Write_player(qq, player);
    return;
  }

  async replaceThing(e) {
    //主人判断
    if (!e.isMaster) return;
    const msg1 = e.msg.replace('#将米娜桑的纳戒里叫', '');
    const [thingName, msg2] = msg1.split('的的的');

    // #全体清除.*的(装备|道具|丹药|功法|草药|材料|盒子|仙宠|口粮|项链|食材)(抹除|替换为.*的的(装备|道具|丹药|功法|草药|材料|盒子|仙宠|口粮|项链|食材))$
    if (e.msg.endsWith('清除')) {
      const thingType = msg2.replace(/清除$/, '');
      if (!thingName || !thingType)
        return e.reply(
          '格式错误'
        );
      await clearNajieThing(thingType, thingName);
      return e.reply('全部清除完成');
    }

    // 替换为
    const N = 1; // 倍数
    const [thingType, msg3] = msg2.split('替换为');
    const [newThingName, newThingType] = msg3.split(' 的的');
    const objArr = await clearNajieThing(thingType, thingName);
    objArr.map(uid_tnum => {
      const usrId = Object.entries(uid_tnum)[0][0];
      Add_najie_thing(usrId, newThingName, newThingType, uid_tnum.usrId * N);
    });
    return e.reply('全部替换完成');
  }
}

async function clearNajieThing(thingType, thingName) {
  if (!thingType || !thingName) return [];

  const path = './plugins/xiuxian-emulator-plugin/resources/data/xiuxian_najie';
  return fs
    .readdirSync(path)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const usrId = file.replace('.json', '');
      const najie = fs.readFileSync(`${path}/${file}`);
      const thingInNajie = JSON.parse(najie)[thingType]?.find(
        thing => thing.name == thingName
      );
      if (!thingInNajie) return false;

      let thingNumber = thingInNajie.数量;
      Add_najie_thing(usrId, thingName, thingType, -thingNumber);

      if (thingType == '装备') {
        ['劣', '普', '优', '精', '绝', '顶'].map(async pinji => {
          const thingNum = await exist_najie_thing(
            usrId,
            thingName,
            thingType,
            pinji
          );
          if (thingNum) {
            Add_najie_thing(usrId, thingName, thingType, -thingNum, pinji);
            thingNumber += thingNum;
          }
        });
      }

      return { [usrId]: thingNumber };
    })
    .filter(usrObj => usrObj);
}

export async function synchronization(e) {
  if (!e.isMaster) {
    return;
  }
  e.reply('存档开始同步');
  let playerList = [];
  let files = fs
    .readdirSync(
      './plugins/xiuxian-emulator-plugin/resources/data/xiuxian_player'
    )
    .filter(file => file.endsWith('.json'));
  for (let file of files) {
    file = file.replace('.json', '');
    playerList.push(file);
  }
  for (let player_id of playerList) {
    // let Whitelist = await data.Whitelist.find(item => item.qq == player_id);
    // if (Whitelist) {
    //   return;
    // }
    let usr_qq = player_id;
    let player = await data.getData('player', usr_qq);
    let najie = await Read_najie(usr_qq);
    //删
    // if (isNotNull(player.境界)) {
    //   player.境界 = undefined;
    // }
    //补
    if (!player.daofaxianshu) {
      player.daofaxianshu = 0;
    }
    if (!player.daofaxianshu_endtime) {
      player.daofaxianshu_endtime = 0;
    }
    if (!player.all_touxiangkuang) {
      player.all_touxiangkuang = [];
      let Touxiang = data.Touxiang_list.find(item => item.name == "默认头像框")
      player.all_touxiangkuang.push(Touxiang)
    }
    if (!player.zb_touxiangkuang) {
      player.zb_touxiangkuang = [];
      let Touxiang = data.Touxiang_list.find(item => item.name == "默认头像框")
      player.zb_touxiangkuang.push(Touxiang)
    }
    // if (!isNotNull(player.辟谷丹)) {
    //     player.辟谷丹 = 0;
    // }
    await Write_player(usr_qq, player);
  }
  e.reply('存档同步结束');
  return;
}

export async function yijie_tongbu(e) {
  if (!e.isMaster) {
    return;
  }
  e.reply('开始同步异界存档');
  let playerList = [];
  let files = fs
    .readdirSync(
      './plugins/xiuxian-emulator-plugin/resources/data/yijie/player'
    )
    .filter(file => file.endsWith('.json'));
  for (let file of files) {
    file = file.replace('.json', '');
    playerList.push(file);
  }
  for (let player_id of playerList) {
    let usr_qq = player_id;
    let player = await data.getData('yijie_player', usr_qq);
    let beibao = await data.getData("yijie_beibao", usr_qq)
    //删
    // if (isNotNull(player.境界)) {
    //   player.境界 = undefined;
    // }
    //补
    if (!isNotNull(player.tianfu_level)) {
      player.tianfu_level = 0;
      player.tianfu_exp = 0;
    }
    for (let i = 0; i < beibao.箱子.length; i++) {
      let shuliang = beibao.箱子[i].数量
      beibao.箱子[i] = data.yijie_box.find(item => item.id == beibao.箱子[i].id);
      delete beibao.箱子[i].contents;
      beibao.箱子[i].数量 = shuliang
      if (!beibao.箱子[i].islockd) {
        beibao.箱子[i].islockd = 0;
      }
    }
    for (let i = 0; i < beibao.道具.length; i++) {
      if (!beibao.道具[i].islockd) {
        beibao.道具[i].islockd = 0;
      }
    }
    for (let i = 0; i < beibao.材料.length; i++) {
      if (!beibao.材料[i].islockd) {
        beibao.材料[i].islockd = 0;
      }
    }
    for (let i = 0; i < beibao.装备.length; i++) {
      if (!beibao.装备[i].islockd) {
        beibao.装备[i].islockd = 0;
      }
    }
    for (let i = 0; i < beibao.食材.length; i++) {
      if (!beibao.食材[i].islockd) {
        beibao.食材[i].islockd = 0;
      }
    }
    await Write_yijie_player(usr_qq, player);
    await Write_yijie_beibao(usr_qq, beibao);
  }
  e.reply('异界存档同步结束');

  return;
}
