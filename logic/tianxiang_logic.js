/**
 * 天象系统逻辑 (tianxiang_logic.js)
 * 天地榜2.0核心模块 - 天象轮换与灵根效果
 */

// ===== 天象定义 =====
export const TIANXIANG_LIST = [
    {
        id: 'wuxing_jin',
        name: '五行失衡·金',
        duration: 3,
        desc: '金气旺盛，金克木',
        effects: { element: '金', bonus: 0.5, penaltyElement: '木', penalty: -0.3 }
    },
    {
        id: 'wuxing_mu',
        name: '五行失衡·木',
        duration: 3,
        desc: '木气充盈，木克土',
        effects: { element: '木', bonus: 0.5, penaltyElement: '土', penalty: -0.3 }
    },
    {
        id: 'wuxing_shui',
        name: '五行失衡·水',
        duration: 3,
        desc: '水德流行，水克火',
        effects: { element: '水', bonusCrit: 0.3, penaltyElement: '火', penalty: -0.3 }
    },
    {
        id: 'wuxing_huo',
        name: '五行失衡·火',
        duration: 3,
        desc: '烈火焚天，易攻难守',
        effects: { element: '火', bonus: 1.0, defPenalty: -0.5 }
    },
    {
        id: 'wuxing_tu',
        name: '五行失衡·土',
        duration: 3,
        desc: '厚土载物，稳如磐石',
        effects: { element: '土', defBonus: 0.8, speedPenalty: -0.5 }
    },
    {
        id: 'bianyi_lingchao',
        name: '变异灵潮',
        duration: 4,
        desc: '变异灵根之力觉醒',
        effects: { linggenType: '变异灵根', bonus: 0.4 }
    },
    {
        id: 'tizhi_gongming',
        name: '体质共鸣',
        duration: 4,
        desc: '体质之力与天地共鸣',
        effects: { linggenType: '体质', defBonus: 0.3, faqiuBonus: 0.2 }
    },
    {
        id: 'moqi_qinshi',
        name: '魔气侵蚀',
        duration: 3,
        desc: '魔道之力侵蚀天地',
        effects: { linggenType: '魔头', bonus: 0.6, penaltyType: '圣体', penalty: -0.2 }
    },
    {
        id: 'lunhui_tianjie',
        name: '轮回天劫',
        duration: 3,
        desc: '轮回之力降临',
        effects: { linggenType: '转生', bonus: 0.5, globalBonus: 0.1 }
    },
    {
        id: 'tiandao_zhenya',
        name: '天道镇压',
        duration: 3,
        desc: '天道公平，境界压制失效',
        effects: { suppressLevel: true }
    },
    {
        id: 'shajie_jianglin',
        name: '杀劫降临',
        duration: 3,
        desc: '杀劫之下，速战速决',
        effects: { damageBonus: 1.0, hpPenalty: -0.3 }
    },
    {
        id: 'hunyuan_guiyi',
        name: '混元归一',
        duration: 999,
        desc: '天地平和，无特殊效果',
        effects: {}
    }
];

// ===== 五行相克关系 =====
const WUXING_KEZHI = {
    '金': '木',
    '木': '土',
    '土': '水',
    '水': '火',
    '火': '金'
};

/**
 * 从灵根名称提取五行元素
 */
export function extractElements(linggenName) {
    if (!linggenName) return [];
    const elements = [];
    const fiveElements = ['金', '木', '水', '火', '土'];
    const variantElements = ['风', '冰', '雷', '光', '暗'];

    for (const el of [...fiveElements, ...variantElements]) {
        if (linggenName.includes(el)) {
            elements.push(el);
        }
    }
    return elements;
}

/**
 * 获取灵根类型
 */
export function getLinggenType(linggen) {
    if (!linggen) return null;
    return linggen.type || null;
}

/**
 * 计算五行克制倍率
 */
export function calculateWuxingBonus(attackerLinggen, defenderLinggen) {
    const attackerElements = extractElements(attackerLinggen?.name);
    const defenderElements = extractElements(defenderLinggen?.name);

    // 变异元素不参与五行相克
    const fiveElements = ['金', '木', '水', '火', '土'];
    const attackerWuxing = attackerElements.filter(e => fiveElements.includes(e));
    const defenderWuxing = defenderElements.filter(e => fiveElements.includes(e));

    if (attackerWuxing.length === 0 || defenderWuxing.length === 0) {
        return 1.0; // 无五行属性
    }

    // 取第一个五行元素判断克制
    const attackEl = attackerWuxing[0];
    const defendEl = defenderWuxing[0];

    if (WUXING_KEZHI[attackEl] === defendEl) {
        return 1.2; // 克制 +20%
    }
    if (WUXING_KEZHI[defendEl] === attackEl) {
        return 0.8; // 被克 -20%
    }
    return 1.0;
}

/**
 * 获取当前天象
 */
export async function getCurrentTianxiang() {
    try {
        const data = await redis.get('xiuxian:tiandibang:tianxiang');
        if (data) {
            return JSON.parse(data);
        }
    } catch (e) {
        // ignore
    }
    // 默认返回混元归一
    return TIANXIANG_LIST.find(t => t.id === 'hunyuan_guiyi');
}

/**
 * 设置新天象
 */
export async function setTianxiang(tianxiang, durationDays) {
    const endTime = Date.now() + durationDays * 24 * 60 * 60 * 1000;
    const data = {
        ...tianxiang,
        startTime: Date.now(),
        endTime: endTime
    };
    await redis.set('xiuxian:tiandibang:tianxiang', JSON.stringify(data));
    return data;
}

/**
 * 随机生成新天象（排除混元归一）
 */
export function generateRandomTianxiang() {
    const available = TIANXIANG_LIST.filter(t => t.id !== 'hunyuan_guiyi');
    const idx = Math.floor(Math.random() * available.length);
    return available[idx];
}

/**
 * 检查并轮换天象（供定时任务调用）
 */
export async function checkAndRotateTianxiang() {
    const current = await getCurrentTianxiang();

    // 如果天象已过期或不存在
    if (!current.endTime || Date.now() > current.endTime) {
        const newTianxiang = generateRandomTianxiang();
        // 随机3-7天时长
        const randomDuration = Math.floor(Math.random() * 5) + 3; // 3-7天
        await setTianxiang(newTianxiang, randomDuration);
        return {
            rotated: true,
            oldTianxiang: current,
            newTianxiang: newTianxiang,
            duration: randomDuration
        };
    }

    return { rotated: false, current };
}

/**
 * 计算天象对战斗的修正
 */
export function applyTianxiangEffects(tianxiang, player) {
    const effects = tianxiang?.effects || {};
    const linggen = player.灵根;
    const linggenType = getLinggenType(linggen);
    const elements = extractElements(linggen?.name);

    let atkModifier = 1.0;
    let defModifier = 1.0;
    let critModifier = 0;
    let hpModifier = 1.0;

    // 五行失衡效果
    if (effects.element && elements.includes(effects.element)) {
        atkModifier += effects.bonus || 0;
        critModifier += effects.bonusCrit || 0;
        defModifier += effects.defBonus || 0;
        defModifier += effects.defPenalty || 0;
    }

    // 被克惩罚
    if (effects.penaltyElement && elements.includes(effects.penaltyElement)) {
        atkModifier += effects.penalty || 0;
    }

    // 灵根类型效果
    if (effects.linggenType && linggenType === effects.linggenType) {
        atkModifier += effects.bonus || 0;
        defModifier += effects.defBonus || 0;
    }

    // 被惩罚的灵根类型
    if (effects.penaltyType && linggenType === effects.penaltyType) {
        atkModifier += effects.penalty || 0;
    }

    // 全局效果
    if (effects.globalBonus) {
        atkModifier += effects.globalBonus;
    }

    // 杀劫效果
    if (effects.damageBonus) {
        atkModifier += effects.damageBonus;
    }
    if (effects.hpPenalty) {
        hpModifier += effects.hpPenalty;
    }

    return {
        atkModifier: Math.max(0.1, atkModifier),
        defModifier: Math.max(0.1, defModifier),
        critModifier,
        hpModifier: Math.max(0.1, hpModifier),
        suppressLevel: effects.suppressLevel || false
    };
}

/**
 * 格式化天象剩余时间
 */
export function formatTianxiangRemaining(tianxiang) {
    if (!tianxiang?.endTime) return '永久';
    const remaining = tianxiang.endTime - Date.now();
    if (remaining <= 0) return '即将更替';

    const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (days > 0) return `${days}天${hours}小时`;
    return `${hours}小时`;
}
