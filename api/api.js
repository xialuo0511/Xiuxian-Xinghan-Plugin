import plugin from '../../../lib/plugins/plugin.js';
import common from '../../../lib/common/common.js';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';

import fs from 'fs';
import path from 'path';

import config from '../model/Config.js';
import data from '../model/XiuxianData.js';
import Show from '../model/show.js';
import { __PATH } from '../apps/Xiuxian/xiuxian.js';

export const verc = ({ e }) => {
  return true;
};
export { plugin, common, puppeteer, data, config, Show };

//创建连接
import { createRequire } from "module"
const require = createRequire(import.meta.url)
var mysql = require('mysql');
let databaseConfigData = config.getConfig("database", "database");
const db = mysql.createPool({
  host: 'localhost',
  user: databaseConfigData.Database.username,
  password: databaseConfigData.Database.password,
  database: 'xiuxiandatabase'
})

//检查存档是否存在，存在返回true;
export async function existplayer(usr_qq) {
  let exist_player;
  exist_player = fs.existsSync(`${__PATH.player_path}/${usr_qq}.json`);
  if (exist_player) {
    return true;
  }
  return false;
}

export async function Gulid(usr_qq) {
  const dir = path.join(`${__PATH.Gulid_path}/Gulid.json`);
  const logfile = fs.readFileSync(dir, 'utf8');
  if (!logfile) {
    return;
  }
  const allRecords = JSON.parse(logfile);
  if (usr_qq.length >= 16) {
    for (let record of allRecords) {
      if (record.频道_ID == usr_qq) {
        usr_qq = record.QQ_ID; // 使用存档的 usr_qq
        let ifexistplay = data.existData("player", usr_qq);
        if (!ifexistplay) {
          usr_qq = record.频道_ID; // 使用存档的 usr_qq
        }
        break;
      }
    }
  } else {
    for (let record of allRecords) {
      if (record.频道_ID == usr_qq) {
        usr_qq = record.QQ_ID; // 使用存档的 usr_qq
        let ifexistplay = data.existData("player", usr_qq);
        if (!ifexistplay) {
          usr_qq = record.频道_ID; // 使用存档的 usr_qq
        }
        break;
      }
    }
  }
  return usr_qq; // 返回转换后的 usr_qq 值
}

export async function Gulid2(usr_qq) {
  const dir = path.join(`${__PATH.Gulid_path}/Gulid.json`);
  const logfile = fs.readFileSync(dir, 'utf8');
  const allRecords = JSON.parse(logfile);
  if (usr_qq.length < 16) {
    for (let record of allRecords) {
      if (record.QQ_ID == usr_qq) {
        usr_qq = record.频道_ID; // 使用存档的 usr_qq
        let ifexistplay = data.existData("player", usr_qq);
        if (!ifexistplay) {
          usr_qq = record.QQ_ID; // 使用存档的 usr_qq
        }
        break;
      }
    }
  }
  return usr_qq; // 返回转换后的 usr_qq 值
}

export async function Read_Gulid() {
  let dir = path.join(`${__PATH.Gulid_path}/Gulid.json`);
  let Gulid = fs.readFileSync(dir, 'utf8', (err, data) => {
    if (err) {
      console.log(err);
      return 'error';
    }
    return data;
  });
  //将字符串数据转变成数组格式
  Gulid = JSON.parse(Gulid);
  return Gulid;
}

export async function Write_Gulid(Gulid) {
  let dir = path.join(`${__PATH.Gulid_path}/Gulid.json`);
  let new_ARR = JSON.stringify(Gulid, '', '\t');
  fs.writeFileSync(dir, new_ARR, 'utf8', err => {
    console.log('写入成功', err);
  });
  return;
}

export async function sql_run(query) {
  return new Promise((resolve, reject) => {
    db.query(query, (err, result) => {
      if (err) {
        reject(err)
      }
      resolve(result)
    });
  });
}

export async function fstadd_Gulid(A, B, key) {
  let Gulid;
  try {
    Gulid = await Read_Gulid();
  } catch {
    //没有表要先建立一个！
    await Write_Gulid([]);
    Gulid = await Read_Gulid();
  }
  let pd = false
  var i = A;
  var l = 0;
  while (i >= 1) {
    i = i / 10;
    l++;
  }
  if (l > 10) {//判断是否为频道19位id
    pd = true
  }
  let player = ''
  if (pd) {
    player = {
      QQ_ID: B,
      频道_ID: A,
      密钥: key,
    };
  } else {
    player = {
      QQ_ID: A,
      频道_ID: B,
      密钥: key,
    };
  }
  if (player == '') {
    console.log("出现错误!!!!:设置绑定请求出现错误")
    return
  }
  Gulid.push(player);
  await Write_Gulid(Gulid);
  return;
}