import plugin from '../../../lib/plugins/plugin.js';
import * as DAL from '../api/data-access.js';
import { loadItemConfig } from '../model/ConfigLoader.js';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import Show from '../model/show.js';
import { getActivityStatus } from '../logic/fishing_logic.js';
import { runCombat } from '../logic/combat/CombatEngine.js';
import fs from 'fs';
import path from 'path';

const allStarSouls = loadItemConfig('star_souls.yaml');
const EVENT_KEY = 'wanxiang_tianji_2025_10';

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
                 const fileName = `Combat_Log_${e.user_id}_${Date.now()}_Part${i+1}.jpg`;
                 const filePath = path.join(tempDir, fileName);
                 fs.writeFileSync(filePath, finalBuffer);
                 imgPaths.push(filePath);
            }
        }

        if (imgPaths.length > 0) {
            // 逐张发送分片
            for (let i = 0; i < imgPaths.length; i++) {
                const p = imgPaths[i];
                const imageSendResult = await e.reply(segment.image(p));
                // 根据日志，e.reply 在发送失败时不会抛出错误，而是返回一个带有错误信息的对象
                // 我们需要检查这个返回值来判断是否发送成功
                if (imageSendResult && imageSendResult.result === -1 && imageSendResult.errMsg === "rich media transfer failed") {
                    console.error('[AstralCombat] Image send failed (rich media transfer failed), falling back to file:', imageSendResult);
                    const fileName = path.basename(p);
                    await e.reply({ type: 'file', file: p, name: fileName });
                    if (i === 0) await e.reply("💡若图片无法加载，请下载文件查看");
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
    if (e.isMaster) {
      return true;
    }
    const activity = getActivityStatus(EVENT_KEY);
    if (!activity) {
      // 在活动时间外，静默返回，不响应指令
      return false;
    }
    e.activity = activity;
    return true;
  }

  async showTeamStatus(e) {
    if (!await this.checkActivity(e)) return true;

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

    const renderData = {
      team: teamData,
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

    // 检查纳戒中是否有该星魂
    const ownedAmount = await DAL.getNajieItemAmount(e.user_id, soulName, '活动');
    if (ownedAmount < 1) {
      return e.reply(`你的纳戒中没有【${soulName}】。`, true);
    }

    // 更新玩家数据
    await DAL.transaction_update(e.user_id, (player) => {
      if (!player.equipped_star_souls) player.equipped_star_souls = {};
      player.equipped_star_souls[slot] = soulName;
    });

    await e.reply(`已将【${soulName}】装备至${slot}号位！`);
  }
}