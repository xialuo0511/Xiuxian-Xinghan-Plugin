import plugin from '../../../../lib/plugins/plugin.js'
import { createRequire } from "module"
import lodash from 'lodash'

/**
 * 全局
 */
const require = createRequire(import.meta.url)
const { exec, execSync } = require("child_process")
const _path = process.cwd()
let timer

/**
 * 管理员
 */
export class admin extends plugin {
    constructor() {
        super({
            name: "管理|更新插件",
            dsc: "管理和更新代码",
            event: "message",
            priority: 400,
            rule: [
                {
                    reg: "^#修仙(插件)?(强制)?更新",
                    fnc: "checkout",
                },
                {
                    reg: "^#切换日志输出状态",
                    fnc: "log",
                }
            ],
        });
        this.key = "xiuxian:restart";
    }

    async log() {
        if (!this.e.isMaster) {
            return;
        }
        let log_data = await redis.get("xiuxian:log")
        if (!log_data) {
            log_data = 0
        }
        if (log_data == "0") {
            this.e.reply("已为您开启了日志输出，便于监测玩家数据是否异常")
            await redis.set("xiuxian:log", 1)
            return;
        } else {
            this.e.reply("已为您关闭了日志输出，减少机器压力:)")
            await redis.set("xiuxian:log", 0)
            return;
        }
    }

    async getcommitId(plugin = '') {
        let cm = 'git rev-parse --short HEAD'
        if (plugin) { cm = `git -C ./plugins/xiuxian-emulator-plugin/ rev-parse --short HEAD` }
        let commitId = execSync(cm, { encoding: 'utf-8' })
        commitId = lodash.trim(commitId)
        return commitId
    }

    async checkout() {
        if (!this.e.isMaster) {
            return;
        }
        let oldCommitId = await this.getcommitId(plugin)
        const isForce = this.e.msg.includes("强制");
        let command = "git  pull";
        if (isForce) {
            command = "git fetch --all && git reset --hard dev && git  pull";
            this.e.reply("修仙插件强制更新中，请稍等");
        } else {
            this.e.reply("修仙插件更新中，请稍等");
        }
        const that = this;
        exec(
            command,
            { cwd: `${_path}/plugins/xiuxian-emulator-plugin/` },
            function (error, stdout, stderr) {
                if (/(Already up[ -]to[ -]date|已经是最新的)/.test(stdout)) {
                    that.e.reply("目前已经是最新版修仙插件了~");
                    return;
                }
                if (error) {
                    that.e.reply(
                        "修仙插件更新失败！\nError code: " +
                        error.code +
                        "\n" +
                        error.stack +
                        "\n 请稍后重试。"
                    );
                    return;
                }
                let cm = 'git log  -20 --oneline --pretty=format:"%h||[%cd]  %s" --date=format:"%m-%d %H:%M"'
                if (plugin) { cm = `cd ./plugins/xiuxian-emulator-plugin/ && ${cm}` }
                let logAll
                try { logAll = execSync(cm, { encoding: 'utf-8' }) } catch (error) { that.e.reply(error.toString(), true) }
                if (!logAll) return false
                logAll = logAll.split('\n')
                let log = []

                for (let str of logAll) {
                    str = str.split('||')
                    if (str[0] === oldCommitId) break
                    if (str[1].includes('Merge branch')) continue
                    log.push(str[1])
                }
                let line = log.length
                log = log.join('\n')
                if (log.length <= 0) return ''
                that.e.reply(`修仙插件更新成功!更新日志如下，共${line}条：\n\n${log}\n\n正在尝试重新启动Yunzai以应用更新...`);
                timer && clearTimeout(timer);
                timer = setTimeout(async () => {
                    try {
                        let data = JSON.stringify({
                            isGroup: !!that.e.isGroup,
                            id: that.e.isGroup ? that.e.group_id : that.e.user_id,
                        });
                        await redis.set(that.key, data, { EX: 120 });
                        let cm = "npm run start";
                        if (process.argv[1].includes("pm2")) {
                            cm = "npm run restart";
                        } else {
                            await that.e.reply("当前为前台运行，重启将转为后台...");
                        }
                        exec(cm, (error, stdout, stderr) => {
                            if (error) {
                                redis.del(that.key);
                                that.e.reply(
                                    "自动重启失败，请手动重启以应用新版修仙插件。\nError code: " +
                                    error.code +
                                    "\n" +
                                    error.stack +
                                    "\n"
                                );
                                logger.error(`重启失败\n${error.stack}`);
                            } else if (stdout) {
                                that.e.reply("重启成功，新版修仙插件已应用");
                                logger.mark("重启成功，运行已转为后台");
                                logger.mark("查看日志请用命令：npm run log 或 pnpm run log");
                                logger.mark("停止后台运行命令：npm stop 或 pnpm stop");
                                process.exit();
                            }
                        });
                    } catch (error) {
                        redis.del(this.key);
                        let e = error.stack ?? error;
                        that.e.reply(`重启云崽操作失败！\n${e}`);
                    }
                }, 1000);
            }
        );
        return true;
    }
}
