# 绝云间修仙3.0.0 【一竿风月共听潮】

## 作者联系：QQ2531606029

## QQ游玩反馈群：906061358

## 有关幻影问题：

如果遇到幻影无法使用，幻影相关指令全部失效，请查看是否安装【xiaoyao-cvs-plugin】，该插件的一个匹配指令会导致幻影指令全部失效，请修改该插件的apps/index.js，将匹配幻影的指令删除即可

# 存档迁移

在目前最新版本中，由于json文件的访问效率低下，最新版本采用redis保存玩家数据，若升级版本，请按下面步骤执行：

1. 备份数据文件：将下列玩家数据文件备份，避免造成异常导致损失(异界玩法暂不迁移)

```
resource/data/xiuxian_player
resource/data/xiuxian_najie
resource/data/xiuxian_equipment
resources/data/association

```

2. 在机器人根目录执行下列代码（请在机器人非运行状态时执行，但请保持redis开启）

```
node ./plugins/xiuxian-emulator-plugin/migrate-to-redis.js
```

## 玩家攻略：

[修仙攻略](https://docs.qq.com/doc/DSUhqZWdpZXJuUndZ?&u=4bd0757f64094c48b02d7cfc4eaeb44b)  
[异界攻略](https://docs.qq.com/doc/DU1pmVFNReVlvdEJP)

## 访问量：

<br><img src="https://count.getloli.com/get/@:xiuxian-emulator-plugin?theme=rule34" /> <br>

## 安装

> Yunzai-Bot/目录下执行

```
git clone  https://gitee.com/xialuo03/xiuxian-emulator-plugin.git ./plugins/xiuxian-emulator-plugin/

```

> 如需拉取其他分支，请在Yunzai-Bot/目录下执行

```
git clone  -b [分支名] https://gitee.com/xialuo03/xiuxian-emulator-plugin.git ./plugins/xiuxian-emulator-plugin/

```

> 如需从原插件更改至本插件，可在Yunzai-Bot/plugins/xiuxian-emulator-plugin/目录下执行

```
git remote set-url master https://gitee.com/xialuo03/xiuxian-emulator-plugin.git
```

```
git fetch

```

## 更新内容

要获取最新更新内容发"#查看日志"即可查看

## 配置与存档

> xiuxian-emulator-plugin/ config / xiuxian / xiuxian.yaml       
> xiuxian-emulator-plugin/ resources / data          
> 可根据需求自行修改

## 免责声明

功能仅限内部交流与小范围使用

## 原作者信息

原插件：[@ningmengchongshui](https://gitee.com/ningmengchongshui)  
原作者：[@DDZS](https://gitee.com/hutao222)