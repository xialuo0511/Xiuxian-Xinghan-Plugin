export class Combatant {
  constructor(id, source, team) {
    this.id = id;
    this.name = source.name;
    this.team = team;
    this.source = source;

    this.max_hp = source.base_stats.health;
    this.current_hp = source.base_stats.health;
    this.attack = source.base_stats.attack;
    this.defense = source.base_stats.defense;
    this.speed = source.base_stats.speed;
    this.resistance = source.base_stats.resistance;
    this.taunt = source.base_stats.taunt;
    this.element = source.base_stats.element;

    // 【核心新增】当前行动值 (Action Value)，越小越先行动
    // 初始值将在战斗引擎中设置，或者在这里设为标准值
    this.current_av = 0;
    
    // 【扩展兼容】Buff列表与护盾值
    this.buffs = []; 
    this.shield = 0;
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