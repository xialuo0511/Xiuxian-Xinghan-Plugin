import fs from "node:fs";
import Config from "./Config.js";
import path from "path";
//引入获取配置的js

/*
  数据封装
 */
class XiuxianData {
    constructor() {
        //获取配置文件参数
        this.configData = Config.getdefSet("version", "version");

        //文件路径参数
        //插件根目录
        const __dirname = path.resolve() + path.sep + "plugins" + path.sep + "xiuxian-emulator-plugin";
        this.filePathMap = {
            "yijie_player": path.join(__dirname, "/resources/data/yijie/player"),//异界玩家数据
            "yijie_beibao": path.join(__dirname, "/resources/data/yijie/beibao"),//异界背包数据
            "player": path.join(__dirname, "/resources/data/xiuxian_player"),//用户数据
            "equipment": path.join(__dirname, "/resources/data/xiuxian_equipment"),
            "najie": path.join(__dirname, "/resources/data/xiuxian_najie"),
            "lib": path.join(__dirname, "/resources/data/item"),
            "Timelimit": path.join(__dirname, "/resources/data/Timelimit"),//限定
            "Level": path.join(__dirname, "/resources/data/Level"),//境界
            "association": path.join(__dirname, "/resources/data/association"),
            "occupation": path.join(__dirname, "/resources/data/occupation"),
        }

        this.lib_path = this.filePathMap.lib;
        this.Timelimit = this.filePathMap.Timelimit;
        this.Level = this.filePathMap.Level;
        this.Occupation = this.filePathMap.occupation;
        this.Whitelist = JSON.parse(fs.readFileSync(`${this.lib_path}/白名单.json`));

        /**
        * 回收数据
        */
        this.huishou_list = JSON.parse(fs.readFileSync(`${this.lib_path}/回收列表.json`));

        //加载灵根列表
        this.talent_list = JSON.parse(fs.readFileSync(`${this.lib_path}/灵根列表.json`));
        //加载怪物列表
        this.monster_list = JSON.parse(fs.readFileSync(`${this.lib_path}/怪物/怪物列表.json`));
        this.monster_list1 = JSON.parse(fs.readFileSync(`${this.lib_path}/怪物/怪物列表筑基.json`));
        this.monster_list2 = JSON.parse(fs.readFileSync(`${this.lib_path}/怪物/怪物列表金丹.json`));
        this.monster_list3 = JSON.parse(fs.readFileSync(`${this.lib_path}/怪物/怪物列表化神.json`));
        this.monster_list4 = JSON.parse(fs.readFileSync(`${this.lib_path}/怪物/怪物列表合体.json`));
        this.monster_list5 = JSON.parse(fs.readFileSync(`${this.lib_path}/怪物/怪物列表大乘.json`));
        this.monster_list6 = JSON.parse(fs.readFileSync(`${this.lib_path}/怪物/怪物列表地仙.json`));
        this.monster_list7 = JSON.parse(fs.readFileSync(`${this.lib_path}/怪物/怪物列表小千世界.json`));
        this.monster_list8 = JSON.parse(fs.readFileSync(`${this.lib_path}/怪物/怪物列表大千世界.json`));
        this.monster_list_huodong = JSON.parse(fs.readFileSync(`${this.lib_path}/怪物/活动怪物列表.json`));
        //加载商品列表
        this.commodities_list = JSON.parse(fs.readFileSync(`${this.lib_path}/商店/商品列表.json`));
        //加载仙石商品列表
        this.xianshi_list = JSON.parse(fs.readFileSync(`${this.lib_path}/商店/仙石列表.json`));
        //加载遗迹商店商品
        this.yijishop_list = JSON.parse(fs.readFileSync(`${this.lib_path}/商店/遗迹商店.json`));
        //加载活动商店商品
        this.huodongshop_list = JSON.parse(fs.readFileSync(`${this.lib_path}/商店/活动商店.json`));
        //加载宗门藏宝阁列表
        this.cangbaoge_list = JSON.parse(fs.readFileSync(`${this.lib_path}/商店/宗门藏宝阁.json`));
        //练气境界
        this.Level_list = JSON.parse(fs.readFileSync(`${this.Level}/练气境界.json`));
        //师徒积分
        this.shitujifen = JSON.parse(fs.readFileSync(`${this.lib_path}/商店/积分商城.json`));
        //炼体境界
        this.LevelMax_list = JSON.parse(fs.readFileSync(`${this.Level}/炼体境界.json`));

        //特殊
        //头像框
        this.Touxiang_list = JSON.parse(fs.readFileSync(`${this.lib_path}/特殊/头像框.json`));

        //加载装备列表
        this.equipment_list = JSON.parse(fs.readFileSync(`${this.lib_path}/装备列表.json`));
        //法宝
        this.fabao_list = JSON.parse(fs.readFileSync(`${this.lib_path}/法宝列表.json`));
        //武器
        this.wuqi_list = JSON.parse(fs.readFileSync(`${this.lib_path}/武器列表.json`));
        //护具
        this.huju_list = JSON.parse(fs.readFileSync(`${this.lib_path}/护具列表.json`));

        //凝渊
        this.ningyuan_guai_list_1 = JSON.parse(fs.readFileSync(`${this.lib_path}/怪物/凝渊殿/1.json`));


        //异界
        //装备
        this.yijie_zhuangbei_list = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/装备列表.json`));
        //仙鼎阶段
        this.xiandingjieduan_list = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/仙鼎阶段.json`));
        //天赋阶段
        this.tianfujieduan_list = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/天赋阶段.json`));
        //异界秘境
        this.yijie_mijing = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/秘境/秘境列表.json`));
        //异界道具
        this.yijie_daoju = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/道具列表.json`));
        //异界材料
        this.yijie_cailiao = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/材料列表.json`));
        //异界食材
        this.yijie_shichai = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/食材列表.json`));
        //异界箱子
        this.yijie_box = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/箱子列表.json`));
        //仙鼎等级
        this.yijie_xianding = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/仙鼎阶段.json`));
        //琉璃堂
        this.yijie_liuli = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/琉璃堂.json`));
        //合成列表
        this.yijie_hecheng = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/合成列表.json`));
        //套装列表
        this.yijie_taozhuang = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/套装效果.json`));
        //套装列表
        this.yijie_jinmai = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/禁卖列表.json`));
        //异界怪物列表
        //其零
        this.yijie_guaiwu0 = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/秘境怪物/level0.json`));
        //其一
        this.yijie_guaiwu1 = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/秘境怪物/level1.json`));
        //其二
        this.yijie_guaiwu2 = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/秘境怪物/level2.json`));
        //其三
        this.yijie_guaiwu3 = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/秘境怪物/level3.json`));
        //其四
        this.yijie_guaiwu4 = JSON.parse(fs.readFileSync(`${this.lib_path}/异界/秘境怪物/level4.json`));


        //加载丹药列表
        this.danyao_list = JSON.parse(fs.readFileSync(`${this.lib_path}/丹药列表.json`));
        //加载炼丹师丹药列表
        this.newdanyao_list = JSON.parse(fs.readFileSync(`${this.lib_path}/炼丹师丹药.json`));
        //加载道具列表
        this.daoju_list = JSON.parse(fs.readFileSync(`${this.lib_path}/道具列表.json`));
        //加载功法列表
        this.gongfa_list = JSON.parse(fs.readFileSync(`${this.lib_path}/功法列表.json`));
        //加载传承功法列表
        this.homegongfa_list = JSON.parse(fs.readFileSync(`${this.lib_path}/传承功法.json`));
        //加载草药列表
        this.caoyao_list = JSON.parse(fs.readFileSync(`${this.lib_path}/草药列表.json`));
        //加载材料列表
        this.cailiao_list = JSON.parse(fs.readFileSync(`${this.lib_path}/材料列表.json`));
        //加载盒子列表
        this.hezi_list = JSON.parse(fs.readFileSync(`${this.lib_path}/盒子列表.json`));
        //加载食材列表
        this.shicai_list = JSON.parse(fs.readFileSync(`${this.lib_path}/食材列表.json`));
        //加载mc合成列表
        this.hecheng_list = JSON.parse(fs.readFileSync(`${this.lib_path}/合成列表.json`));
        //加载mc加工列表
        this.jiagong_list = JSON.parse(fs.readFileSync(`${this.lib_path}/加工列表.json`));
        //加载mc附魔书列表
        this.fumoshu_list = JSON.parse(fs.readFileSync(`${this.lib_path}/附魔书列表.json`));
        //加载常驻附魔书
        this.changzhufumoshu_list = JSON.parse(fs.readFileSync(`${this.lib_path}/常驻附魔书.json`));

        //加载地点列表
        this.didian_list = JSON.parse(fs.readFileSync(`${this.lib_path}/秘境/地点列表.json`));
        //加载洞天福地列表
        this.bless_list = JSON.parse(fs.readFileSync(`${this.lib_path}/秘境/洞天福地.json`));
        //加载宗门秘境
        this.guildSecrets_list = JSON.parse(fs.readFileSync(`${this.lib_path}/秘境/宗门秘境.json`));
        //加载禁地列表
        this.forbiddenarea_list = JSON.parse(fs.readFileSync(`${this.lib_path}/秘境/禁地列表.json`));
        //加载仙域列表
        this.Fairyrealm_list = JSON.parse(fs.readFileSync(`${this.lib_path}/秘境/仙境列表.json`));
        //加载寻宝列表
        this.xunbao_list = JSON.parse(fs.readFileSync(`${this.lib_path}/秘境/寻宝列表.json`));
        //加载遗迹列表
        this.yiji_list = JSON.parse(fs.readFileSync(`${this.lib_path}/秘境/遗迹列表.json`));

        //加载限定仙府
        this.timeplace_list = JSON.parse(fs.readFileSync(`${this.Timelimit}/限定仙府.json`));
        //加载限定功法
        this.timegongfa_list = JSON.parse(fs.readFileSync(`${this.Timelimit}/限定功法.json`));
        //加载限定装备
        this.timeequipmen_list = JSON.parse(fs.readFileSync(`${this.Timelimit}/限定装备.json`));
        //加载限定丹药
        this.timedanyao_list = JSON.parse(fs.readFileSync(`${this.Timelimit}/限定丹药.json`));
        //加载列表
        this.sanbin = JSON.parse(fs.readFileSync(`${this.lib_path}/世界boss列表.json`));
        //加载职业列表
        this.occupation_list = JSON.parse(fs.readFileSync(`${this.Occupation}/职业列表.json`));
        //加载职业经验列表
        this.occupation_exp_list = JSON.parse(fs.readFileSync(`${this.Occupation}/experience.json`));
        //加载丹方列表
        this.danfang_list = JSON.parse(fs.readFileSync(`${this.Occupation}/炼丹配方.json`));
        //加载图纸列表
        this.tuzhi_list = JSON.parse(fs.readFileSync(`${this.Occupation}/装备图纸.json`));
        //加载图鉴列表
        this.yuansuwuqi_list = JSON.parse(fs.readFileSync(`${this.lib_path}/元素武器.json`));
        //加载造化机缘列表
        this.wuqizaohua = JSON.parse(fs.readFileSync(`${this.lib_path}/武器造化机缘.json`));
        this.hujuzaohua = JSON.parse(fs.readFileSync(`${this.lib_path}/护具造化机缘.json`));
        this.fabaozaohua = JSON.parse(fs.readFileSync(`${this.lib_path}/法宝造化机缘.json`));
        //加载八品功法列表
        this.bapin = JSON.parse(fs.readFileSync(`${this.lib_path}/八品.json`));
        //加载星阁列表
        this.xingge = JSON.parse(fs.readFileSync(`${this.lib_path}/星阁拍卖行列表.json`));
        //天地
        this.tianditang = JSON.parse(fs.readFileSync(`${this.lib_path}/天地堂.json`));
        //仙宠
        this.changzhuxianchon = JSON.parse(fs.readFileSync(`${this.lib_path}/常驻仙宠.json`));
        this.xianchon = JSON.parse(fs.readFileSync(`${this.lib_path}/仙宠列表.json`));
        this.xianchonkouliang = JSON.parse(fs.readFileSync(`${this.lib_path}/仙宠口粮列表.json`));
        //npc
        this.npc_list = JSON.parse(fs.readFileSync(`${this.lib_path}/npc列表.json`));
        //
        this.shop_list = JSON.parse(fs.readFileSync(`${this.lib_path}/shop列表.json`));

        this.qinlong = JSON.parse(fs.readFileSync(`${this.Timelimit}/青龙.json`));
        this.qilin = JSON.parse(fs.readFileSync(`${this.Timelimit}/麒麟.json`));
        this.xuanwu = JSON.parse(fs.readFileSync(`${this.Timelimit}/玄武朱雀白虎.json`));
        //魔界
        this.mojie = JSON.parse(fs.readFileSync(`${this.lib_path}/魔界列表.json`));
        //加载项链列表
        this.necklace_list = JSON.parse(fs.readFileSync(`${this.lib_path}/项链列表.json`));
        //兑换码
        this.duihuan = JSON.parse(fs.readFileSync(`${this.lib_path}/兑换列表.json`));
        //神界
        this.shenjie = JSON.parse(fs.readFileSync(`${this.lib_path}/神界列表.json`));
        //加载卡池
        this.xianding = JSON.parse(fs.readFileSync(`${this.lib_path}/寻宝抽奖/限定up.json`));
        this.changzhu = JSON.parse(fs.readFileSync(`${this.lib_path}/寻宝抽奖/常驻.json`));
        //加载卡面列表
        this.kamian = JSON.parse(fs.readFileSync(`${this.lib_path}/影幻牌面列表.json`));
        //加载技能列表
        this.jineng1 = JSON.parse(fs.readFileSync(`${this.lib_path}/技能列表1.json`));
        this.jineng2 = JSON.parse(fs.readFileSync(`${this.lib_path}/技能列表2.json`));

    }



    /**
      * 检测存档存在
      * @param file_path_type ["player" , "association" ]
      * @param file_name 
      */
    existData(file_path_type, file_name) {
        let file_path;
        file_path = this.filePathMap[file_path_type];
        let dir = path.join(file_path + '/' + file_name + '.json');
        if (fs.existsSync(dir)) {
            return true;
        }
        return false;
    }


    /**
     * 获取文件数据(user_qq为空查询item下的file_name文件)
     * @param file_name  [player,equipment,najie]
     * @param user_qq
     */
    getData(file_name, user_qq) {
        let file_path;
        let dir;
        let data;
        if (user_qq) {//带user_qq的查询数据文件
            file_path = this.filePathMap[file_name];
            dir = path.join(file_path + '/' + user_qq + '.json');
        }
        else {//不带参数的查询item下文件
            file_path = this.filePathMap.lib;
            dir = path.join(file_path + '/' + file_name + '.json');
        }
        try {
            data = fs.readFileSync(dir, 'utf8')
        }
        catch (error) {
            logger.error('读取文件错误：' + error);
            return "error";
        }
        //将字符串数据转变成json格式
        data = JSON.parse(data);
        return data;


    }

    /**
     * 写入数据
     * @param file_name [player,equipment,najie]
     * @param user_qq
     * @param data
     */
    setData(file_name, user_qq, data) {
        let file_path;
        let dir;
        if (user_qq) {
            file_path = this.filePathMap[file_name];
            dir = path.join(file_path + '/' + user_qq + '.json');
        } else {
            file_path = this.filePathMap.lib;
            dir = path.join(file_path + '/' + file_name + '.json');
        }
        let new_ARR = JSON.stringify(data, "", "\t");//json转string
        if (fs.existsSync(dir)) {
            fs.writeFileSync(dir, new_ARR, 'utf-8', (err) => {
                console.log('写入成功', err)
            })
        }
        return;
    }



    /**
     * 获取宗门数据
     * @param file_name  宗门名称
     */
    getAssociation(file_name) {
        let file_path;
        let dir;
        let data;
        file_path = this.filePathMap.association;
        dir = path.join(file_path + '/' + file_name + '.json');
        try {
            data = fs.readFileSync(dir, 'utf8')
        } catch (error) {
            logger.error('读取文件错误：' + error);
            return "error";
        }
        //将字符串数据转变成json格式
        data = JSON.parse(data);
        return data;
    }


    /**
     * 写入宗门数据
    * @param file_name  宗门名称
    * @param data
    */
    setAssociation(file_name, data) {
        let file_path;
        let dir;
        file_path = this.filePathMap.association;
        dir = path.join(file_path + '/' + file_name + '.json');
        let new_ARR = JSON.stringify(data, "", "\t");//json转string
        fs.writeFileSync(dir, new_ARR, 'utf-8', (err) => {
            console.log('写入成功', err)
        })

        return;
    }


}

export default new XiuxianData();