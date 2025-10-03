// admin.js (已修改为热更新版本)

import plugin from '../../../../lib/plugins/plugin.js';
import { createRequire } from 'module';
import lodash from 'lodash';

/**
 * 全局
 */
const require = createRequire(import.meta.url);
const { exec, execSync } = require('child_process');
const _path = process.cwd();

// let timer // 不再需要定时器

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
          reg: '^#修仙(插件)?(强制)?更新',
          fnc: 'checkout'
        }
      ]
    });
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
    if (!this.e.isMaster) {
      return;
    }
    let oldCommitId = await this.getcommitId(plugin);
    const isForce = this.e.msg.includes('强制');
    let command = 'git pull';
    if (isForce) {
      command = 'git fetch --all && git reset --hard origin/main && git pull'; // 建议使用 origin/main 或 origin/master
      this.e.reply('修仙插件强制更新中，请稍等');
    } else {
      this.e.reply('修仙插件更新中，请稍等');
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
          that.e.reply(
            '修仙插件更新失败！\nError code: ' +
            error.code +
            '\n' +
            error.stack +
            '\n 请稍后重试。'
          );
          return;
        }
        let cm = 'git log -20 --oneline --pretty=format:"%h||[%cd]  %s" --date=format:"%m-%d %H:%M"';
        if (plugin) {
          cm = `cd ./plugins/xiuxian-emulator-plugin/ && ${cm}`;
        }
        let logAll;
        try {
          logAll = execSync(cm, { encoding: 'utf-8' });
        } catch (error) {
          that.e.reply(error.toString(), true);
        }
        if (!logAll) return false;
        logAll = logAll.split('\n');
        let log = [];

        for (let str of logAll) {
          str = str.split('||');
          if (str[0] === oldCommitId) break;
          if (str[1].includes('Merge branch')) continue;
          log.push(str[1]);
        }
        let line = log.length;
        log = log.join('\n');
        if (log.length <= 0) {
          log = '无变更日志';
        }

        const pluginName = 'xiuxian-emulator-plugin';
        let replyMsg = `修仙插件更新成功!共${line}条日志：\n\n${log}\n\n`;

        try {
          // 调用Yunzai的插件重载方法
          const result = await Bot.plugins.reload(pluginName);
          if (result) {
            replyMsg += `插件 [${pluginName}] 热重载成功，新功能已应用！`;
          } else {
            replyMsg += `插件 [${pluginName}] 不存在或重载失败，请查看后台日志。`;
          }
        } catch (error) {
          logger.error(`热重载插件 [${pluginName}] 失败:`, error);
          replyMsg += `插件 [${pluginName}] 热重载失败，请手动重启以应用更新。\n错误信息: ${error.message}`;
        }

        await that.e.reply(replyMsg);
      }
    );
    return true;
  }
}