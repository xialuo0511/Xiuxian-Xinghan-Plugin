# 快速开始

欢迎来到 **星瀚修仙** 的世界！本指南将帮助你在最短时间内开始修仙之旅。

## 环境要求

在安装插件之前，请确保你的环境满足以下要求：

| 要求         | 版本     |
|------------|--------|
| Node.js    | ≥ 18.0 |
| Redis      | ≥ 5.0  |
| Yunzai-Bot | v3     |

::: tip 提示
如果你还没有安装 Yunzai-Bot，可前往 [Yunzai-Bot 索引文档](https://gitee.com/yhArcadia/Yunzai-Bot-plugins-index)
查找YunzaiBot机器人版本并完成安装。
:::

## 安装步骤

### 1. 克隆仓库

在 Yunzai-Bot 根目录执行：

```bash
git clone https://gitee.com/xialuo03/xiuxian-emulator-plugin.git ./plugins/xiuxian-emulator-plugin/
```

### 2. 安装依赖

```bash
cd plugins/xiuxian-emulator-plugin
pnpm install
```

### 3. 启动机器人

```bash
# 回到 Yunzai-Bot 根目录
cd ../..
node app
```

## 开始游戏

安装完成后，在群聊中发送以下指令开始你的修仙之旅：

| 指令      | 说明        |
|---------|-----------|
| `#踏入仙途` | 创建角色，开始修仙 |
| `#个人信息` | 查看角色属性和境界 |
| `#修仙签到` | 每日签到领取奖励  |
| `#修仙帮助` | 查看完整指令列表  |

::: warning 首次游玩提示
创建角色后，建议先发送 `#修仙帮助` 了解所有可用指令，再开始探索游戏！
:::

## 下一步

- [详细安装教程](/guide/install) - 了解更多安装选项和配置
- [境界系统](/gameplay/levels) - 了解修炼境界的完整体系
- [战斗系统](/gameplay/battle) - 学习如何与其他玩家切磋
- [宗门系统](/gameplay/association) - 加入或创建自己的宗门
