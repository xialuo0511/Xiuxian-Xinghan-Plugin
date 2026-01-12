/**
 * 截图服务包装模块
 * 优先使用自定义截图（支持ready信号），失败时回退到yunzai官方
 * 
 * @module api/puppeteer-wrapper
 */

import { screenshot as customScreenshot, closeBrowser } from './screenshot.js';
import yunzaiPuppeteer from '../../../lib/puppeteer/puppeteer.js';
import path from 'path';

const PLUGIN_ROOT = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin');
const HTML_ROOT = path.join(PLUGIN_ROOT, 'resources', 'html');

/**
 * 统一截图接口
 * 兼容原有yunzai puppeteer.screenshot调用方式
 * 
 * @param {string} name - 模板名称
 * @param {object} options - 选项
 * @returns {Promise<any>} 图片消息段
 */
async function screenshot(name, options = {}) {
    // 如果已经指定了tplFile，直接使用
    // 否则根据name自动查找
    if (!options.tplFile) {
        options.tplFile = path.join(HTML_ROOT, name, `${name}.html`);
    }

    try {
        // 优先使用自定义截图（支持ready信号等待）
        const result = await customScreenshot(name, options);
        return result;
    } catch (error) {
        console.warn(`[PuppeteerWrapper] 自定义截图失败，回退yunzai: ${error.message}`);

        // 回退到yunzai官方截图
        try {
            return await yunzaiPuppeteer.screenshot(name, options);
        } catch (fallbackError) {
            console.error(`[PuppeteerWrapper] yunzai截图也失败: ${fallbackError.message}`);
            throw fallbackError;
        }
    }
}

/**
 * 使用yunzai原生截图（不等待ready信号）
 */
async function screenshotLegacy(name, options = {}) {
    return await yunzaiPuppeteer.screenshot(name, options);
}

// 导出兼容yunzai的接口
export default {
    screenshot,
    screenshotLegacy,
    closeBrowser
};

export { screenshot, screenshotLegacy, closeBrowser };
