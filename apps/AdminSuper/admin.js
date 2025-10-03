import plugin from '../../../../lib/plugins/plugin.js';
import { createRequire } from 'module';
import lodash from 'lodash';
import loader from '../../../../lib/plugins/loader.js';

/**
 * 全局
 */
const require = createRequire(import.meta.url);
const { exec, execSync } = require('child_process');
const _path = process.cwd();

/**
 * 管理员
 */
export class admin extends plugin {
  constructor() {
    super({
      name: '管理|更新插件',
      dsc: '管理和更新代码',
      event: 'message',
      priority: 400,
      rule: [
        {
          reg: '^(#)修仙(插件)?(强制)?更新',
          fnc: 'checkout'
        }
      ]
    });
  }

  async log() {
    if (!this.e.isMaster) return;
    let log_data = await redis.get('xiuxian:log');
    if (!log_data) {
      log_data = 0;
    }
    if (log_data == '0') {
      this.e.reply('已为您开启了日志输出，便于监测玩家数据是否异常');
      await redis.set('xiuxian:log', 1);
    } else {
      this.e.reply('已为您关闭了日志输出，减少机器压力:)');
      await redis.set('xiuxian:log', 0);
    }
  }

  async getcommitId(plugin = '') {
    let cm = 'git rev-parse --short HEAD';
    if (plugin) {
      cm = `git -C ./plugins/xiuxian-emulator-plugin/ rev-parse --short HEAD`;
    }
    let commitId = execSync(cm, { encoding: 'utf-8' });
    commitId = lodash.trim(commitId);
    return commitId;
  }

  async checkout() {
    if (!this.e.isMaster) return;

    let oldCommitId = await this.getcommitId('xiuxian-emulator-plugin'); // 明确指定插件
    const isForce = this.e.msg.includes('强制');
    let command = 'git pull';
    if (isForce) {
      command = 'git fetch --all && git reset --hard origin/main && git pull';
      this.e.reply('修仙插件强制更新中，请稍等...');
    } else {
      this.e.reply('修仙插件更新中，请稍等...');
    }

    const that = this;
    exec(
      command,
      { cwd: `${_path}/plugins/xiuxian-emulator-plugin/` },
      async function(error, stdout, stderr) {
        if (/(Already up[ -]to[ -]date|已经是最新的)/.test(stdout)) {
          that.e.reply('目前已经是最新版修仙插件了~');
          return;
        }
        if (error) {
          that.e.reply(`修仙插件更新失败！\nError code: ${error.code}\n${error.stack}\n 请稍后重试。`);
          return;
        }

        let log = '获取日志失败';
        try {
          const cm = `cd ./plugins/xiuxian-emulator-plugin/ && git log -20 --oneline --pretty=format:"%h||[%cd]  %s" --date=format:"%m-%d %H:%M"`;
          const logAll = execSync(cm, { encoding: 'utf-8' }).split('\n');
          const logArr = [];
          for (let str of logAll) {
            const parts = str.split('||');
            if (parts[0] === oldCommitId) break;
            if (parts[1] && parts[1].includes('Merge branch')) continue;
            logArr.push(parts[1]);
          }
          if (logArr.length > 0) {
            log = `共${logArr.length}条日志：\n\n${logArr.join('\n')}`;
          } else {
            log = '无新的变更日志。';
          }
        } catch (logError) {
          logger.error('获取更新日志失败:', logError);
        }

        let replyMsg = `修仙插件代码更新成功！\n${log}\n\n`;

        try {
          await that.e.reply(replyMsg + '正在刷新所有插件以应用更新，请稍候...');
          // 调用加载器的 load(true) 方法，true代表刷新
          await loader.load(true);
          await that.e.reply('所有插件刷新完毕，新版修仙插件已成功应用！');
        } catch (reloadError) {
          logger.error('刷新插件失败:', reloadError);
          await that.e.reply('插件刷新失败，Bot可能处于不稳定状态，建议手动重启。');
        }
      }
    );
    return true;
  }
}