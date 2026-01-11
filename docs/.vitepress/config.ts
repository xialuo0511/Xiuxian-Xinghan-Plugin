import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: '星瀚修仙文档',
  description: '基于 Yunzai-Bot 的高性能群聊修仙文字游戏插件',
  // 基础路径
  base: '/Xiuxian-Xinghan-Plugin/',

  themeConfig: {
    // 顶部导航
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/guide/start' },
      {
        text: '玩法指南',
        items: [
          { text: '境界系统', link: '/gameplay/levels' },
          { text: '炼丹系统', link: '/gameplay/alchemy' },
          { text: '战斗系统', link: '/gameplay/battle' },
          { text: '宗门系统', link: '/gameplay/association' },
          { text: '职业系统', link: '/gameplay/occupation' },
          { text: '经济系统', link: '/gameplay/economy' }
        ]
      },
      { text: '活动列表', link: '/activities/' },
      { text: '功能更新', link: '/features/' },
      {
        text: '更新日志',
        items: [
          { text: 'v3.1.0 更新日志', link: '/update/v3.1' },
          { text: 'v3.0.0 更新日志', link: '/update/log' }
        ]
      }
    ],

    // 侧边栏
    sidebar: [
      {
        text: '📖 入门指南',
        items: [
          { text: '快速开始', link: '/guide/start' },
          { text: '安装教程', link: '/guide/install' }
        ]
      },
      {
        text: '🎮 玩法指南',
        items: [
          { text: '境界系统', link: '/gameplay/levels' },
          { text: '炼丹系统', link: '/gameplay/alchemy' },
          { text: '战斗系统', link: '/gameplay/battle' },
          { text: '宗门系统', link: '/gameplay/association' },
          { text: '职业系统', link: '/gameplay/occupation' },
          { text: '经济系统', link: '/gameplay/economy' }
        ]
      },
      {
        text: '🎪 活动与功能',
        items: [
          { text: '活动列表', link: '/activities/' },
          { text: '功能更新', link: '/features/' }
        ]
      },
      {
        text: '📋 更新日志',
        items: [
          { text: 'v3.1.0 更新日志', link: '/update/v3.1' },
          { text: 'v3.0.0 更新日志', link: '/update/log' }
        ]
      }
    ],

    // 社交链接
    socialLinks: [
      { icon: 'github', link: 'https://github.com/xialuo0511/Xiuxian-Xinghan-Plugin' }
    ],

    // 页脚
    footer: {
      message: 'Made with ❤️ by 星瀚修仙开发团队',
      copyright: 'MIT License'
    },

    // 搜索
    search: {
      provider: 'local'
    },

    // 文档页脚导航
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    // 大纲标题
    outlineTitle: '本页目录',

    // 最后更新时间
    lastUpdatedText: '最后更新'
  }
});