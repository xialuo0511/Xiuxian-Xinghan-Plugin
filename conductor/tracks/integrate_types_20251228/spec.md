# 规范 - 集成 TRSS-Yunzai-Types

## 目标
引入 `trss-yunzai-types` 类型定义库，为插件开发提供智能补全和静态检查支持。

## 范围
1.  **依赖安装**：将 `trss-yunzai-types` 添加到开发依赖。
2.  **环境配置**：配置 `jsconfig.json` 以确保 IDE（如 VS Code）能正确识别类型定义。
3.  **核心模块适配**：
    *   在 `model/XiuxianData.js` 中引入类型定义。
    *   在主要应用入口（如 `index.js` 或核心 `apps/` 文件）中添加基础的 JSDoc 类型注释。

## 验收标准
*   `package.json` 中包含 `trss-yunzai-types` 依赖。
*   IDE 能够识别并自动补全 `Bot`、`Group`、`User` 以及云崽特定的 `e` 对象属性。
*   现有的项目逻辑不受到任何运行时影响。
