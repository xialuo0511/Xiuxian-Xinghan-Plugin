<p align="center">
  <h1 align="center">✨ 星瀚修仙 v3.0.0 ✨</h1>
  <h3 align="center">【一竿风月共听潮】</h3>
  <p align="center">基于 Yunzai-Bot 的高性能群聊修仙文字游戏插件</p>
</p>

<p align="center">
  <a href="https://gitee.com/xialuo03/xiuxian-emulator-plugin">
    <img src="https://img.shields.io/badge/Gitee-xiuxian--emulator--plugin-C71D23?style=flat-square&logo=gitee" alt="Gitee">
  </a>
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/Redis-5.0+-DC382D?style=flat-square&logo=redis" alt="Redis">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License">
</p>

---

## 📖 项目简介

**星瀚修仙**是一款专为 QQ 群聊设计的沉浸式修仙文字游戏插件，玩家通过发送指令在群内进行修炼、战斗、社交等多样化互动，体验从凡人到仙人的完整修仙之旅。

### 🎯 核心特色

- 🧘 **放置修仙系统** - 闭关打坐积累修为，历经天劫突破境界
- ⚔️ **丰富战斗体验** - PVP 切磋、PVE 秘境副本、世界 BOSS 挑战
- 🏛️ **深度社交生态** - 宗门系统、结义系统、伴侣系统、师徒系统
- 💰 **完善经济系统** - 自由交易、拍卖行、多种商店
- 🔧 **职业玩法** - 炼丹师、炼器师等特色职业
- 🌌 **异界探索** - 独立的异界玩法系统

---

## 🏗️ 技术架构

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                       Yunzai-Bot 框架                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  指令处理层  │──▶│   逻辑层    │──▶│    数据模型层     │  │
│  │   apps/     │  │   logic/    │  │     model/          │  │
│  └─────────────┘  └─────────────┘  └──────────┬──────────┘  │
│                                                │            │
│  ┌─────────────────────────────────────────────▼──────────┐ │
│  │                    数据访问层 api/                      │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                 │
│  ┌────────────────────────▼───────────────────────────────┐ │
│  │        Redis (主存储)        │        SQLite (辅助)     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              后台任务调度 workers/                       ││
│  │         scheduler.js  ←──→  worker.js                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 技术栈

| 技术 | 用途 |
|------|------|
| **Node.js** | 运行环境，ES Modules |
| **Redis** | 主数据存储，任务队列，分布式锁 |
| **SQLite** | 辅助数据存储，复杂查询 |
| **pinyin-pro** | 中文拼音处理 |

### 核心特性

- ✅ **高性能存储**: Redis 取代 JSON 文件，大幅提升读写效率
- ✅ **分布式锁**: 防止并发写入冲突，确保数据一致性
- ✅ **异步任务调度**: 后台独立进程处理定时任务
- ✅ **事务安全**: WATCH + MULTI/EXEC 双重保障

---

## 🎮 功能模块

### 修炼系统

| 指令 | 说明 |
|------|------|
| `#踏入仙途` | 创建角色，开始修仙之旅 |
| `#个人信息` | 查看角色属性和境界 |
| `#闭关 [时间]` | 闭关修炼，积累修为 |
| `#突破` | 尝试突破当前境界 |
| `#渡劫` | 渡劫期专属，历经雷劫 |
| `#羽化登仙` | 渡劫成功后飞升仙界 |

### 战斗系统

| 指令 | 说明 |
|------|------|
| `#切磋 @玩家` | 与其他玩家 PVP 切磋 |
| `#探索秘境` | 进入秘境探险 |
| `#挑战世界BOSS` | 参与全服 BOSS 战 |

### 社交系统

| 指令 | 说明 |
|------|------|
| `#创建宗门 [名称]` | 创建自己的宗门 |
| `#加入宗门 [名称]` | 申请加入宗门 |
| `#宗门信息` | 查看宗门详情 |
| `#拜师 @玩家` | 拜师学艺 |
| `#结为道侣 @玩家` | 结为伴侣 |

### 经济系统

| 指令 | 说明 |
|------|------|
| `#我的纳戒` | 查看背包物品 |
| `#商店` | 打开商店 |
| `#购买 [物品]` | 购买商品 |
| `#出售 [物品]` | 出售物品 |
| `#拍卖 [物品] [价格]` | 拍卖物品 |

### 更多功能

发送 `#修仙帮助` 查看完整指令列表

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0
- Redis >= 5.0
- Yunzai-Bot v3

### 安装步骤

**1. 克隆仓库**

在 Yunzai-Bot 根目录执行：

```bash
git clone https://gitee.com/xialuo03/xiuxian-emulator-plugin.git ./plugins/xiuxian-emulator-plugin/
```

**2. 安装依赖**

```bash
cd plugins/xiuxian-emulator-plugin
pnpm install
```

**3. 启动机器人**

```bash
# 回到 Yunzai-Bot 根目录
cd ../..
node app
```

### 拉取指定分支

```bash
git clone -b [分支名] https://gitee.com/xialuo03/xiuxian-emulator-plugin.git ./plugins/xiuxian-emulator-plugin/
```

### 从其他分支迁移

```bash
cd plugins/xiuxian-emulator-plugin
git remote set-url origin https://gitee.com/xialuo03/xiuxian-emulator-plugin.git
git fetch
git pull
```

---

## 📦 数据迁移

> ⚠️ **重要**: v3.0.0 版本采用 Redis 存储玩家数据，从旧版本升级需要执行数据迁移。

### 迁移步骤

**1. 备份数据**

请务必备份以下目录：

```
resources/data/xiuxian_player
resources/data/xiuxian_najie
resources/data/xiuxian_equipment
resources/data/association
```

**2. 执行迁移脚本**

> 请在机器人**停止运行**但 **Redis 保持运行**的状态下执行：

```bash
node ./plugins/xiuxian-emulator-plugin/migrate-to-redis.js
```

**3. 重启机器人**

```bash
node app
```

---

## ⚙️ 配置说明

### 主配置文件

```
config/xiuxian/xiuxian.yaml
```

### 数据存储路径

```
resources/data/          # 静态数据
config/itemConfig/       # 物品配置
occupation/              # 职业数据
```

### 自定义配置

您可以根据需求修改配置文件来调整游戏参数，如：
- 境界突破概率
- 物品掉落率
- 商店价格
- 活动时间表

---

## 📂 目录结构

```
xiuxian-emulator-plugin/
├── apps/                # 指令处理层 (74个功能模块)
│   ├── User/           # 用户系统
│   ├── Battle/         # 战斗系统
│   ├── Association/    # 宗门系统
│   ├── SecretPlace/    # 秘境探险
│   ├── yijie/          # 异界玩法
│   └── ...
├── logic/               # 业务逻辑层 (38个逻辑文件)
├── model/               # 数据模型层
├── api/                 # 数据访问层
├── workers/             # 后台任务调度
├── config/              # 配置文件
├── resources/           # 资源文件
├── index.js             # 插件入口
└── migrate-to-redis.js  # 数据迁移工具
```

---

## ❓ 常见问题

### 幻影指令失效

如果遇到幻影相关指令全部失效，请检查是否安装了 `xiaoyao-cvs-plugin` 插件。

**解决方案**：修改该插件的 `apps/index.js`，删除匹配幻影的指令即可。

### Redis 连接失败

确保 Redis 服务已启动且配置正确：

```yaml
# config/config/redis.yaml
host: 127.0.0.1
port: 6379
db: 0
password: ""
```

### 数据迁移失败

1. 确保机器人已停止运行
2. 确保 Redis 服务正在运行
3. 检查旧数据文件是否存在且完整

---

## 📚 玩家攻略

- 📖 [修仙攻略](https://docs.qq.com/doc/DSUhqZWdpZXJuUndZ?&u=4bd0757f64094c48b02d7cfc4eaeb44b)
- 🌌 [异界攻略](https://docs.qq.com/doc/DU1pmVFNReVlvdEJP)

---

## 📊 访问统计

<p align="center">
  <img src="https://count.getloli.com/get/@:xiuxian-emulator-plugin?theme=rule34" alt="访问量统计">
</p>

---

## 🔄 更新日志

在群聊中发送 `#查看日志` 即可查看最新更新内容。

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发规范

- **变量命名**: 小驼峰命名法 (`playerData`, `itemName`)
- **函数命名**: 大驼峰命名法 (`GetPlayerData`, `UpdateNajie`)
- **模块系统**: ES Modules (`import`/`export`)

### 项目结构

- `apps/` - 新增指令处理器
- `logic/` - 新增业务逻辑
- `config/itemConfig/` - 新增物品配置

---

## 📞 联系方式

| 渠道 | 信息 |
|------|------|
| 作者 QQ | 2531606029 |
| 游玩反馈群 | 906061358 |
| Gitee | [@xialuo03](https://gitee.com/xialuo03) |

---

## 📜 致谢

本项目基于以下开源项目开发，特此感谢：

- 原插件：[@ningmengchongshui](https://gitee.com/ningmengchongshui)
- 原作者：[@DDZS](https://gitee.com/hutao222)
- 框架：[Yunzai-Bot](https://gitee.com/Le-niao/Yunzai-Bot)

---

## ⚠️ 免责声明

本项目仅供学习交流使用，请勿用于商业用途。使用本插件产生的任何问题，开发者概不负责。

---

<p align="center">
  <sub>Made with ❤️ by 星瀚修仙开发团队</sub>
</p>