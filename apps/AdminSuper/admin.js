import plugin from '../../../../lib/plugins/plugin.js';
import { createRequire } from 'module';
import lodash from 'lodash';

const require = createRequire(import.meta.url);
const { exec, execSync } = require('child_process');
const _path = process.cwd();
let timer;

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
    this.key = 'xiuxian:restart';
  }

  async getcommitId(pluginPath) {
    const cm = `git -C ${pluginPath} rev-parse --short HEAD`;
    let commitId = execSync(cm, { encoding: 'utf-8' });
    return lodash.trim(commitId);
  }

  // 【新增】获取当前分支名称的函数
  async getCurrentBranch(pluginPath) {
    const cm = `git -C ${pluginPath} rev-parse --abbrev-ref HEAD`;
    let branch = execSync(cm, { encoding: 'utf-8' });
    return lodash.trim(branch);
  }

  /**
   * 更新插件
   * @param {import('trss-yunzai').EventData} e 云崽事件对象
   * @returns {Promise<boolean>}
   */
  async checkout() {
    if (!this.e.isMaster) {
      return;
    }
    const pluginPath = `${_path}/plugins/xiuxian-emulator-plugin/`;
    let oldCommitId = await this.getcommitId(pluginPath);
    const isForce = this.e.msg.includes('强制');
    let command = 'git pull';

    if (isForce) {
      // 【核心修改】先获取当前分支，再拼接指令
      const branch = await this.getCurrentBranch(pluginPath);
      this.e.reply(`检测到当前分支为 [${branch}]，正在进行强制更新，请稍等...`);
      command = `git fetch --all && git reset --hard origin/${branch} && git pull`;
    } else {
      this.e.reply('修仙插件更新中，请稍等...');
    }

    const that = this;
    exec(
      command,
      { cwd: pluginPath },
      function(error, stdout, stderr) {
        // ... 后续的重启逻辑保持不变 ...
        if (/(Already up[ -]to[ -]date|已经是最新的)/.test(stdout)) {
          that.e.reply('目前已经是最新版修仙插件了~');
          return;
        }
        if (error) {
          that.e.reply(`修仙插件更新失败！\nError code: ${error.code}\n${error.stack}\n 请稍后重试。`);
          return;
        }

        const cm = `git log -20 --oneline --pretty=format:"%h||[%cd]  %s" --date=format:"%m-%d %H:%M"`;
        const logAll = execSync(cm, { cwd: pluginPath, encoding: 'utf-8' }).split('\n');
        let log = [];
        for (let str of logAll) {
          const parts = str.split('||');
          if (parts[0] === oldCommitId) break;
          if (parts[1] && parts[1].includes('Merge branch')) continue;
          log.push(parts[1]);
        }

        const logMsg = log.length > 0 ? `共${log.length}条更新日志：\n\n${log.join('\n')}` : '无新的变更日志。';
        that.e.reply(`修仙插件更新成功!\n${logMsg}\n\n正在尝试重新启动Yunzai以应用更新...`);

        timer && clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            let data = JSON.stringify({
              isGroup: !!that.e.isGroup,
              id: that.e.isGroup ? that.e.group_id : that.e.user_id
            });
            await redis.set(that.key, data, { EX: 120 });
            let cm = 'npm run start';
            if (process.argv[1].includes('pm2')) {
              cm = 'npm run restart';
            } else {
              await that.e.reply('当前为前台运行，重启将转为后台...');
            }
            exec(cm, (err, stdout, stderr) => {
              if (err) {
                redis.del(that.key);
                that.e.reply(`自动重启失败，请手动重启。\nError code: ${err.code}\n${err.stack}`);
                logger.error(`重启失败\n${err.stack}`);
              } else if (stdout) {
                logger.mark('重启成功，运行已转为后台');
                process.exit();
              }
            });
          } catch (err) {
            redis.del(that.key);
            that.e.reply(`重启云崽操作失败！\n${err.stack ?? err}`);
          }
        }, 1000);
      }
    );
    return true;
  }
}