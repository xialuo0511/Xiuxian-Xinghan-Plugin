import plugin from '../../../../lib/plugins/plugin.js';
import { createRequire } from 'module';
import { promisify } from 'util';
import lodash from 'lodash';

const require = createRequire(import.meta.url);
const { exec, execSync } = require('child_process');
const execAsync = promisify(exec);

const pluginPath = `${process.cwd()}/plugins/xiuxian-emulator-plugin/`;
let updating = false;

// 尝试导入重启模块
let Restart = null;
try {
  Restart = (await import('../../other/restart.js').catch(() => null))?.Restart;
  Restart ||= (await import('../../system/apps/restart.ts').catch(() => null))?.Restart;
} catch {
  logger.warn('[修仙插件] 未获取到重启模块，更新后需手动重启');
}

export class admin extends plugin {
  constructor() {
    super({
      name: '管理|更新插件',
      dsc: '管理和更新代码',
      event: 'message',
      priority: 400,
      rule: [
        {
          reg: '^#修仙(插件)?(强制)?更新',
          fnc: 'update'
        }
      ]
    });
    this.key = 'xiuxian:restart';
  }

  /** 获取 commit ID */
  async getCommitId() {
    const cm = `git -C ${pluginPath} rev-parse --short HEAD`;
    let commitId = execSync(cm, { encoding: 'utf-8' });
    return lodash.trim(commitId);
  }

  /** 获取当前分支名称 */
  async getCurrentBranch() {
    const cm = `git -C ${pluginPath} rev-parse --abbrev-ref HEAD`;
    let branch = execSync(cm, { encoding: 'utf-8' });
    return lodash.trim(branch);
  }

  /** 更新插件 */
  async update(e) {
    // 检查是否为管理员
    if (!e.isMaster) {
      await e.reply('只有管理员才能更新插件哦~');
      return false;
    }

    // 检查是否正在更新中
    if (updating) {
      await e.reply('已有更新任务进行中，请稍候...');
      return false;
    }

    const isForce = e.msg.includes('强制');

    if (isForce) {
      await e.reply('正在执行强制更新，请稍候...');
    } else {
      await e.reply('正在检查更新，请稍候...');
    }

    updating = true;
    let needRestart = false;

    try {
      // 记录旧的 commit ID 用于获取更新日志
      const oldCommitId = await this.getCommitId();

      // 构建更新命令
      let command = 'git pull --no-rebase';
      if (isForce) {
        const branch = await this.getCurrentBranch();
        command = `git fetch --all && git reset --hard origin/${branch}`;
      }

      // 执行 git pull
      const { stdout, stderr } = await execAsync(command, {
        cwd: pluginPath
      });

      let msg = '【修仙插件更新】\n';

      if (stdout.includes('Already up to date') || stdout.includes('已经是最新')) {
        msg += '✅ 当前已是最新版本';
        await e.reply(msg);
      } else {
        msg += '✅ 更新成功！\n';

        // 提取更新信息
        const filesChanged = stdout.match(/(\d+) files? changed/);
        if (filesChanged) {
          msg += `📦 更新了 ${filesChanged[1]} 个文件\n`;
        }

        // 获取更新日志
        try {
          const logCm = `git log -20 --oneline --pretty=format:"%h||[%cd]  %s" --date=format:"%m-%d %H:%M"`;
          const logAll = execSync(logCm, { cwd: pluginPath, encoding: 'utf-8' }).split('\n');
          let log = [];
          for (let str of logAll) {
            const parts = str.split('||');
            if (parts[0] === oldCommitId) break;
            if (parts[1] && parts[1].includes('Merge branch')) continue;
            log.push(parts[1]);
          }
          if (log.length > 0) {
            msg += `\n📋 更新日志 (共${log.length}条)：\n${log.slice(0, 5).join('\n')}`;
            if (log.length > 5) msg += `\n...还有${log.length - 5}条`;
            msg += '\n';
          }
        } catch (logErr) {
          // 获取日志失败不影响更新
        }

        // 检查是否有依赖更新
        if (stdout.includes('package.json')) {
          msg += '\n⚠️ 检测到依赖更新，正在安装...\n';
          try {
            await execAsync('pnpm install', { cwd: pluginPath });
            msg += '✅ 依赖安装完成\n';
          } catch (installErr) {
            msg += '❌ 依赖安装失败，请手动执行 pnpm install\n';
          }
        }

        needRestart = true;

        if (Restart) {
          msg += '\n🔄 即将自动重启...';
        } else {
          msg += '\n💡 请手动重启 Yunzai 以应用更新';
        }

        await e.reply(msg);
      }
    } catch (err) {
      logger.error('[修仙插件] 更新失败:', err);
      await e.reply(`❌ 更新失败: ${err.message}`);
    } finally {
      updating = false;
    }

    // 需要重启且有重启模块
    if (needRestart && Restart) {
      setTimeout(() => {
        new Restart(e).restart();
      }, 2000);
    }

    return true;
  }
}
