export class Combatant {
  constructor(id, source, team) {
    this.id = id;
    this.team = team;
    this.source = source;
    
    // 初始化扩展属性
    this.buffs = [];
    this.shield = 0;
    this.current_av = 0;

    if (source.base_stats) {
        // 星魂或怪物
        this.name = source.name;
        this.max_hp = source.base_stats.health;
        // 支持血量继承 (活动模式)
        this.current_hp = (source.current_hp_inherit !== undefined) 
            ? source.current_hp_inherit 
            : source.base_stats.health;
            
        this.attack = source.base_stats.attack;
        this.defense = source.base_stats.defense;
        this.speed = source.base_stats.speed;
        this.resistance = source.base_stats.resistance;
        this.taunt = source.base_stats.taunt;
        this.element = source.base_stats.element;
        this.level = source.level || 0;
        
        // 扩展属性 (Buff支持)
        this.crit_rate = source.crit_rate || 0;
        this.crit_dmg = source.crit_dmg || 1.5;
        this.elemental_buffs = source.elemental_buffs || {};
        this.passive_skills = source.passive_skills || [];
    } else {
        // 玩家 (适配 xiuxian_player 数据结构)
        this.name = source.名号 || `玩家${id}`;
        this.max_hp = source.血量上限;
        this.current_hp = source.当前血量 || source.血量上限;
        this.attack = source.攻击;
        this.defense = source.防御;
        this.speed = 100; // 玩家默认速度
        this.resistance = 0; 
        this.taunt = 100;
        
        // 尝试从灵根中解析属性
        this.element = "无";
        if (source.灵根 && source.灵根.name) {
            // 如 "仙之心·水" -> "水"
            const match = source.灵根.name.match(/[金木水火土]/);
            if (match) this.element = match[0];
        }
        this.level = source.level_id || 0;
    }
  }

  /**
   * 重置行动值 (跑圈)
   * 公式: AV = 10000 / Speed
   */
  resetAV() {
    this.current_av = 10000 / Math.max(1, this.speed);
  }

  isAlive() {
    return this.current_hp > 0;
  }

  takeDamage(amount) {
    // 优先扣除护盾
    if (this.shield > 0) {
        if (this.shield >= amount) {
            this.shield -= amount;
            return 0; // 护盾完全吸收
        } else {
            amount -= this.shield;
            this.shield = 0;
        }
    }
    
    // 扣除血量
    this.current_hp = Math.max(0, this.current_hp - amount);
    return amount;
  }
  
  // 【扩展接口】添加治疗
  receiveHeal(amount) {
      if (!this.isAlive()) return 0;
      let oldHp = this.current_hp;
      this.current_hp = Math.min(this.max_hp, this.current_hp + amount);
      return this.current_hp - oldHp;
  }
  
  // 【扩展接口】添加护盾
  addShield(amount) {
      if (!this.isAlive()) return;
      this.shield += amount;
  }
}