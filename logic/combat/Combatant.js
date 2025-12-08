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
    this.current_hp = Math.max(0, this.current_hp - amount);
    return amount;
  }
}