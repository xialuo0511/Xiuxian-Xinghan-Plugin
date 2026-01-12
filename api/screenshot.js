/**
 * 自定义截图模块
 * 支持等待页面ready信号后再进行截图
 * 
 * @module api/screenshot
 */

import puppeteer from 'puppeteer';
import template from 'art-template';
import fs from 'fs';
import path from 'path';

// 插件根目录
const PLUGIN_ROOT = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin');
const HTML_ROOT = path.join(PLUGIN_ROOT, 'resources', 'html');

// 浏览器实例（单例）
let browserInstance = null;

// 默认配置
const defaultConfig = {
    timeout: 5000,           // 等待ready信号的超时时间(ms)
    readySelector: '#capture.ready',  // ready信号选择器
    scale: 1,                // 设备缩放比例（1倍速度最快）
    imgType: 'jpeg',         // 图片格式（jpeg比png小很多）
    quality: 85,             // JPEG质量
    fullPage: false,         // 是否全页截图
    selector: '#capture'     // 截图区域选择器
};

/**
 * 获取浏览器实例（单例模式）
 */
async function getBrowser() {
    if (!browserInstance || !browserInstance.isConnected()) {
        console.log('[Screenshot] 启动浏览器实例...');
        browserInstance = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
                '--safebrowsing-disable-auto-update'
            ]
        });

        // 监听浏览器断开事件
        browserInstance.on('disconnected', () => {
            console.log('[Screenshot] 浏览器实例已断开');
            browserInstance = null;
        });
    }
    return browserInstance;
}

/**
 * 关闭浏览器实例
 */
export async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
        console.log('[Screenshot] 浏览器实例已关闭');
    }
}

/**
 * 渲染HTML模板
 * @param {string} tplFile - 模板文件路径
 * @param {object} data - 渲染数据
 * @returns {string} 渲染后的HTML
 */
function renderTemplate(tplFile, data) {
    const tplContent = fs.readFileSync(tplFile, 'utf-8');

    // 配置art-template
    template.defaults.imports.parseInt = parseInt;
    template.defaults.imports.parseFloat = parseFloat;
    template.defaults.imports.JSON = JSON;
    template.defaults.imports.Math = Math;
    template.defaults.imports.Date = Date;

    return template.render(tplContent, data);
}

/**
 * 截图核心函数
 * 
 * @param {string} name - 截图名称（用于日志）
 * @param {object} options - 截图选项
 * @param {string} options.tplFile - HTML模板文件路径
 * @param {number} [options.timeout=5000] - 等待ready信号超时时间
 * @param {string} [options.readySelector='#capture.ready'] - ready信号选择器
 * @param {number} [options.scale=2] - 缩放比例
 * @param {string} [options.imgType='png'] - 图片格式 (png/jpeg/webp)
 * @param {string} [options.selector='#capture'] - 截图区域选择器
 * @param {...any} data - 模板渲染数据
 * @returns {Promise<Buffer>} 图片Buffer
 */
export async function screenshot(name, options = {}) {
    const config = { ...defaultConfig, ...options };
    const startTime = Date.now();
    let page = null;

    try {
        // 1. 获取浏览器实例
        const browser = await getBrowser();
        page = await browser.newPage();

        // 2. 设置视口
        await page.setViewport({
            width: 1200,
            height: 800,
            deviceScaleFactor: config.scale
        });

        // 3. 渲染HTML模板
        if (!config.tplFile) {
            throw new Error(`[Screenshot] ${name}: 未指定模板文件(tplFile)`);
        }

        const html = renderTemplate(config.tplFile, options);

        // 4. 写入临时HTML文件，然后用goto加载（确保file://路径的CSS能正常加载）
        const tempDir = path.join(PLUGIN_ROOT, 'temp', 'html');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempHtmlPath = path.join(tempDir, `${name}_${Date.now()}.html`);
        fs.writeFileSync(tempHtmlPath, html, 'utf-8');

        await page.goto(`file:///${tempHtmlPath.replace(/\\/g, '/')}`, {
            waitUntil: 'domcontentloaded',
            timeout: 10000
        });

        // 清理临时文件（延迟删除，确保页面加载完成）
        setTimeout(() => {
            fs.unlink(tempHtmlPath, () => { });
        }, 5000);

        // 5. 等待ready信号
        try {
            await page.waitForSelector(config.readySelector, {
                timeout: config.timeout
            });
            console.log(`[Screenshot] ${name}: ready信号已接收 (${Date.now() - startTime}ms)`);
        } catch (waitError) {
            console.warn(`[Screenshot] ${name}: 等待ready信号超时，降级截图`);
        }

        // 6. 获取截图区域
        const element = await page.$(config.selector);
        if (!element) {
            throw new Error(`[Screenshot] ${name}: 找不到截图区域 ${config.selector}`);
        }

        // 7. 截图
        const screenshotOptions = {
            type: config.imgType,
            encoding: 'binary'
        };

        if (config.imgType === 'jpeg') {
            screenshotOptions.quality = config.quality;
        }

        const imgBuffer = await element.screenshot(screenshotOptions);

        // 调试：保存截图到文件
        const debugDir = path.join(PLUGIN_ROOT, 'temp', 'screenshots');
        if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, { recursive: true });
        }
        const debugPath = path.join(debugDir, `${name}_${Date.now()}.${config.imgType}`);
        fs.writeFileSync(debugPath, imgBuffer);
        console.log(`[Screenshot] ${name}: 截图已保存到 ${debugPath}`);
        console.log(`[Screenshot] ${name}: 截图完成 (${Date.now() - startTime}ms), 大小: ${(imgBuffer.length / 1024).toFixed(2)}KB`);

        // 8. 返回icqq兼容的消息段格式
        // yunzai使用全局segment对象，也可直接返回对象格式
        return {
            type: 'image',
            file: imgBuffer
        };

    } catch (error) {
        console.error(`[Screenshot] ${name}: 截图失败`, error);
        throw error;
    } finally {
        // 关闭页面
        if (page) {
            await page.close().catch(() => { });
        }
    }
}

/**
 * 快捷截图函数（自动查找模板）
 * 
 * @param {string} name - 模板名称（对应resources/html/{name}/{name}.html）
 * @param {object} data - 渲染数据
 * @returns {Promise<Buffer>} 图片Buffer
 */
export async function screenshotByName(name, data = {}) {
    const tplFile = path.join(HTML_ROOT, name, `${name}.html`);

    if (!fs.existsSync(tplFile)) {
        throw new Error(`[Screenshot] 模板文件不存在: ${tplFile}`);
    }

    return screenshot(name, {
        tplFile,
        ...data
    });
}

// 默认导出
export default {
    screenshot,
    screenshotByName,
    closeBrowser
};
