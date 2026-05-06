/**
 * ============================================================================
 *                      截图服务包装模块 (Puppeteer Wrapper)
 * ============================================================================
 *
 * 本模块是插件自定义截图系统的核心入口，为所有需要截图功能的模块提供统一接口。
 * 它封装了自定义截图引擎 (./screenshot.js) 和 Yunzai 官方截图 (puppeteer.js)。
 *
 * @module api/puppeteer-wrapper
 * @author 屑洛
 *
 * ============================================================================
 *                             📝 开发者对接指南
 * ============================================================================
 *
 * 【重要】如果你的 HTML 模板需要使用本自定义截图模块，必须满足以下条件：
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  1. HTML 结构要求                                                        │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                          │
 * │  你的 HTML 必须包含一个 id="capture" 的 div 容器，它是截图区域的边界。    │
 * │  截图模块会精确截取这个 div 的内容。                                      │
 * │                                                                          │
 * │  ✅ 正确示例:                                                             │
 * │  ┌──────────────────────────────────────────────────────────────────┐   │
 * │  │ <body>                                                           │   │
 * │  │   <div id="capture">                                             │   │
 * │  │     <!-- 你的全部页面内容放在这里 -->                             │   │
 * │  │     <div class="container">...</div>                             │   │
 * │  │   </div>                                                         │   │
 * │  │ </body>                                                          │   │
 * │  └──────────────────────────────────────────────────────────────────┘   │
 * │                                                                          │
 * │  ❌ 错误示例 (会导致 "找不到截图区域 #capture" 错误):                     │
 * │  ┌──────────────────────────────────────────────────────────────────┐   │
 * │  │ <body>                                                           │   │
 * │  │   <div class="container">                                        │   │
 * │  │     <!-- 没有 id="capture" 的容器！ -->                          │   │
 * │  │   </div>                                                         │   │
 * │  │ </body>                                                          │   │
 * │  └──────────────────────────────────────────────────────────────────┘   │
 * │                                                                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  2. CSS 样式要求                                                         │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                          │
 * │  为了让截图包含完整的背景、边距和边框，需要将原本 body 的样式迁移到        │
 * │  #capture 选择器上。                                                     │
 * │                                                                          │
 * │  ✅ 正确的 CSS 写法:                                                      │
 * │  ┌──────────────────────────────────────────────────────────────────┐   │
 * │  │ body {                                                           │   │
 * │  │   width: fit-content;  // 让 body 自适应内容                   │   │
 * │  │   margin: 0;                                                     │   │
 * │  │   padding: 0;                                                    │   │
 * │  │ }                                                                │   │
 * │  │                                                                  │   │
 * │  │ #capture {                                                       │   │
 * │  │   width: 800px;        // 固定宽度                             │   │
 * │  │   padding: 20px;       // 外边距                               │   │
 * │  │   background: ...;     // 背景                                │   │
 * │  │   font - family: ...;    // 字体                                 │   │
 * │  │   color: ...;          // 文字颜色                             │   │
 * │  │
 }                                                                │   │
 * │  └──────────────────────────────────────────────────────────────────┘   │
 * │                                                                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  3. Ready 信号(可选但强烈推荐)                                          │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                          │
 * │  如果页面包含图片或需要异步加载的资源，建议添加 ready 信号脚本。           │
 * │  截图模块会等待 #capture 元素出现 "ready" class 后再截图。               │
 * │                                                                          │
 * │  标准 Ready 信号脚本(复制到 </body > 前):                                │
 * │  ┌──────────────────────────────────────────────────────────────────┐   │
 * │  │ <script>                                                         │   │
 * │  │   (function () {                                                 │   │
 * │  │     const images = document.querySelectorAll('img');             │   │
 * │  │     let loadedCount = 0;                                         │   │
 * │  │     const totalImages = images.length;                           │   │
 * │  │                                                                  │   │
 * │  │     function checkAllLoaded() {                                  │   │
 * │  │       loadedCount++;                                             │   │
 * │  │       if (loadedCount >= totalImages) {                          │   │
 * │  │         document.getElementById('capture').classList.add('ready');│  │
 * │  │       }                                                          │   │
 * │  │     }                                                            │   │
 * │  │                                                                  │   │
 * │  │     if (totalImages === 0) {                                     │   │
 * │  │       document.getElementById('capture').classList.add('ready'); │   │
 * │  │     } else {                                                     │   │
 * │  │       images.forEach(img => {                                    │   │
 * │  │         if (img.complete) checkAllLoaded();                      │   │
 * │  │         else {                                                   │   │
 * │  │           img.addEventListener('load', checkAllLoaded);          │   │
 * │  │           img.addEventListener('error', checkAllLoaded);         │   │
 * │  │         }                                                        │   │
 * │  │       });                                                        │   │
 * │  │     }                                                            │   │
 * │  │                                                                  │   │
 * │  │     // 保底 3 秒超时                                               │   │
 * │  │     setTimeout(() => {                                           │   │
 * │  │       document.getElementById('capture').classList.add('ready'); │   │
 * │  │     }, 3000);                                                    │   │
 * │  │   })();                                                          │   │
 * │  │ </script>                                                        │   │
 * │  └──────────────────────────────────────────────────────────────────┘   │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  4. 调用示例                                                             │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │  在你的 App 模块中:                                                       │
 * │  ┌──────────────────────────────────────────────────────────────────┐   │
 * │  │ import puppeteer from '../../api/puppeteer-wrapper.js';          │   │
 * │  │                                                                  │   │
 * │  │ const img = await puppeteer.screenshot('your_template_name', {   │   │
 * │  │   ...yourDataObject,   // 传递给模板的数据                       │   │
 * │  │   scale: 2,            // 推荐: 高清截图 (默认1)                 │   │
 * │  │   imgType: 'png',      // 推荐: 无损清晰 (默认jpeg)             │   │
 * │  │   quality: 90          // 可选: 若用jpeg推荐90+                 │   │
 * │  │
 * │  │ });                                                              │   │
 * │  │ e.reply(img);                                                    │   │
 * │  └──────────────────────────────────────────────────────────────────┘   │
 * │                                                                          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ============================================================================
 *                              🔧 工作原理
 * ============================================================================
 *
 * 1. 调用 screenshot(name, options)
 * 2. 优先使用自定义截图引擎 (./screenshot.js)
 *    - 使用 HTML 注入技术，将模板内容直接注入浏览器
 *    - 等待 #capture 元素出现 "ready" class (最多3秒超时)
 *    - 【重要】即使 ready 超时，也会继续尝试截图，不会降级
 *    - 精确截取 #capture 区域
 * 3. 仅当截图本身失败时（如找不到#capture），才回退到 Yunzai 官方截图
 *
 * ============================================================================
 */

import { screenshot as customScreenshot, closeBrowser } from './screenshot.js';
import path from 'path';
import { pathToFileURL } from 'url';

const PLUGIN_ROOT = path.join(process.cwd(), 'plugins', 'xiuxian-emulator-plugin');
const HTML_ROOT = path.join(PLUGIN_ROOT, 'resources', 'html');
let yunzaiPuppeteer = null;

async function getYunzaiPuppeteer() {
  if (yunzaiPuppeteer) return yunzaiPuppeteer;
  const modulePath = path.join(process.cwd(), 'lib', 'puppeteer', 'puppeteer.js');
  const module = await import(pathToFileURL(modulePath).href);
  yunzaiPuppeteer = module.default || module;
  return yunzaiPuppeteer;
}

function isRecoverableCustomScreenshotError(error) {
  const message = String(error?.message || '');
  return /ProtocolError|Target closed|Session closed|Execution context was destroyed|Most likely the page has been closed|timed out/i.test(message);
}

/**
 * 统一截图接口
 *
 * 兼容原有 yunzai puppeteer.screenshot 调用方式。
 * 优先使用自定义截图引擎（支持 ready 信号等待），失败时自动回退到 Yunzai 官方截图。
 *
 * @param {string} name - 模板名称 (对应 resources/html/{name}/{name}.html)
 * @param {object} options - 选项对象
 * @param {string} [options.tplFile] - 模板文件绝对路径 (可选，不填则自动查找)
 * @param {number} [options.scale=1] - 截图缩放比例，2 为高清
 * @param {number} [options.quality=85] - JPEG 压缩质量 (1-100)
 * @param {string} [options.imgType='jpeg'] - 图片格式 'jpeg' 或 'png'
 * @param {...any} options - 其他会传递给模板引擎的数据
 * @returns {Promise<any>} 图片消息段，可直接用于 e.reply()
 *
 * @example
 * // 基础用法
 * const img = await puppeteer.screenshot('player', { player, najie, equipment });
 * e.reply(img);
 *
 * @example
 * // 高清模式 (与练气/纳戒一致的效果)
 * const img = await puppeteer.screenshot('tiandibang_shop', { ...data, scale: 2, imgType: 'png' });
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
    if (isRecoverableCustomScreenshotError(error)) {
      console.warn(`[PuppeteerWrapper] 自定义截图遇到可恢复异常，重置浏览器后重试: ${error.message}`);
      await closeBrowser().catch(() => { });

      try {
        return await customScreenshot(name, options);
      } catch (retryError) {
        console.warn(`[PuppeteerWrapper] 自定义截图重试失败，准备回退yunzai: ${retryError.message}`);
        error = retryError;
      }
    }

    console.warn(`[PuppeteerWrapper] 自定义截图失败，回退yunzai: ${error.message}`);

    // 回退到yunzai官方截图
    try {
      const fallbackPuppeteer = await getYunzaiPuppeteer();
      return await fallbackPuppeteer.screenshot(name, options);
    } catch (fallbackError) {
      console.error(`[PuppeteerWrapper] yunzai截图也失败: ${fallbackError.message}`);
      throw fallbackError;
    }
  }
}

/**
 * 使用 Yunzai 原生截图 (不等待 ready 信号)
 *
 * 适用于不需要自定义截图特性的场景，或当自定义截图有兼容问题时使用。
 *
 * @param {string} name - 模板名称
 * @param {object} options - 选项对象
 * @returns {Promise<any>} 图片消息段
 */
async function screenshotLegacy(name, options = {}) {
  const fallbackPuppeteer = await getYunzaiPuppeteer();
  return await fallbackPuppeteer.screenshot(name, options);
}

// 导出兼容yunzai的接口
export default {
  screenshot,
  screenshotLegacy,
  closeBrowser
};

export { screenshot, screenshotLegacy, closeBrowser };
