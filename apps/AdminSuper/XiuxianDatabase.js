import plugin from '../../../../lib/plugins/plugin.js'
import { createRequire } from "module"
import config from "../../model/Config.js"
import mysql from "mysql"
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
        e.reply('test')
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
        let sql = 'CREATE DATABASE XiuxianDatabase'
        db.query(sql, (err, result) => {
            if (err) throw err
            e.reply('创建库成功')
        })

        let sql1 = 'create table if not exists fuzhi(usr_id bigint,content text,PRIMARY KEY(id))'
        db.query(sql1, (err, result) => {
            if (!err) {
                e.reply('创建表成功')
            }
        })


        return;
    }
}
