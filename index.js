import fs from 'node:fs';
import { fork } from 'child_process';
import path from 'path';
import Config from './model/Config.js';
import chalk from 'chalk';

// --- 启动日志 ---
const versionData = Config.getdefSet('version', 'version');
logger.info(`__________________________`);
logger.info(chalk.yellow(`【星瀚修仙】${versionData[0].version}「${versionData[0].name}」初始化`));

// --- 后台工作进程管理器 ---
const __dirname = path.resolve();
const pluginRoot = path.join(__dirname, 'plugins', 'xiuxian-emulator-plugin');
const workerPath = path.join(pluginRoot, 'workers');

const workersToStart = [
  { name: 'Xinghan-Scheduler', file: 'scheduler.js' },
  { name: 'Xinghan-Worker', file: 'worker.js' }
];

function startWorker(workerInfo) {
  const fullPath = path.join(workerPath, workerInfo.file);
  if (!fs.existsSync(fullPath)) {
    logger.warn(chalk.yellow(`[星瀚修仙] 后台进程文件不存在，跳过启动: ${workerInfo.file}`));
    return;
  }
  const child = fork(fullPath, [], { stdio: 'inherit' });
  logger.info(chalk.green(`[星瀚修仙] 后台进程 [${workerInfo.name}] 已启动。`));
  child.on('close', (code) => {
    if (code !== 0) {
      logger.warn(chalk.red(`[星瀚修仙] 后台进程 [${workerInfo.name}] 异常退出，退出码 ${code}。将在5秒后尝试重启...`));
      setTimeout(() => startWorker(workerInfo), 5000);
    } else {
      logger.info(chalk.blue(`[星瀚修仙] 后台进程 [${workerInfo.name}] 已正常关闭。`));
    }
  });
  child.on('error', (err) => {
    logger.error(chalk.red(`[星瀚修仙] 启动后台进程 [${workerInfo.name}] 失败: ${err}`));
  });
}

workersToStart.forEach(startWorker);

logger.info(`__________________________`);

// --- 动态模块加载 ---
const apps = {};
const appsPath = path.join(pluginRoot, 'apps');

// [修正] 移除 (async () => { ... })(); 包裹，直接在顶层使用 await
// 这将强制程序等待所有模块加载完毕后再继续
try {
  const mainDirs = fs.readdirSync(appsPath).filter(file => {
    const stat = fs.statSync(path.join(appsPath, file));
    return stat.isDirectory();
  });
  const allDirs = ['',
    ...mainDirs];
  for (const dir of allDirs) {
    const currentPath = path.join(appsPath, dir);
    const files = fs.readdirSync(currentPath).filter((file) => file.endsWith('.js'));
    for (const file of files) {
      const name = file.replace('.js', '');
      const modulePath = `file://${path.join(currentPath, file).replace(/\\/g, '/')}`;
      try {
        // [修正] 直接在顶层 await，确保加载完成
        const module = await import(modulePath);
        if (module[name]) {
          apps[name] = module[name];
        }
      } catch (importError) {
        logger.warn(chalk.red(`[星瀚修仙] 导入模块失败: ${modulePath}`), importError);
      }
    }
  }
  logger.info(chalk.green('[星瀚修仙] 所有功能模块加载完毕。'));
} catch (error) {
  logger.error(chalk.red('[星瀚修仙] 加载功能模块时出现错误:'), error);
}

// [修正] 现在，当执行到这里时，apps 对象已经是完全填充好的了
export { apps };