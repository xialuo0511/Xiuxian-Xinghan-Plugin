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

    // 【核心新增】行动点，初始为0
    this.actionPoints = 0;
  }

  isAlive() {
    return this.current_hp > 0;
  }

  takeDamage(amount) {
    this.current_hp = Math.max(0, this.current_hp - amount);
    return amount;
  }
}