# 安装教程

本页提供详细的安装步骤、数据迁移指南和常见问题排查。

## 从零开始安装

### 1. 环境准备

确保已安装以下环境：

```bash
# 检查 Node.js 版本
node -v  # 需要 ≥ 18.0

# 检查 Redis 是否运行
redis-cli ping  # 应返回 PONG
```

### 2. 克隆项目

**方式一：克隆主分支**
```bash
git clone https://gitee.com/xialuo03/xiuxian-emulator-plugin.git ./plugins/xiuxian-emulator-plugin/
```

**方式二：克隆指定分支**
```bash
git clone -b [分支名] https://gitee.com/xialuo03/xiuxian-emulator-plugin.git ./plugins/xiuxian-emulator-plugin/
```

### 3. 安装依赖

```bash
cd plugins/xiuxian-emulator-plugin
pnpm install
```

### 4. 启动机器人

```bash
cd ../..
node app
```

## 数据迁移

::: danger 重要提示
v3.0.0 版本采用 Redis 存储玩家数据，从旧版本升级**必须**执行数据迁移！
:::

### 迁移前准备

**1. 备份数据**

请务必备份以下目录：
```
resources/data/xiuxian_player
resources/data/xiuxian_najie
resources/data/xiuxian_equipment
resources/data/association
```

**2. 停止机器人**

确保 Yunzai-Bot 已停止运行，但 Redis 服务保持运行状态。

### 执行迁移

```bash
node ./plugins/xiuxian-emulator-plugin/migrate-to-redis.js
```

### 验证迁移

1. 启动机器人
2. 在群聊中发送 `#个人信息`
3. 检查玩家数据是否正确显示

## 配置说明

### 主配置文件

```
config/xiuxian/xiuxian.yaml
```

### 数据存储路径

| 路径 | 说明 |
|------|------|
| `resources/data/` | 静态数据 |
| `config/itemConfig/` | 物品配置 |
| `occupation/` | 职业数据 |

### 自定义配置

你可以根据需求修改配置文件来调整游戏参数：
- 境界突破概率
- 物品掉落率
- 商店价格
- 活动时间表

## 从其他分支迁移

如果你是从其他分支迁移到当前版本：

```bash
cd plugins/xiuxian-emulator-plugin
git remote set-url origin https://gitee.com/xialuo03/xiuxian-emulator-plugin.git
git fetch
git pull
```

## 常见问题

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
4. 查看控制台错误信息定位问题

### 依赖安装失败

```bash
# 清理缓存后重试
rm -rf node_modules
pnpm install
```

## 目录结构

```
xiuxian-emulator-plugin/
├── apps/                # 指令处理层
│   ├── User/           # 用户系统
│   ├── Battle/         # 战斗系统
│   ├── Association/    # 宗门系统
│   └── ...
├── logic/               # 业务逻辑层
├── model/               # 数据模型层
├── api/                 # 数据访问层
├── workers/             # 后台任务调度
├── config/              # 配置文件
├── resources/           # 资源文件
├── index.js             # 插件入口
└── migrate-to-redis.js  # 数据迁移工具
```
