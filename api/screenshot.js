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

/**
 * 读取本地文件并转为Base64 Data URI
 * @param {string} fileUrl file://开头的路径
 * @returns {string} base64 data uri
 */
function getBase64FromUrl(fileUrl, baseDir) {
    try {
        let realPath = fileUrl;

        if (fileUrl.startsWith('file://')) {
            const filePath = fileUrl.replace('file://', '');
            realPath = process.platform === 'win32' && filePath.startsWith('/') ? filePath.slice(1) : filePath;
            realPath = decodeURIComponent(realPath);
        } else if (baseDir && !path.isAbsolute(fileUrl) && !fileUrl.startsWith('data:') && !fileUrl.startsWith('http')) {
            realPath = path.resolve(baseDir, fileUrl.split('?')[0].split('#')[0]);
        }

        realPath = realPath.replace(/['"]/g, '');

        if (!fs.existsSync(realPath)) {
            return fileUrl;
        }

        const imgBuffer = fs.readFileSync(realPath);
        const base64 = imgBuffer.toString('base64');
        const ext = path.extname(realPath).substring(1).toLowerCase();

        let mimeType = ext;
        if (ext === 'jpg') mimeType = 'image/jpeg';
        else if (ext === 'jpeg') mimeType = 'image/jpeg';
        else if (ext === 'png') mimeType = 'image/png';
        else if (ext === 'gif') mimeType = 'image/gif';
        else if (ext === 'webp') mimeType = 'image/webp';
        else if (ext === 'svg') mimeType = 'image/svg+xml';
        else if (ext === 'ttf') mimeType = 'font/ttf';
        else if (ext === 'woff') mimeType = 'font/woff';
        else if (ext === 'woff2') mimeType = 'font/woff2';

        return `data:${mimeType};base64,${base64}`;
    } catch (e) {
        console.warn(`[Screenshot] 读取文件失败: ${fileUrl}`, e.message);
        return fileUrl;
    }
}

/**
 * 将HTML中的外部资源（CSS、图片）内联
 * @param {string} html 原始HTML
 * @returns {string} 内联后的HTML
 */
function inlineResources(html) {
    // 1. 内联CSS <link href="..." rel="stylesheet" />
    // 支持换行、属性乱序、单双引号
    html = html.replace(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi, (match, url) => {
        // 检查是否是stylesheet
        if (!match.includes('rel="stylesheet"') && !match.includes("rel='stylesheet'")) {
            return match;
        }

        try {
            let cssPath = url;
            if (url.startsWith('file://')) {
                const filePath = url.replace('file://', '');
                cssPath = process.platform === 'win32' && filePath.startsWith('/') ? filePath.slice(1) : filePath;
                cssPath = decodeURIComponent(cssPath);
            }

            if (!fs.existsSync(cssPath)) return match;

            const cssDir = path.dirname(cssPath);
            let cssContent = fs.readFileSync(cssPath, 'utf-8');

            // 递归处理CSS中的 url(...)，传入cssDir作为基准目录解析相对路径
            cssContent = cssContent.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (match, assetUrl) => {
                if (assetUrl.startsWith('data:')) return match;
                const base64 = getBase64FromUrl(assetUrl, cssDir);
                return `url("${base64}")`;
            });

            return `<style>\n${cssContent}\n</style>`;
        } catch (e) {
            console.warn(`[Screenshot] 内联CSS失败: ${url}`, e.message);
            return match;
        }
    });

    // 2. 内联HTML中的内联样式图片 url(...)
    html = html.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (match, imgUrl) => {
        if (imgUrl.startsWith('data:')) return match;
        // HTML中的相对路径通常相对于HTML文件位置，但这里我们在内存中，通常只能处理绝对路径或file协议
        const base64 = getBase64FromUrl(imgUrl);
        return `url("${base64}")`;
    });

    // 3. 内联图片 <img src="..." />
    html = html.replace(/<img([^>]+)src=["']([^"']+)["']([^>]*)>/gi, (match, preAttrs, url, postAttrs) => {
        const base64 = getBase64FromUrl(url);
        if (base64.startsWith('data:')) {
            return `<img${preAttrs}src="${base64}"${postAttrs}>`;
        }
        return match;
    });

    return html;
}

// 浏览器实例（单例）
let browserInstance = null;

// 默认配置
const defaultConfig = {
    timeout: 5000,           // 等待ready信号的超时时间(ms)
    readySelector: '#capture.ready',  // ready信号选择器
    scale: 2,                // 设备缩放比例（2倍高清）
    imgType: 'jpeg',         // 图片格式（jpeg比png小很多）
    quality: 90,             // JPEG质量（90高画质）
    fullPage: false,         // 是否全页截图
    selector: '#capture',    // 截图区域选择器
    debugSave: process.env.XIUXIAN_SCREENSHOT_DEBUG === '1' // 默认关闭调试落盘
};

// `Runtime.callFunctionOn timed out` often happens on heavy templates when this is too low.
const BROWSER_PROTOCOL_TIMEOUT = Number(process.env.XIUXIAN_PROTOCOL_TIMEOUT || 120000);
const PAGE_CLOSE_TIMEOUT = Number(process.env.XIUXIAN_PAGE_CLOSE_TIMEOUT || 2000);

/**
 * 获取浏览器实例（单例模式）
 */
async function getBrowser() {
    if (!browserInstance || !browserInstance.isConnected()) {
        console.log('[Screenshot] 启动浏览器实例...');
        browserInstance = await puppeteer.launch({
            headless: true,
            protocolTimeout: BROWSER_PROTOCOL_TIMEOUT,
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

async function forceKillBrowser(browser, reason = '') {
    const browserProcess = browser?.process?.();
    if (browserProcess && !browserProcess.killed) {
        browserProcess.kill('SIGKILL');
        console.warn(`[Screenshot] 浏览器进程已强制结束${reason ? `: ${reason}` : ''}`);
    }
}

/**
 * 关闭浏览器实例
 */
export async function closeBrowser() {
    const browser = browserInstance;
    browserInstance = null;

    if (browser) {
        try {
            await Promise.race([
                browser.close(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('browser.close timeout')), PAGE_CLOSE_TIMEOUT))
            ]);
            console.log('[Screenshot] 浏览器实例已关闭');
        } catch (error) {
            console.warn(`[Screenshot] 关闭浏览器实例失败: ${error.message}`);
            await forceKillBrowser(browser, error.message);
        }
    }
}

async function closePageSafely(page, name) {
    if (!page || page.isClosed()) return;

    try {
        await Promise.race([
            page.close(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('page.close timeout')), PAGE_CLOSE_TIMEOUT))
        ]);
    } catch (error) {
        console.warn(`[Screenshot] ${name}: 页面关闭失败，准备重置浏览器: ${error.message}`);
        await closeBrowser().catch(() => { });
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
    template.defaults.imports.splitDisplayText = splitDisplayText;

    return template.render(tplContent, data);
}

function splitDisplayText(value) {
    const text = value == null ? '' : String(value);
    const match = text.match(/^(.*?)(-?\d+(?:\.\d+)?)([^\d.]*)$/);

    if (!match) {
        return { prefix: text, number: '', suffix: '' };
    }

    return {
        prefix: match[1] || '',
        number: match[2] || '',
        suffix: match[3] || ''
    };
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
    let stage = 'init';

    try {
        // 1. 获取浏览器实例
        stage = 'getBrowser';
        const browser = await getBrowser();
        stage = 'newPage';
        page = await browser.newPage();

        // 2. 设置视口
        stage = 'setViewport';
        await page.setViewport({
            width: 1200,
            height: 800,
            deviceScaleFactor: config.scale
        });

        // 3. 渲染HTML模板
        stage = 'renderTemplate';
        if (!config.tplFile) {
            throw new Error(`[Screenshot] ${name}: 未指定模板文件(tplFile)`);
        }

        const htmlRaw = renderTemplate(config.tplFile, options);

        // 4. 内联资源（CSS & 图片）
        // 这一步将极其显著地提升加载速度，因为避开了文件加载等待
        stage = 'inlineResources';
        let html = inlineResources(htmlRaw);

        // 4.5 向所有 font-family 声明末尾追加 emoji 字体
        // 用正则匹配所有 font-family 声明，在已有字体链末尾追加 emoji 字体名。
        // 中文字体优先，遇到 emoji 字符时 fallback 到系统 emoji 字体，互不干扰。
        // 注：服务器需安装 emoji 字体：
        //   yum install google-noto-emoji-color-fonts   (CentOS/RHEL)
        //   dnf install google-noto-emoji-color-fonts   (Fedora)
        const EMOJI_FONTS = '"Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", "Twemoji Mozilla"';
        html = html.replace(
            /font-family\s*:\s*([^;}"'<>\n]{3,}?)\s*(?=[;}"'])/gi,
            (match, fonts) => {
                if (fonts.includes('Noto Color Emoji') || fonts.includes('Segoe UI Emoji')) {
                    return match;
                }
                const cleaned = fonts.trim().replace(/,\s*$/, '');
                return `font-family: ${cleaned}, ${EMOJI_FONTS}`;
            }
        );

        // 5. 直接使用 setContent 加载
        stage = 'setContent';
        await page.setContent(html, {
            waitUntil: 'domcontentloaded',
            timeout: 5000
        });

        // 5. 等待ready信号
        stage = 'waitReady';
        try {
            await page.waitForSelector(config.readySelector, {
                timeout: config.timeout
            });
            console.log(`[Screenshot] ${name}: ready信号已接收 (${Date.now() - startTime}ms)`);
        } catch (waitError) {
            // Ready 超时不是致命错误，继续尝试截图（页面可能已经渲染完成但没有发送信号）
            console.log(`[Screenshot] ${name}: 未等到ready信号，继续截图 (${Date.now() - startTime}ms)`);
        }

        // 6. 获取截图区域
        stage = 'queryElement';
        const element = await page.$(config.selector);
        if (!element) {
            throw new Error(`[Screenshot] ${name}: 找不到截图区域 ${config.selector}`);
        }

        // 7. 截图
        stage = 'takeScreenshot';
        const screenshotOptions = {
            type: config.imgType,
            encoding: 'binary'
        };

        if (config.imgType === 'jpeg') {
            screenshotOptions.quality = config.quality;
        }

        const imgBuffer = await element.screenshot(screenshotOptions);

        // 调试：仅在开启调试模式时落盘，避免每次截图都产生额外IO
        if (config.debugSave) {
            const debugDir = path.join(PLUGIN_ROOT, 'temp', 'screenshots');
            if (!fs.existsSync(debugDir)) {
                fs.mkdirSync(debugDir, { recursive: true });
            }
            const debugPath = path.join(debugDir, `${name}_${Date.now()}.${config.imgType}`);
            fs.writeFileSync(debugPath, imgBuffer);
            console.log(`[Screenshot] ${name}: 截图已保存到 ${debugPath}`);
        }
        console.log(`[Screenshot] ${name}: 截图完成 (${Date.now() - startTime}ms), 大小: ${(imgBuffer.length / 1024).toFixed(2)}KB`);

        // 8. 返回icqq兼容的消息段格式
        stage = 'done';
        // yunzai使用全局segment对象，也可直接返回对象格式
        return {
            type: 'image',
            file: imgBuffer
        };

    } catch (error) {
        console.error(
            `[Screenshot] ${name}: 截图失败(stage=${stage}, elapsed=${Date.now() - startTime}ms)`,
            error
        );
        throw error;
    } finally {
        // 关闭页面
        if (page) {
            await closePageSafely(page, name);
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
