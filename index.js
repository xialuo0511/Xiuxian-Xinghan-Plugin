// /index.js

import fs from "node:fs";
import { fork } from 'child_process';
import path from 'path';
import Config from "./model/Config.js";
import chalk from 'chalk';

// --- [保留] 启动日志逻辑 ---
const versionData = Config.getdefSet("version", "version");
logger.info(`__________________________`);
logger.info(chalk.yellow(`【星瀚修仙】${versionData[0].version}「${versionData[0].name}」初始化`));
logger.info(`__________________________`);

// --- [新增] 后台工作进程管理器 ---

const __dirname = path.resolve();
const pluginRoot = path.join(__dirname, 'plugins', 'xiuxian-emulator-plugin');
const workerPath = path.join(pluginRoot, 'workers');

// [修正] 这里是关键的修复：定义需要启动的后台进程列表
const workersToStart = [
    {
        name: 'Xinghan-Scheduler', // 调度器进程名
        file: 'scheduler.js'      // 对应的文件名
    },
    {
        name: 'Xinghan-Worker',    // 工作单元进程名
        file: 'worker.js'         // 对应的文件名
    }
];

/**
 * 启动并守护一个工作子进程
 * @param {object} workerInfo 进程信息 { name, file }
 */
function startWorker(workerInfo) {
    const fullPath = path.join(workerPath, workerInfo.file);

    if (!fs.existsSync(fullPath)) {
        logger.warn(chalk.yellow(`[星瀚修仙] 后台进程文件不存在，跳过启动: ${workerInfo.file}`));
        return;
    }

    const child = fork(fullPath, [], {
        stdio: 'inherit' // 让子进程的日志直接输出到Yunzai主控制台
    });

    logger.info(chalk.green(`[星瀚修仙] 后台进程 [${workerInfo.name}] 已启动。`));

    child.on('close', (code) => {
        if (code !== 0) {
            logger.warn(chalk.red(`[星瀚修仙] 后台进程 [${workerInfo.name}] 异常退出，退出码 ${code}。将在5秒后尝试重启...`));
            setTimeout(() => startWorker(workerInfo), 5000); // 5秒后重启
        } else {
            logger.info(chalk.blue(`[星瀚修仙] 后台进程 [${workerInfo.name}] 已正常关闭。`));
        }
    });

    child.on('error', (err) => {
        logger.error(chalk.red(`[星瀚修仙] 启动后台进程 [${workerInfo.name}] 失败: ${err}`));
    });
}

// 遍历并启动所有定义的后台进程
workersToStart.forEach(startWorker);


// --- [保留并整合] 您现有的动态模块加载逻辑 ---
let apps = {};
const appsPath = path.join(pluginRoot, "apps");

(async () => {
    try {
        const mainDirs = fs.readdirSync(appsPath).filter(file => {
            const stat = fs.statSync(path.join(appsPath, file));
            return stat.isDirectory();
        });

        const allDirs = ["", ...mainDirs]; // 包含根目录 ""

        for (const dir of allDirs) {
            const currentPath = path.join(appsPath, dir);
            const files = fs.readdirSync(currentPath).filter((file) => file.endsWith(".js"));

            for (const file of files) {
                const name = file.replace(".js", "");
                // 使用 file:// 协议来确保在 Windows 和 Linux 上的兼容性
                const modulePath = `file://${path.join(currentPath, file)}`;
                try {
                    const module = await import(modulePath);
                    if (module[name]) {
                        apps[name] = module[name];
                    }
                } catch (importError) {
                    logger.error(chalk.red(`[星瀚修仙] 导入模块失败: ${modulePath}`), importError);
                }
            }
        }
        logger.info(chalk.green('[星瀚修仙] 所有功能模块加载完毕。'));
    } catch (error) {
        logger.error(chalk.red('[星瀚修仙] 加载功能模块时出现错误:'), error);
    }
})();

// 导出
export { apps };