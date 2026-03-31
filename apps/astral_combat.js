import plugin from '../../../lib/plugins/plugin.js';
import * as DAL from '../api/data-access.js';
import { loadItemConfig } from '../model/ConfigLoader.js';
import puppeteer from '../api/puppeteer-wrapper.js';
import Show from '../model/show.js';
import { runCombat } from '../logic/combat/CombatEngine.js';
import fs from 'fs';
import path from 'path';
import { createClient } from 'redis';
import YAML from 'yaml';

const allStarSouls = loadItemConfig('star_souls.yaml');

// 活动时间配置
const ACTIVITY_CONFIG = {
  eventKey: 'wanxiang_tianji_2026_01',
  startTime: new Date('2026-01-06 10:00:00').getTime(),
  endTime: new Date('2026-03-01 23:59:59').getTime()
};

export class astral_combat extends plugin {
  constructor() {
    super({
      name: '万象天机',
      dsc: '星魂战斗活动',
      event: 'message',
      priority: 500,
      rule: [
        { reg: /^#万象天机$/, fnc: 'showTeamStatus' },
        { reg: /^#星魂图鉴$/, fnc: 'showCodex' },
        { reg: /^#详细星魂图鉴$/, fnc: 'showDetailCodex' },
        { reg: /^#星魂装备(\d)号\s*(.*)/, fnc: 'equipStarSoul' },
        { reg: /^#测试战斗$/, fnc: 'testCombat' }
      ]
    });
  }

  async showCodex(e) {
    if (!await this.checkActivity(e)) return true;
    await this.renderCodex(e, false);
  }

  async showDetailCodex(e) {
    if (!await this.checkActivity(e)) return true;
    await this.renderCodex(e, true);
  }

  async renderCodex(e, isDetail) {
    const allMonsters = Object.values(loadItemConfig('monsters.yaml') || {});

    // 辅助函数：高亮数值
    const highlightNumbers = (text) => {
      if (!text) return text;
      return text.replace(/(\d+(\.\d+)?%?)/g, '<span class="val-highlight">$1</span>');
    };

    const processedSouls = allStarSouls.map(s => {
      const copy = { ...s };
      if (copy.skill) {
        copy.skill = { ...copy.skill };
        if (copy.skill.detailed_mechanics) {
          copy.skill.detailed_mechanics = highlightNumbers(copy.skill.detailed_mechanics);
        }
      }
      return copy;
    });

    const processedMonsters = allMonsters.map(m => {
      const copy = { ...m };
      if (copy.skill) {
        copy.skill = { ...copy.skill };
        if (copy.skill.detailed_mechanics) {
          copy.skill.detailed_mechanics = highlightNumbers(copy.skill.detailed_mechanics);
        }
      }
      return copy;
    });

    const renderData = {
      souls: processedSouls,
      monsters: processedMonsters,
      isDetail: isDetail,
      pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
    };

    // 使用相同的模板 star_soul_codex，但传入不同的 isDetail 参数
    // 注意：模板文件名还是叫 star_soul_codex，不需要为了详细版单独建一个文件，在HTML里判断即可
    // 图片名称稍微区分一下，避免缓存问题
    const imgName = isDetail ? 'star_soul_codex_detail' : 'star_soul_codex';

    const dataForPuppeteer = await new Show(e).get_imgData('star_soul_codex', renderData);
    const img = await puppeteer.screenshot(imgName, { ...dataForPuppeteer });
    await e.reply(img);
  }


  async testCombat(e) {
    if (!await this.checkActivity(e)) return true;
    // 1. 获取玩家的完整数据
    const playerData = (await DAL.getAllPlayerData(e.user_id))?.player;
    if (!playerData) {
      return e.reply('无法获取您的角色信息。', true);
    }

    // 2. 从玩家数据中提取已装备的星魂名称
    const equippedSoulNames = Object.values(playerData.equipped_star_souls || {}).filter(Boolean); // filter(Boolean) 会移除所有 null 或 undefined 的空位

    if (equippedSoulNames.length === 0) {
      return e.reply('你尚未装备任何星魂，无法开始战斗。', true);
    }

    // 3. 根据名称，从配置中找到完整的星魂数据
    const playerSouls = equippedSoulNames.map(name =>
      allStarSouls.find(s => s.name === name)
    ).filter(Boolean); // 再次过滤，以防玩家装备了不存在的星魂

    // 敌人队伍可以保持不变，或您也可以根据需要修改
    const enemyNames = ['石傀儡',
      '深寒怨灵',
      '锐金剑侍'];

    // 运行战斗引擎
    const result = await runCombat(playerSouls, enemyNames);

    console.log(result.log);

    // 渲染日志 (分片输出 - 每8回合一切)
    const fullLog = result.log;
    const slices = [];
    let currentSlice = [];
    let roundCountInSlice = 0;

    for (const entry of fullLog) {
      if (entry.type === 'turn') {
        roundCountInSlice++;
        if (roundCountInSlice > 8) { // 8回合切片
          if (currentSlice.length > 0) slices.push(currentSlice);
          currentSlice = [];
          roundCountInSlice = 1;
        }
      }
      currentSlice.push(entry);
    }
    if (currentSlice.length > 0) slices.push(currentSlice);

    const tempDir = path.join(process.cwd(), 'data', 'temp', 'wanxiang');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const imgPaths = [];

    try {
      for (let i = 0; i < slices.length; i++) {
        const sliceLog = slices[i];
        const renderData = {
          log: sliceLog,
          pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
        };

        const dataForPuppeteer = await new Show(e).get_imgData('astral_combat_log', renderData);
        dataForPuppeteer.imgType = 'jpeg';
        dataForPuppeteer.quality = 80;

        const imgResult = await puppeteer.screenshot('astral_combat_log', { ...dataForPuppeteer });

        let finalBuffer = null;
        if (Buffer.isBuffer(imgResult)) {
          finalBuffer = imgResult;
        } else if (typeof imgResult === 'object' && imgResult.file) {
          if (Buffer.isBuffer(imgResult.file)) finalBuffer = imgResult.file;
          else if (typeof imgResult.file === 'string') {
            let base64 = imgResult.file.replace(/^base64:\/\//, '').replace(/^data:image\/\w+;base64,/, '');
            finalBuffer = Buffer.from(base64, 'base64');
          }
        }

        if (finalBuffer && finalBuffer.length > 0) {
          const fileName = `Combat_Log_${e.user_id}_${Date.now()}_Part${i + 1}.jpg`;
          const filePath = path.join(tempDir, fileName);
          fs.writeFileSync(filePath, finalBuffer);
          imgPaths.push(filePath);
        }
      }

      if (imgPaths.length > 0) {
        // 逐张发送分片
        for (let i = 0; i < imgPaths.length; i++) {
          const p = imgPaths[i];
          try {
            const imageSendResult = await e.reply(segment.image(p));
            console.log('[AstralCombat] e.reply return value:', imageSendResult); // Debug log

            // 检查返回值：
            // 1. 如果返回 falsy (undefined/false/null)
            // 2. 如果包含 error 属性 (根据日志，失败时返回 { error: [...] })
            // 3. 如果 result 为 -1 (部分适配器行为)
            const isFailure = !imageSendResult || imageSendResult.error || (imageSendResult.result === -1);

            if (isFailure) {
              console.error('[AstralCombat] Image send failed (detected error in return value), falling back to file. Result:', JSON.stringify(imageSendResult, null, 2));
              const fileName = path.basename(p);
              await e.reply({ type: 'file', file: p, name: fileName });
              if (i === 0) await e.reply("💡若图片无法加载，请查看原图或下载");
            }
          } catch (imgSendErr) {
            // e.reply直接抛出异常时捕获
            console.error('[AstralCombat] Image send threw error, falling back to file:', imgSendErr);
            const fileName = path.basename(p);
            await e.reply({ type: 'file', file: p, name: fileName });
            if (i === 0) await e.reply("💡若图片无法加载，请查看原图或下载");
          }
          if (i < imgPaths.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      } else {
        e.reply('战报生成失败。');
      }

    } catch (err) {
      console.error('[AstralCombat] Log Generation Error:', err);
      e.reply('战报生成出错。');
    } finally {
      setTimeout(() => {
        imgPaths.forEach(p => {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        });
      }, 60000);
    }
  }

  /**
   * 通用的活动状态检查函数
   * @param e 事件对象
   * @returns {Promise<boolean>} 活动是否正在进行
   */
  async checkActivity(e) {
    // 主人可以跳过时间检查
    if (e.isMaster) {
      return true;
    }

    const now = Date.now();
    if (now < ACTIVITY_CONFIG.startTime) {
      const startDate = new Date(ACTIVITY_CONFIG.startTime);
      e.reply(`【万象天机】活动尚未开启！\n开启时间：${startDate.getFullYear()}年${startDate.getMonth() + 1}月${startDate.getDate()}日 ${startDate.getHours()}:00`);
      return false;
    }
    if (now > ACTIVITY_CONFIG.endTime) {
      e.reply('【万象天机】活动已结束，感谢参与！');
      return false;
    }
    return true;
  }

  async showTeamStatus(e) {
    if (!await this.checkActivity(e)) return true;

    // --- 首次访问检查逻辑 ---
    const redisConfigPath = `${process.cwd()}/config/config/redis.yaml`;
    let redisClient = null;
    try {
      const redisConfig = YAML.parse(fs.readFileSync(redisConfigPath, 'utf8'));
      redisClient = createClient({
        url: `redis://${redisConfig.password ? ':' + redisConfig.password + '@' : ''}${redisConfig.host}:${redisConfig.port}/${redisConfig.db}`
      });
      await redisClient.connect();

      const visitedKey = `xiuxian:wanxiang:visited:${e.user_id}`;
      const hasVisited = await redisClient.get(visitedKey);

      if (!hasVisited) {
        // 发放所有星魂
        if (allStarSouls && allStarSouls.length > 0) {
          for (const soul of allStarSouls) {
            await DAL.updateNajieItem(e.user_id, soul.name, '活动', 1);
          }
        }

        await redisClient.set(visitedKey, 'true');

        const guideText = [
          '🌌 【万象天机】版本活动指引',
          '━━━━━━━━━━━━━━━',
          '📜 活动概览：',
          '这是一场结合了星魂战斗与 Roguelike 爬塔的深度挑战。道友需率领星魂进入「天机试炼」，在变幻莫测的路线中寻找生机，累积「天机玉」兑换珍宝。',
          '',
          '🎁 新手福利：',
          '所有基础星魂（金、木、水、火、土）已各发放一只至您的纳戒中，请查收！',
          '',
          '⚔️ 快速开始：',
          '1. 【整备】发送 #星魂装备1号 剑魂·庚金 (以此类推配置4名出战者)',
          '2. 【启程】发送 #开启试炼 踏入第1层',
          '3. 【抉择】在战斗胜利后，谨慎选择「天机赐福」来强化你的队伍',
          '4. 【强化】试炼结束后，前往 #天机秘术 提升永久属性',
          '',
          '💎 核心奖励：',
          '• 累积「天机玉」可在 #天机阁 兑换海量灵石与进阶材料',
          '• 每周一 10:00 结算 #天机榜，发放高额周榜奖励',
          '',
          '💡 提示：通关 20 层后将解锁「誓约模式」与「无限试炼」，挑战真正的天机变数！',
          '━━━━━━━━━━━━━━━',
          '（发送 #万象天机 随时查看主菜单与指令列表）'
        ].join('\n');

        await e.reply(guideText);

        // 发送引导图片 (Reference Card)
        const htmlPath = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'resources', 'html', 'wanxiang_guide', 'wanxiang_guide.html');
        if (fs.existsSync(htmlPath)) {
          try {
            const img = await puppeteer.screenshot('wanxiang_guide', { tplFile: htmlPath, imgType: 'jpeg' });
            await e.reply(img);
          } catch (imgErr) {
            // ignore
          }
        }

        await redisClient.disconnect();
        return;
      }
      await redisClient.disconnect();
    } catch (err) {
      console.error('[Wanxiang] First Visit Check Error:', err);
      if (redisClient) await redisClient.disconnect();
    }
    // ----------------------

    const playerData = (await DAL.getAllPlayerData(e.user_id))?.player;
    if (!playerData) {
      return e.reply('无法获取您的角色信息。', true);
    }

    const equipped = playerData.equipped_star_souls || {};

    let teamData = [];
    for (let i = 1; i <= 4; i++) {
      const soulName = equipped[i];
      if (soulName) {
        const soulInfo = allStarSouls.find(s => s.name === soulName);
        if (soulInfo) {
          if (soulInfo.base_stats && soulInfo.base_stats.resistance !== undefined) {
            soulInfo.base_stats.resistance_percent = (soulInfo.base_stats.resistance * 100).toFixed(0) + '%';
          }
          teamData.push({ slot: i, equipped: true, ...soulInfo });
        } else {
          teamData.push({ slot: i, equipped: false, name: '数据错误' });
        }
      } else {
        teamData.push({ slot: i, equipped: false, name: '未装备' });
      }
    }

    const helpCommands = [
      {
        category: '基础与活动',
        commands: [
          { cmd: '#万象天机', desc: '查看主界面及配队' },
          { cmd: '#天机榜', desc: '查看周榜排行' },
          { cmd: '#天机阁', desc: '打开天机玉商店' },
          { cmd: '#兑换[物品][数量]', desc: '兑换商店物品' },
          { cmd: '#星魂图鉴', desc: '查看星魂属性' },
          { cmd: '#详细星魂图鉴', desc: '查看详细技能机制' },
          { cmd: '#誓约列表', desc: '查看已解锁誓约' }
        ]
      },
      {
        category: '整备与强化',
        commands: [
          { cmd: '#星魂装备[序号]号 [名]', desc: '配置出战星魂' },
          { cmd: '#天机秘术', desc: '查看强化天赋树' },
          { cmd: '#强化天机秘术', desc: '消耗天机玉强化' }
        ]
      },
      {
        category: '试炼玩法',
        commands: [
          { cmd: '#开启试炼 [誓约名]', desc: '开启新挑战 (可选誓约)' },
          { cmd: '#开启无限试炼', desc: '开启无尽挑战模式' },
          { cmd: '#挑战', desc: '进行下一层试炼' },
          { cmd: '#试炼状态', desc: '查看当前实时进度' },
          { cmd: '#选择路线 [序号]', desc: '选择前进的分支' },
          { cmd: '#选择赐福 [序号]', desc: '选择获得的增益' },
          { cmd: '#刷新赐福', desc: '重置当前待选赐福' },
          { cmd: '#事件选择 [序号]', desc: '在奇遇/商店中抉择' },
          { cmd: '#退出试炼', desc: '主动结算并结束试炼' }
        ]
      }
    ];

    const renderData = {
      team: teamData,
      helpCommands: helpCommands,
      pifu: playerData.pifu || playerData.练气皮肤,
      pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
    };


    const dataForPuppeteer = await new Show(e).get_imgData('astral_combat_status', renderData);
    const img = await puppeteer.screenshot('astral_combat_status', { ...dataForPuppeteer });
    await e.reply(img);
  }

  async equipStarSoul(e) {
    // 在每个指令的开头都进行检查
    if (!await this.checkActivity(e)) return true;
    const match = e.msg.match(/^#星魂装备(\d)号\s*(.*)/);
    const slot = parseInt(match[1]);
    const soulName = match[2].trim();

    if (slot < 1 || slot > 4) {
      return e.reply('只能装备在1-4号位哦。', true);
    }

    if (!soulName) {
      return e.reply('请指定要装备的星魂名称，如：#星魂装备1号 剑魂·庚金', true);
    }

    // 检查该物品是否是有效的星魂
    const soulConfig = allStarSouls.find(s => s.name === soulName);
    if (!soulConfig) {
      return e.reply(`【${soulName}】不是有效的星魂，请检查名称是否正确。\n发送 #星魂图鉴 查看全部星魂。`, true);
    }

    // 检查纳戒中是否有该星魂
    const ownedAmount = await DAL.getNajieItemAmount(e.user_id, soulName, '活动');
    if (ownedAmount < 1) {
      return e.reply(`你的纳戒中没有【${soulName}】。`, true);
    }

    // 获取玩家当前装备的星魂
    const playerData = (await DAL.getAllPlayerData(e.user_id))?.player;
    const currentEquipped = playerData?.equipped_star_souls || {};
    const oldSoulName = currentEquipped[slot];

    // 检查是否装备的是同一个星魂
    if (oldSoulName === soulName) {
      return e.reply(`${slot}号位已装备【${soulName}】，无需重复装备。`, true);
    }

    // 更新玩家数据
    await DAL.transaction_update(e.user_id, (player) => {
      if (!player.equipped_star_souls) player.equipped_star_souls = {};
      player.equipped_star_souls[slot] = soulName;
    });

    // 如果原位置有星魂，退还给玩家
    let replyMsg = `已将【${soulName}】装备至${slot}号位！`;
    if (oldSoulName) {
      await DAL.updateNajieItem(e.user_id, oldSoulName, '活动', 1);
      replyMsg += `\n原${slot}号位的【${oldSoulName}】已退还至纳戒。`;
    }

    await e.reply(replyMsg);
  }
}