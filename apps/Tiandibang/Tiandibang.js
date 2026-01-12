/**
 * 天地榜 2.0 指令处理模块
 * 重构版本 - 使用DAL架构和battleEngine战斗系统
 */

import plugin from '../../../../lib/plugins/plugin.js';
import puppeteer from '../../api/puppeteer-wrapper.js';
import Show from '../../model/show.js';
import data from '../../model/XiuxianData.js';
import config from '../../model/Config.js';
import * as DAL from '../../api/data-access.js';
import { battleEngine } from '../../logic/battle_logic.js';
import * as tianxiangLogic from '../../logic/tianxiang_logic.js';
import * as tiandibangLogic from '../../logic/tiandibang_logic.js';
import fs from 'fs';
import path from 'path';


export class Tiandibang extends plugin {
    constructor() {
        super({
            name: 'Tiandibang2.0',
            dsc: '天地榜2.0 - 天象系统 + 五行克制',
            event: 'message',
            priority: 600,
            rule: [
                { reg: '^#天地榜$', fnc: 'showStatus' },
                { reg: '^#比试$', fnc: 'startBattle' },
                { reg: '^#报名天地榜$', fnc: 'register' },
                { reg: '^#当前天象$', fnc: 'showTianxiang' },
                { reg: '^#赛季榜$', fnc: 'showLeaderboard' },
                { reg: '^#天地堂$', fnc: 'showShop' },
                { reg: '^#积分兑换(.*)$', fnc: 'exchange' },
                { reg: '^#荣耀点兑换(.*)$', fnc: 'exchangeGlory' },
                { reg: '^#天地令兑换(.*)$', fnc: 'exchangeToken' }
            ]
        });

        // 定时任务：天象轮换检查
        this.task = {
            cron: '0 0 * * *', // 每天0点检查
            name: 'tianxiang_rotate',
            fnc: () => this.rotateTianxiang()
        };
    }

    /**
     * 报名天地榜
     */
    async register(e) {
        if (!e.isGroup) {
            return e.reply('修仙游戏请在群聊中游玩');
        }

        const userId = e.user_id;
        if (!await DAL.existPlayer(userId)) return;

        const result = await tiandibangLogic.registerTiandibang(userId);
        e.reply(result.message, true);
    }

    /**
     * 显示天地榜状态（图片版）
     */
    async showStatus(e) {
        if (!e.isGroup) {
            return e.reply('修仙游戏请在群聊中游玩');
        }

        const userId = e.user_id;
        if (!await DAL.existPlayer(userId)) return;

        // 检查是否报名
        if (!await tiandibangLogic.isRegistered(userId)) {
            return e.reply('你还未报名本赛季天地榜，请发送【#报名天地榜】参加', true);
        }

        const playerData = await DAL.getAllPlayerData(userId);
        const player = playerData?.player;
        const tiandibang = await tiandibangLogic.getPlayerTiandibang(userId);
        const duanwei = tiandibangLogic.getDuanwei(tiandibang.jifen);
        const rank = await tiandibangLogic.getPlayerRank(userId);

        // 检查天象是否过期并自动轮换
        await tianxiangLogic.checkAndRotateTianxiang();
        const tianxiang = await tianxiangLogic.getCurrentTianxiang();
        const season = await tiandibangLogic.getCurrentSeason();

        // 刷新每日次数
        await tiandibangLogic.refreshDailyFights(userId);
        const updatedTiandibang = await tiandibangLogic.getPlayerTiandibang(userId);

        // 获取赛季结束时间和结算日状态
        const seasonEndTime = tiandibangLogic.formatSeasonEndTime();
        const isSettlement = tiandibangLogic.isSettlementDay();

        // 渲染数据
        const renderData = {
            userId: userId,
            name: player.名号,
            playerLevel: player.修为境界 || '练气初期',
            jifen: tiandibang.jifen,
            duanwei: duanwei.name,
            duanweiColor: duanwei.color,
            rank: rank || '未上榜',
            dailyFights: updatedTiandibang.daily_fights,
            maxDailyFights: duanwei.dailyFights,
            winStreak: tiandibang.win_streak,
            totalFights: tiandibang.total_fights,
            gloryPoints: tiandibang.glory_points,
            tiandiTokens: tiandibang.tiandi_tokens,
            season: season,
            tianxiang: tianxiang.name,
            tianxiangDesc: tianxiang.desc,
            tianxiangRemaining: tianxiangLogic.formatTianxiangRemaining(tianxiang),
            seasonEndTime: isSettlement ? '今日结算' : seasonEndTime,
            isSettlement: isSettlement,
            pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
        };

        try {
            const dataForPuppeteer = await new Show(e).get_imgData('tiandibang_status', renderData);
            const img = await puppeteer.screenshot('tiandibang_status', { ...dataForPuppeteer });
            e.reply(img);
        } catch (err) {
            console.error('[TiandiBang] 状态图片渲染错误:', err);
            // 回退到文本
            const msg = [
                `═══ 天地榜 · 第${season}赛季 ═══`,
                `道号：${player.名号}`,
                `段位：${duanwei.name} | 排名：第${rank || '?'}名`,
                `积分：${tiandibang.jifen}`,
                `今日剩余：${updatedTiandibang.daily_fights}/${duanwei.dailyFights}次`,
                `连胜：${tiandibang.win_streak}`,
                `荣耀点：${tiandibang.glory_points} | 天地令：${tiandibang.tiandi_tokens}`,
                ``,
                `【当前天象】${tianxiang.name}`,
                `${tianxiang.desc}`,
                ``,
                `本赛季结束：${seasonEndTime}`
            ].join('\n');
            e.reply(msg);
        }
    }

    /**
     * 显示当前天象
     */
    async showTianxiang(e) {
        if (!e.isGroup) {
            return e.reply('修仙游戏请在群聊中游玩');
        }

        const tianxiang = await tianxiangLogic.getCurrentTianxiang();
        const remaining = tianxiangLogic.formatTianxiangRemaining(tianxiang);

        const msg = [
            `═══ 当前天象 ═══`,
            `【${tianxiang.name}】`,
            `${tianxiang.desc}`,
            ``,
            `剩余时间：${remaining}`,
            ``,
            `发送【#天地榜】查看个人信息`,
            `发送【#比试】开始对战`
        ].join('\n');

        e.reply(msg);
    }

    /**
     * 开始比试
     */
    async startBattle(e) {
        if (!e.isGroup) {
            return e.reply('修仙游戏请在群聊中游玩');
        }

        const userId = e.user_id;
        if (!await DAL.existPlayer(userId)) return;

        // 检查是否报名
        if (!await tiandibangLogic.isRegistered(userId)) {
            return e.reply('你还未报名本赛季天地榜，请发送【#报名天地榜】参加', true);
        }

        // 检查是否为结算日（周日不可比试）
        if (tiandibangLogic.isSettlementDay()) {
            return e.reply('今日为赛季结算日，无法进行比试。\n可查看【#赛季榜】排名或前往【#天地堂】兑换物品。', true);
        }

        // 检查动作状态
        const action = await redis.get(`xiuxian:player:${userId}:action`);
        if (action) {
            const actionData = JSON.parse(action);
            if (Date.now() < actionData.end_time) {
                const remaining = Math.ceil((actionData.end_time - Date.now()) / 1000 / 60);
                return e.reply(`正在${actionData.action}中，剩余${remaining}分钟`, true);
            }
        }

        // 消耗每日次数
        const consumeResult = await tiandibangLogic.consumeDailyFight(userId);
        if (!consumeResult.success) {
            return e.reply(consumeResult.message, true);
        }

        const playerData = await DAL.getAllPlayerData(userId);
        const player = playerData?.player;
        const tiandibang = await tiandibangLogic.getPlayerTiandibang(userId);

        // 检查天象是否过期并自动轮换
        await tianxiangLogic.checkAndRotateTianxiang();
        const tianxiang = await tianxiangLogic.getCurrentTianxiang();

        // 匹配对手
        const opponentId = await tiandibangLogic.matchOpponent(userId, tiandibang.jifen);
        let opponent;
        let isNPC = false;

        if (opponentId) {
            const opponentData = await DAL.getAllPlayerData(opponentId);
            opponent = opponentData?.player;
        } else {
            // 生成NPC对手
            isNPC = true;
            const randomFactor = 0.8 + Math.random() * 0.4;
            opponent = {
                名号: '灵修兽',
                攻击: Math.floor(player.攻击 * randomFactor),
                防御: Math.floor(player.防御 * randomFactor),
                当前血量: Math.floor(player.血量上限 * randomFactor),
                血量上限: Math.floor(player.血量上限 * randomFactor),
                暴击率: player.暴击率 || 0.1,
                灵根: { name: '无', type: '无' },
                id: 'npc_lingxiushou'
            };
        }

        // 应用天象效果
        const playerEffects = tianxiangLogic.applyTianxiangEffects(tianxiang, player);
        const opponentEffects = tianxiangLogic.applyTianxiangEffects(tianxiang, opponent);

        // 计算五行克制
        const wuxingBonus = tianxiangLogic.calculateWuxingBonus(player.灵根, opponent.灵根);

        // 构建战斗单位
        const playerUnit = {
            id: userId,
            名号: player.名号,
            攻击: Math.floor(player.攻击 * playerEffects.atkModifier * wuxingBonus),
            防御: Math.floor(player.防御 * playerEffects.defModifier),
            当前血量: Math.floor(player.血量上限 * playerEffects.hpModifier),
            血量上限: Math.floor(player.血量上限 * playerEffects.hpModifier),
            暴击率: (player.暴击率 || 0.1) + playerEffects.critModifier,
            灵根: player.灵根
        };

        const opponentUnit = {
            id: opponentId || 'npc',
            名号: opponent.名号,
            攻击: Math.floor(opponent.攻击 * opponentEffects.atkModifier / wuxingBonus),
            防御: Math.floor(opponent.防御 * opponentEffects.defModifier),
            当前血量: Math.floor((opponent.血量上限 || opponent.当前血量) * opponentEffects.hpModifier),
            血量上限: Math.floor((opponent.血量上限 || opponent.当前血量) * opponentEffects.hpModifier),
            暴击率: opponent.暴击率 || 0.1,
            灵根: opponent.灵根
        };

        // 执行战斗
        const battleResult = await battleEngine(playerUnit, opponentUnit, 30);

        // 计算积分和灵石
        const isWin = battleResult.A_win;
        const baseJifen = isWin ? (isNPC ? 1500 : 2000) : (isNPC ? 800 : 1000);
        const baseLingshi = Math.floor(tiandibang.jifen * 2);

        // 更新战斗结果
        const result = await tiandibangLogic.updateBattleResult(userId, isWin, baseJifen, baseLingshi);

        // 发放灵石 - 通过DAL更新玩家数据
        const playerDataForLingshi = await DAL.getAllPlayerData(userId);
        const playerForLingshi = playerDataForLingshi.player;
        playerForLingshi.灵石 = (playerForLingshi.灵石 || 0) + result.lingshi;
        await DAL.savePlayer(userId, playerForLingshi);

        // 构建结果消息
        const resultMsgs = [
            `═══ 天地榜比试 ═══`,
            `【${tianxiang.name}】生效中`,
            ``
        ];

        // 添加战斗日志（简化版）
        if (battleResult.msg && battleResult.msg.length > 0) {
            resultMsgs.push(...battleResult.msg.slice(-5)); // 只显示最后5条
        }

        resultMsgs.push(``);
        resultMsgs.push(isWin ? `🎉 ${player.名号} 获胜！` : `💔 ${player.名号} 落败`);
        resultMsgs.push(`积分 +${result.jifen} (当前: ${result.totalJifen})`);
        resultMsgs.push(`灵石 +${result.lingshi}`);
        resultMsgs.push(`段位: ${result.duanwei.name}`);
        resultMsgs.push(`剩余次数: ${consumeResult.remainingFights}`);

        // 添加额外消息（连胜等）
        if (result.messages && result.messages.length > 0) {
            resultMsgs.push(``);
            resultMsgs.push(...result.messages);
        }

        // 添加天地榜结果到战斗日志
        battleResult.log.push({ type: 'system', text: `【${tianxiang.name}】生效中` });
        battleResult.log.push({ type: 'end', text: isWin ? `🎉 ${player.名号} 获胜！` : `💔 ${player.名号} 落败` });
        battleResult.log.push({ type: 'system', text: `积分 +${result.jifen} | 灵石 +${result.lingshi} | 段位: ${result.duanwei.name}` });
        if (result.messages && result.messages.length > 0) {
            result.messages.forEach(msg => battleResult.log.push({ type: 'system', text: msg }));
        }

        // 使用与以武会友相同的渲染逻辑 (universal_battle_log模板)
        try {
            const renderData = {
                log: battleResult.log,
                pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
            };

            const dataForPuppeteer = await new Show(e).get_imgData('universal_battle_log', renderData);
            const img = await puppeteer.screenshot('universal_battle_log', { ...dataForPuppeteer });
            e.reply(img);
        } catch (renderErr) {
            console.error('[TiandiBang] 战报渲染错误:', renderErr);
            // 渲染失败，回退到文本消息
            e.reply(resultMsgs.join('\n'));
        }
    }

    /**
     * 显示赛季排行榜（图片版）
     */
    async showLeaderboard(e) {
        if (!e.isGroup) {
            return e.reply('修仙游戏请在群聊中游玩');
        }

        const season = await tiandibangLogic.getCurrentSeason();
        const leaderboard = await tiandibangLogic.getLeaderboard(0, 9);

        // 为每个玩家添加预计天地令奖励
        const leaderboardWithRewards = leaderboard.map(entry => {
            let tiandiLing = 0;
            let title = '';
            if (entry.rank === 1) {
                tiandiLing = 50;
                title = '天榜至尊';
            } else if (entry.rank <= 3) {
                tiandiLing = 30;
                title = '榜上有名';
            } else if (entry.rank <= 10) {
                tiandiLing = 20;
            } else if (entry.rank <= 50) {
                tiandiLing = 10;
            }
            return { ...entry, tiandiLing, title };
        });

        // 渲染数据
        const renderData = {
            season,
            leaderboard: leaderboardWithRewards,
            pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
        };

        const htmlPath = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'resources', 'html', 'tiandibang_leaderboard', 'tiandibang_leaderboard.html');
        if (!fs.existsSync(htmlPath)) {
            // 回退文本
            const msg = [`═══ 天地榜 · 第${season}赛季 ═══`, ``];
            for (const entry of leaderboard) {
                const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `${entry.rank}.`;
                msg.push(`${medal} ${entry.name} | ${entry.duanwei.name} | ${entry.jifen}分`);
            }
            if (leaderboard.length === 0) msg.push('暂无玩家上榜');
            msg.push(``, `发送【#报名天地榜】参与挑战`);
            return e.reply(msg.join('\n'));
        }

        try {
            const dataForPuppeteer = await new Show(e).get_imgData('tiandibang_leaderboard', renderData);
            const img = await puppeteer.screenshot('tiandibang_leaderboard', {
                tplFile: htmlPath,
                scale: 2,
                imgType: 'jpeg',
                quality: 90,
                ...renderData
            });
            e.reply(img);
        } catch (err) {
            console.error('[TiandiBang] 排行榜图片渲染错误:', err);
            e.reply('排行榜图片生成失败，请稍后再试');
        }
    }

    /**
     * 天地堂商店（图片版）
     */
    async showShop(e) {
        if (!e.isGroup) {
            return e.reply('修仙游戏请在群聊中游玩');
        }

        const userId = e.user_id;
        if (!await DAL.existPlayer(userId)) return;

        const tiandibang = await tiandibangLogic.getPlayerTiandibang(userId);
        if (!tiandibang) {
            return e.reply('请先报名天地榜', true);
        }

        const commodities = data.tianditang || [];

        // 渲染数据
        const renderData = {
            jifen: tiandibang.jifen,
            gloryPoints: tiandibang.glory_points,
            tiandiTokens: tiandibang.tiandi_tokens,
            commodities: commodities,
            pluResPath: `file://${process.cwd()}/plugins/xiuxian-emulator-plugin/resources/`
        };

        const htmlPath = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin', 'resources', 'html', 'tiandibang_shop', 'tiandibang_shop.html');
        if (!fs.existsSync(htmlPath)) {
            // 回退文本
            const msg = [
                `═══ 天地堂 ═══`,
                `你的积分：${tiandibang.jifen}`,
                `荣耀点：${tiandibang.glory_points} | 天地令：${tiandibang.tiandi_tokens}`,
                ``
            ];
            for (const item of commodities) {
                msg.push(`${item.name} - ${item.积分}积分`);
            }
            msg.push(``, `发送【#积分兑换+物品名】进行兑换`, `（仅周日可兑换）`);
            return e.reply(msg.join('\n'));
        }

        try {
            const dataForPuppeteer = await new Show(e).get_imgData('tiandibang_shop', renderData);
            const img = await puppeteer.screenshot('tiandibang_shop', {
                tplFile: htmlPath,
                scale: 2,
                imgType: 'jpeg',
                quality: 90,
                ...renderData
            });
            e.reply(img);
        } catch (err) {
            console.error('[TiandiBang] 商店图片渲染错误:', err);
            e.reply('商店图片生成失败，请稍后再试');
        }
    }

    /**
     * 兑换物品
     */
    async exchange(e) {
        if (!e.isGroup) {
            return e.reply('修仙游戏请在群聊中游玩');
        }

        // 检查是否周日
        const day = new Date().getDay();
        if (day !== 0) {
            return e.reply('天地堂仅在周日开放兑换，请届时再来');
        }

        const userId = e.user_id;
        if (!await DAL.existPlayer(userId)) return;

        const itemName = e.msg.replace(/#积分兑换/, '').trim();
        if (!itemName) {
            return e.reply('请指定要兑换的物品名称', true);
        }

        const commodities = data.tianditang || [];
        const item = commodities.find(c => c.name === itemName);

        if (!item) {
            return e.reply(`天地堂没有【${itemName}】`, true);
        }

        const playerData = await DAL.getAllPlayerData(userId);
        const player = playerData?.player;
        const tiandibang = await tiandibangLogic.getPlayerTiandibang(userId);

        if (!tiandibang || tiandibang.jifen < item.积分) {
            return e.reply(`积分不足，还需${item.积分 - (tiandibang?.jifen || 0)}积分`, true);
        }

        // 扣除积分 (复用已获取的playerData)
        playerData.player.tiandibang.jifen -= item.积分;

        // 特殊处理：如果是称号，直接添加到玩家称号列表
        if (item.class === '称号') {
            if (!playerData.player.all_titles) {
                playerData.player.all_titles = [];
            }
            if (!playerData.player.all_titles.includes(item.name)) {
                playerData.player.all_titles.push(item.name);
            }
        }

        await DAL.savePlayer(userId, playerData.player);

        // 添加物品
        await DAL.updateNajieItem(userId, item.name, item.class, 1);

        // 更新排行榜
        await redis.zAdd('xiuxian:tiandibang:leaderboard', {
            score: playerData.player.tiandibang.jifen,
            value: String(userId)
        });

        e.reply(`兑换成功！获得【${item.name}】，剩余${playerData.tiandibang.jifen}积分`);
    }

    /**
     * 天象轮换（定时任务）
     */
    async rotateTianxiang() {
        const result = await tianxiangLogic.checkAndRotateTianxiang();

        if (result.rotated) {
            // 可在此处添加全服通知逻辑
            logger.info(`[天地榜] 天象更替：${result.oldTianxiang?.name} → ${result.newTianxiang.name}`);
        }
    }

    /**
     * 荣耀点兑换
     */
    async exchangeGlory(e) {
        if (!e.isGroup) {
            return e.reply('修仙游戏请在群聊中游玩');
        }

        const userId = e.user_id;
        if (!await DAL.existPlayer(userId)) return;

        const itemName = e.msg.replace(/#荣耀点兑换/, '').trim();
        if (!itemName) {
            return e.reply('请指定要兑换的物品名称', true);
        }

        // 荣耀点商品列表
        const gloryShop = [
            { name: '摘榜令', class: '道具', price: 80 },
            { name: '战意丹', class: '丹药', price: 30 },
            { name: '五行调和丹', class: '丹药', price: 50 },
            { name: '连胜守护符', class: '道具', price: 100 }
        ];

        const item = gloryShop.find(i => i.name === itemName);
        if (!item) {
            const allItems = gloryShop.map(i => `${i.name}(${i.price}点)`).join('、');
            return e.reply(`荣耀点商店没有【${itemName}】\n可兑换：${allItems}`, true);
        }

        const tiandibang = await tiandibangLogic.getPlayerTiandibang(userId);
        if (!tiandibang || tiandibang.glory_points < item.price) {
            return e.reply(`荣耀点不足，还需${item.price - (tiandibang?.glory_points || 0)}荣耀点`, true);
        }

        // 扣除荣耀点
        const playerData = await DAL.getAllPlayerData(userId);
        playerData.player.tiandibang.glory_points -= item.price;
        await DAL.savePlayer(userId, playerData.player);

        // 添加物品
        await DAL.updateNajieItem(userId, item.name, item.class, 1);

        e.reply(`兑换成功！获得【${item.name}】，剩余${playerData.player.tiandibang.glory_points}荣耀点`);
    }

    /**
     * 天地令兑换
     */
    async exchangeToken(e) {
        if (!e.isGroup) {
            return e.reply('修仙游戏请在群聊中游玩');
        }

        const userId = e.user_id;
        if (!await DAL.existPlayer(userId)) return;

        const itemName = e.msg.replace(/#天地令兑换/, '').trim();
        if (!itemName) {
            return e.reply('请指定要兑换的物品名称', true);
        }

        // 天地令商品列表
        const tokenShop = [
            { name: '天地秘籍残页', class: '道具', price: 500, desc: '集齐5张可合成专属功法' },
            { name: '称号·天地弄潮儿', class: '称号', price: 800, desc: '永久称号，彰显非凡实力' }
        ];

        const item = tokenShop.find(i => i.name === itemName);
        if (!item) {
            const allItems = tokenShop.map(i => `${i.name}(${i.price}令)`).join('、');
            return e.reply(`天地令商店没有【${itemName}】\n可兑换：${allItems}`, true);
        }

        const tiandibang = await tiandibangLogic.getPlayerTiandibang(userId);
        if (!tiandibang || tiandibang.tiandi_tokens < item.price) {
            return e.reply(`天地令不足，还需${item.price - (tiandibang?.tiandi_tokens || 0)}天地令`, true);
        }

        // 扣除天地令
        const playerData = await DAL.getAllPlayerData(userId);
        playerData.player.tiandibang.tiandi_tokens -= item.price;

        // 特殊处理：如果是称号，直接添加到玩家称号列表
        if (item.class === '称号') {
            const titleName = item.name.replace('称号·', '');
            if (!playerData.player.all_titles) {
                playerData.player.all_titles = [];
            }
            if (!playerData.player.all_titles.includes(titleName)) {
                playerData.player.all_titles.push(titleName);
            }
            await DAL.savePlayer(userId, playerData.player);
            return e.reply(`🎉 兑换成功！获得称号【${titleName}】，剩余${playerData.player.tiandibang.tiandi_tokens}天地令`);
        }

        await DAL.savePlayer(userId, playerData.player);

        // 添加物品
        await DAL.updateNajieItem(userId, item.name, item.class, 1);

        e.reply(`🎉 兑换成功！获得【${item.name}】，剩余${playerData.player.tiandibang.tiandi_tokens}天地令`);
    }
}