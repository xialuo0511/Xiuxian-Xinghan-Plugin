# 计划 - 集成 TRSS-Yunzai-Types

## 阶段 1：环境初始化 [checkpoint: 125e256]
- [x] 任务：安装依赖 37d3939
    - [x] 运行命令安装 `trss-yunzai-types` 作为开发依赖。
- [x] 任务：配置文件设置 0ac501a
    - [x] 创建或更新项目根目录的 `jsconfig.json`，配置类型搜索路径。
- [x] 任务：Conductor - 用户手动验证 '环境初始化' (Protocol in workflow.md)

## 阶段 2：核心模块类型增强
- [ ] 任务：XiuxianData 类型适配
    - [ ] 为 `model/XiuxianData.js` 中的核心方法添加 JSDoc 类型声明。
- [ ] 任务：应用入口类型适配
    - [ ] 为 `apps/AdminSuper/admin.js`（作为示例）添加基础的指令处理函数类型注释。
- [ ] 任务：Conductor - 用户手动验证 '核心模块类型增强' (Protocol in workflow.md)

## 阶段 3：最终检查
- [ ] 任务：验证类型识别
    - [ ] 检查 IDE 是否能够正确补全。
- [ ] 任务：全量构建/检查
    - [ ] 确保没有因为引入类型导致的编译或运行时错误。
- [ ] 任务：Conductor - 用户手动验证 '最终检查' (Protocol in workflow.md)
