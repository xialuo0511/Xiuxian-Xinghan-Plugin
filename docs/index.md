---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "✨ 星瀚修仙"
  text: "v3.2.0「雨霁青岚 · 柳烟新晴」"
  tagline: 基于 Yunzai-Bot 的高性能群聊修仙文字游戏插件
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/start
    - theme: alt
      text: 安装教程
      link: /guide/install
    - theme: alt
      text: 更新日志
      link: /update/v3.2

features:
  - icon: 🧘
    title: 放置修仙系统
    details: 闭关打坐积累修为，历经天劫突破境界，从凡人到八斗之才的完整修仙之旅
  - icon: ⚔️
    title: 丰富战斗体验
    details: PVP 切磋、PVE 秘境副本、镇妖塔挑战、世界 BOSS 挑战
  - icon: 🏛️
    title: 深度社交生态
    details: 宗门系统、结义系统、伴侣系统、师徒系统，构建你的修仙人脉
  - icon: 💰
    title: 完善经济系统
    details: 自由交易、拍卖行、金银坊、多种商店，灵石经济一应俱全
  - icon: 🔧
    title: 职业玩法
    details: 炼丹师、采药师、炼器师、采矿师、侠客、猎户六大职业可选
  - icon: 🌌
    title: 魔神界探索
    details: 堕入魔界或踏入神界，独立的双修仙玩法系统
---

## 🏗️ 技术架构

::: info 核心特性
- ✅ **高性能存储**: Redis 取代 JSON 文件，大幅提升读写效率
- ✅ **分布式锁**: 防止并发写入冲突，确保数据一致性
- ✅ **异步任务调度**: 后台独立进程处理定时任务
- ✅ **事务安全**: WATCH + MULTI/EXEC 双重保障
:::

| 技术 | 用途 |
|------|------|
| **Node.js ≥18** | 运行环境，ES Modules |
| **Redis ≥5.0** | 主数据存储，任务队列，分布式锁 |
| **SQLite** | 辅助数据存储，复杂查询 |

## 📞 联系方式

| 渠道 | 信息 |
|------|------|
| 作者 QQ | 2531606029 |
| 游玩反馈群 | 906061358 |
| Gitee | [@xialuo03](https://gitee.com/xialuo03) |

---

<p align="center">
  <sub>Made with ❤️ by 星瀚修仙开发团队</sub>
</p>
