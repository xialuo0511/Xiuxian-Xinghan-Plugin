import plugin from '../../../../lib/plugins/plugin.js'
import { createRequire } from "module"
import config from "../../model/Config.js"
import fs from "fs"


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
export class XiuxianDatabase extends plugin {
    constructor() {
        super({
            name: "数据库操作",
            dsc: "数据库操作",
            event: "message",
            priority: 400,
            rule: [
                {
                    reg: '^#初始化数据库$',
                    fnc: 'chushihua',
                }
            ],
        });
        this.databaseConfigData = config.getConfig("database", "database");
    }

    async chushihua(e) {
        if (!this.e.isMaster) {
            return;
        }
        var mysql = require('mysql');
        //创建连接
        const db = mysql.createPool({
            host: 'localhost',
            user: this.databaseConfigData.Database.username,
            password: this.databaseConfigData.Database.password
        })
        // //connect 连接数据库
        // db.connect(err => {
        //     if (err) throw err;
        //     e.reply('mysql connected ......')
        // })
        //创建数据库
        let sql = 'CREATE DATABASE if not exists xiuxiandatabase'
        db.query(sql, (err, result) => {
            if (err) throw err
            e.reply("初始化数据库完成")
        })
        const db1 = mysql.createPool({
            host: 'localhost',
            user: this.databaseConfigData.Database.username,
            password: this.databaseConfigData.Database.password,
            database: 'xiuxiandatabase'
        })


        let sql1 = 'create table if not exists fuzhi(usr_id bigint,occupation text,occupation_exp bigint,occupation_level bigint,PRIMARY KEY(usr_id))'
        db1.query(sql1, (err, result) => {
            if (err) throw err
            e.reply("初始化数据表1完成")
        })

        let sql2 = 'create table if not exists action(usr_id bigint,action text,end_time bigint,time bigint,group_id bigint,action_zhiye int default 0,action_zhiye_1 int default 0,action_zhiye_2 int default 0,action_zhiye_3 int default 0,action_zhiye_4 int default 0,action_zhiye_5 int default 0,action_zhiye_6 int default 0,action_biguan int default 0,action_xiangyao int default 0,action_mijing int default 0,action_chengmi int default 0,Place_address text,PRIMARY KEY(usr_id))'
        db1.query(sql2, (err, result) => {
            if (err) throw err
            e.reply("初始化数据表2完成")
        })

        let sql3 = 'create table if not exists tiandibang(usr_id bigint,cishu bigint,jifen bigint,all_cishu bigint,last_time bigint,the_best_jifen bigint,PRIMARY KEY(usr_id))'
        db1.query(sql3, (err, result) => {
            if (err) throw err
            e.reply("初始化数据表3完成")
        })

        let sql4 = 'alter table action add Place_address text not null'
        db1.query(sql4, (err, result) => {
            if (err) throw err
            e.reply("数据表2添加字段完成完成")
        })

        return;
    }
}
