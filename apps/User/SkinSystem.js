import plugin from '../../../../lib/plugins/plugin.js';
import puppeteer from '../../../../lib/puppeteer/puppeteer.js';
import Show from '../../model/show.js';
import * as SkinLogic from '../../logic/skin_logic.js';
import * as DAL from '../../api/data-access.js';
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

        // 预处理皮肤列表，标记状态
        const processedSkins = allSkins.map(skin => {
            return {
                ...skin,
                isOwned: ownedSkins.some(owned => owned.id === skin.id),
                isCurrent: skin.id === currentSkinId
            };
        });

        const renderData = {
            allSkins: processedSkins,
            currentSkinId: currentSkinId,
            ownedSkins: ownedSkins,
            user_id: userId
        };

        // 渲染图片
        const dataForPuppeteer = await new Show(e).get_imgData('skin/skin_list', renderData);
        const img = await puppeteer.screenshot('skin/skin_list', { ...dataForPuppeteer });
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
