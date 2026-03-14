/**
 * =============================================================================
 * 皮肤主题设计提示词 (Design Prompts for Theme CSS Files)
 * =============================================================================
 * 
 * 这些提示词用于指导 AI 生成新的皮肤 CSS 文件。
 * CSS 文件位于: resources/html/najie/themes/{skin_id}.css
 * 
 * -----------------------------------------------------------------------------
 * 【默认皮肤】default.css - 经典仙侠风
 * -----------------------------------------------------------------------------
 * 
 * **设计理念**: 清新典雅的古典修仙风格，以暖色调木质纹理为基础，
 * 呈现出类似竹简、羊皮纸般的温润质感。
 * 
 * **色彩体系**:
 * - 主色调: 米白/奶油色 (#FDFAF5) - 背景容器
 * - 强调色: 棕褐色系 (#6a3906, #7a5533, #a88763) - 文字与边框
 * - 进度条: 红色渐变(HP) #e57373→#d32f2f | 蓝色渐变(灵石) #64B5F6→#1976D2
 * - 分隔线: 虚线 #d2b48c (Tan色)
 * 
 * **视觉特征**:
 * - 容器: rgba白色半透明 + 毛玻璃效果 (backdrop-filter: blur)
 * - 边框: 2px 实线棕色边框 + 圆角 15px
 * - 阴影: 柔和投影 (0 8px 16px rgba(0,0,0,0.3))
 * - 字体: NZBZ(标题) + tttgbnumber(数值)
 * - 物品卡片: 浅色半透明背景，1px 细边框
 * - 品级徽章: 实色渐变背景 (灰→绿→蓝→紫→橙→红→金)
 * 
 * **布局结构**:
 * - 宽度: 800px
 * - 物品网格: 4列，15px 间距
 * - 顶部: 头像(80px圆形) + 双进度条(HP/灵石)
 * 
 * -----------------------------------------------------------------------------
 * 【龙马精神】horse_year_2026.css - 2026春节限定
 * -----------------------------------------------------------------------------
 * 
 * **设计理念**: 热烈喜庆的新春氛围，融合磨砂玻璃(Glassmorphism)现代设计，
 * 以深红色为主基调，金色点缀，营造出高端大气的节日感。
 * 
 * **色彩体系**:
 * - 主背景: 深酒红 (#1a0505) - 喜庆而不刺眼
 * - 强调色: 金色 (#FFD700) - 标题、标签、边框高光
 * - 辉光效果: 橙红色 (#ff4500) - 文字阴影与光晕
 * - 文字色: 米白 (#F5E6D3) - 正文内容
 * - 卡片背景: 半透明深红 rgba(40, 5, 5, 0.55)
 * 
 * **视觉特征**:
 * - 容器: 完全透明，让背景图透出
 * - 卡片: Glassmorphism 毛玻璃效果 (backdrop-filter: blur 8-12px)
 * - 边框: 1px 半透明金色边框 rgba(255, 215, 0, 0.3)
 * - 阴影: 金色辉光 (0 0 15px rgba(255, 215, 0, 0.4))
 * - 字体阴影: 深黑底色增强可读性 (0 1px 2px rgba(0,0,0,0.8))
 * - 品级徽章: 半透明磨砂背景 + 对应色系边框
 * 
 * **特殊效果**:
 * - 金色文字发光: text-shadow: 0 0 10px #ff4500
 * - 锁定状态: 霓虹红 #ff5252 / 霓虹绿 #69f0ae
 * - 分页胶囊: 圆角黑底金字 + 金色边框
 * 
 * **布局结构**:
 * - 宽度: 800px
 * - 物品网格: 4列，15px 间距
 * - 顶部: Glassmorphism 卡片包裹头像与进度条
 * 
 * =============================================================================
 */

import plugin from '../../../../lib/plugins/plugin.js';
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';
import * as SkinLogic from '../../logic/skin_logic.js';
import * as DAL from '../../api/data-access.js';
import customPuppeteer from '../../api/puppeteer-wrapper.js';
import { aggregatePlayerData, transformPlayerDataForRender } from '../../logic/player_view_logic.js';
// 使用DAL的existPlayer函数

export class SkinSystem extends plugin {
    constructor() {
        super({
            name: '皮肤系统',
            dsc: '皮肤管理',
            event: 'message',
            priority: 500,
            rule: [
                {
                    reg: '^#我的皮肤$',
                    fnc: 'showMySkins'
                },
                {
                    reg: '^#切换皮肤(.+)$',
                    fnc: 'equipSkin'
                },
                {
                    reg: '^#测试皮肤(.+)$',
                    fnc: 'testSkin'
                },
                {
                    reg: '^#测试练气(.+)$',
                    fnc: 'testPlayerSkin'
                },
                {
                    reg: '^#发放皮肤(.+)$',
                    fnc: 'grantSkin'
                },
                {
                    reg: '^#皮肤列表$',
                    fnc: 'showAllSkins'
                }
            ]
        });
    }

    /**
     * 展示玩家拥有的皮肤
     */
    async showMySkins(e) {
        if (!e.isGroup) {
            return e.reply('请在群聊中使用此指令');
        }

        const userId = e.user_id;
        if (!await DAL.existPlayer(userId)) {
            return e.reply('请先发送 #踏入仙途 创建角色');
        }

        const { ownedSkins, currentSkinId } = await SkinLogic.GetPlayerSkins(userId);
        const allSkins = SkinLogic.GetAllSkins();

        // 预处理皮肤列表，标记状态，并补充缺省颜色
        const processedSkins = allSkins.map(skin => {
            // 默认颜色配置
            const defaultColors = {
                primary: '#6a3906',
                secondary: '#a88763',
                background: '#fdfaf5', // 默认浅色背景 
                text: '#4a2c1a',
                border: '#d2b48c',
                accent: '#7a5533'
            };

            return {
                ...skin,
                colors: { ...defaultColors, ...(skin.colors || {}) },
                isOwned: ownedSkins.some(owned => owned.id === skin.id),
                isCurrent: skin.id === currentSkinId
            };
        });

        const renderData = {
            allSkins: processedSkins,
            currentSkinId: currentSkinId,
            ownedSkins: ownedSkins,
            user_id: userId,
            tplFile: './plugins/xiuxian-emulator-plugin/resources/html/skin/skin_list.html'
        };

        // 渲染图片
        const dataForPuppeteer = await new Show(e).get_imgData('skin_list', renderData);
        const img = await puppeteer.screenshot('skin_list', { ...dataForPuppeteer });
        await e.reply(img);
    }

    /**
     * 装备皮肤
     */
    async equipSkin(e) {
        if (!e.isGroup) {
            return e.reply('请在群聊中使用此指令');
        }

        const userId = e.user_id;
        if (!await DAL.existPlayer(userId)) {
            return e.reply('请先发送 #踏入仙途 创建角色');
        }

        const skinName = e.msg.replace(/^#切换皮肤/, '').trim();
        if (!skinName) {
            return e.reply('请输入皮肤名称，例如：#切换皮肤龙马精神');
        }

        // 通过名称查找皮肤
        const skin = SkinLogic.FindSkinByName(skinName);
        if (!skin) {
            return e.reply(`未找到名为【${skinName}】的皮肤`);
        }

        const result = await SkinLogic.EquipSkin(userId, skin.id);
        await e.reply(result.message);
    }

    /**
     * 管理员测试皮肤效果（临时预览）
     */
    async testSkin(e) {
        if (!e.isMaster) {
            return e.reply('仅管理员可使用此指令');
        }

        const userId = e.user_id;
        if (!await DAL.existPlayer(userId)) {
            return e.reply('请先发送 #踏入仙途 创建角色');
        }

        const skinName = e.msg.replace(/^#测试皮肤/, '').trim();
        if (!skinName) {
            return e.reply('请输入皮肤名称，例如：#测试皮肤龙马精神');
        }

        const skin = SkinLogic.FindSkinByName(skinName);
        if (!skin) {
            return e.reply(`未找到名为【${skinName}】的皮肤`);
        }

        // 临时渲染带有该皮肤的纳戒页面
        const playerData = await DAL.getAllPlayerData(userId);
        if (!playerData) {
            return e.reply('未找到玩家数据');
        }

        // 构建预览数据
        const previewData = {
            skinPreview: true,
            skinConfig: skin,
            skinName: skin.name,
            player: playerData.player,
            najie: playerData.najie
        };

        await e.reply(`正在预览皮肤【${skin.name}】效果...`);

        // 渲染预览图
        const dataForPuppeteer = await new Show(e).get_imgData('skinPreview', previewData);
        const img = await puppeteer.screenshot('skinPreview', { ...dataForPuppeteer });
        await e.reply(img);
    }

    /**
     * 管理员测试练气面板皮肤效果（真实练气页）
     */
    async testPlayerSkin(e) {
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

        const skinName = e.msg.replace(/^#测试练气/, '').trim();
        if (!skinName) {
            return e.reply('请输入皮肤名称，例如：#测试练气雨霁青岚');
        }

        const skin = SkinLogic.FindSkinByName(skinName);
        if (!skin) {
            return e.reply(`未找到名为【${skinName}】的皮肤`);
        }

        const rawData = await aggregatePlayerData(userId);
        if (!rawData) {
            return e.reply('未找到玩家数据');
        }

        const renderData = await transformPlayerDataForRender(rawData, e);
        renderData.skinConfig = skin;

        if (skin.colors) {
            const c = skin.colors;
            renderData.skinStyle = `<style>
      :root {
        --skin-primary: ${c.primary || '#6a3906'};
        --skin-secondary: ${c.secondary || '#a88763'};
        --skin-background: ${c.background || 'rgba(253, 250, 245, 0.88)'};
        --skin-text: ${c.text || '#4a2c1a'};
        --skin-border: ${c.border || '#d2b48c'};
        --skin-accent: ${c.accent || '#7a5533'};
      }
      </style>`;
        } else {
            renderData.skinStyle = '';
        }

        await e.reply(`正在预览练气主题【${skin.name}】...`);

        const dataForPuppeteer = await new Show(e).get_playerData(renderData);
        const img = await customPuppeteer.screenshot('player', { ...dataForPuppeteer });
        await e.reply(img);
    }

    /**
     * 管理员发放皮肤
     */
    async grantSkin(e) {
        if (!e.isMaster) {
            return e.reply('仅管理员可使用此指令');
        }

        const msg = e.msg.replace(/^#发放皮肤/, '').trim();

        // 解析目标用户
        let targetUserId = null;
        if (e.at) {
            targetUserId = e.at;
        } else if (e.message) {
            for (const seg of e.message) {
                if (seg.type === 'at') {
                    targetUserId = seg.qq;
                    break;
                }
            }
        }

        if (!targetUserId) {
            return e.reply('请@要发放皮肤的玩家，例如：#发放皮肤龙马精神 @玩家');
        }

        // 获取皮肤名称（移除@部分）
        const skinName = msg.replace(/<at.*?\/>/g, '').replace(/@\S+/g, '').trim();
        if (!skinName) {
            return e.reply('请输入皮肤名称');
        }

        const skin = SkinLogic.FindSkinByName(skinName);
        if (!skin) {
            return e.reply(`未找到名为【${skinName}】的皮肤`);
        }

        // 检查目标玩家是否存在
        if (!await DAL.existPlayer(targetUserId)) {
            return e.reply('目标玩家不存在');
        }

        const result = await SkinLogic.GrantSkin(targetUserId, skin.id);
        await e.reply(result.message);
    }

    /**
     * 展示所有可用皮肤（管理员）
     */
    async showAllSkins(e) {
        const allSkins = SkinLogic.GetAllSkins();

        let msg = ['═══ 皮肤列表 ═══\n'];

        for (const skin of allSkins) {
            const isDefault = skin.isDefault ? ' [默认]' : '';
            const isLimit = skin.eventKey ? ' [限定]' : '';
            msg.push(`\n【${skin.name}】${isDefault}${isLimit}`);
            msg.push(`  ID: ${skin.id}`);
            msg.push(`  ${skin.desc}`);
        }

        await e.reply(msg.join('\n'));
    }
}
