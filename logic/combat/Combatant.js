// 辅助函数，用于格式化数字，例如 123456 -> 12.3万
function formatNumber(num) {
    if (num >= 100000000) {
        return (num / 100000000).toFixed(1) + '亿';
    } else if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
}

export class Combatant {
  constructor(id, source, team) {
    this.id = id;
    this.team = team;
    this.source = source;
    
    // 初始化扩展属性
    this.buffs = []; // 暂未启用
    this.shield = 0;
    this.current_av = 0;
    this.speed_multiplier = 1.0; // 速度倍率
    
    // 控制状态
    this.is_taunted = false; // 是否处于嘲讽状态
    this.taunted_by_id = null; // 嘲讽者 ID
    this.is_frozen = false; // 是否被冻结
    this.is_stunned = false; // 是否被晕眩
    this.active_debuffs = []; // 活跃的debuffs

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
        this.crit_rate = source.base_stats.crit_rate || source.crit_rate || 0;
        this.crit_dmg = source.base_stats.crit_dmg || source.crit_dmg || 1.5;
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
   * 公式: AV = 10000 / (Speed * Multiplier)
   */
  resetAV() {
    const effectiveSpeed = Math.max(1, this.speed * this.speed_multiplier);
    this.current_av = 10000 / effectiveSpeed;
  }

  /**
   * 增加速度倍率 (叠加)
   * @param {number} percent 增加的百分比 (0.05)
   */
  addSpeedStack(percent) {
      this.speed_multiplier += percent;
      
      // 更新UI显示的Buff状态
      const existing = this.active_debuffs.find(d => d.type === 'speed_up_stack');
      const stackCount = Math.round((this.speed_multiplier - 1.0) / 0.05); // 计算层数
      
      if (existing) {
          existing.duration = 99; // 刷新持续时间
          existing.value = stackCount; // 借用value存层数
      } else {
          this.active_debuffs.push({
              type: 'speed_up_stack',
              caster_id: 'self',
              duration: 99,
              value: stackCount,
              just_applied: true
          });
      }
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

  // --- 嘲讽机制 ---

  /**
   * 施加嘲讽状态
   * @param {string} casterId 嘲讽施加者的ID
   */
  setTaunted(casterId) {
      this.is_taunted = true;
      this.taunted_by_id = casterId;
  }

  /**
   * 移除嘲讽状态
   */
  removeTaunted() {
      this.is_taunted = false;
      this.taunted_by_id = null;
  }

  /**
   * 查询是否处于嘲讽状态
   * @returns {boolean}
   */
  isTaunted() {
      return this.is_taunted;
  }

  // --- Debuff 机制 ---

  /**
   * 施加Debuff
   * @param {object} debuffConfig { type: 'poison_dot', caster_id: '...', duration: 3, value: 0.05 }
   */
  applyDebuff(debuffConfig) {
      const existing = this.active_debuffs.find(d => d.type === debuffConfig.type);
      
      // 特殊处理：诅咒之水 (减速)
      if (debuffConfig.type === 'curse_water') {
          if (!existing) {
              if (!this._original_speed) this._original_speed = this.speed;
              this.speed = Math.floor(this.speed * 0.85);
          }
      }

      if (existing) {
          existing.duration = debuffConfig.duration; 
          existing.caster_id = debuffConfig.caster_id;
          existing.value = debuffConfig.value;
      } else {
          this.active_debuffs.push({ ...debuffConfig, just_applied: true });
      }
  }

  /**
   * 处理Debuff效果 (在回合开始时调用)
   * @returns {array} 返回本次Debuff产生的效果列表 (用于日志)
   */
  processDebuffs() {
      const results = [];
      this.is_frozen = false;
      this.is_stunned = false;

      if (!this.isAlive()) {
          this.active_debuffs = [];
          return results;
      }

      // 使用 reduce 重新构建 active_debuffs，同时处理移除逻辑
      this.active_debuffs = this.active_debuffs.reduce((acc, debuff) => {
          let keep = true;

          if (debuff.type === 'freeze') {
              this.is_frozen = true;
          } else if (debuff.type === 'curse_water') {
              // 50% 概率晕眩 (跳过刚施加的当回合)
              if (debuff.just_applied) {
                  debuff.just_applied = false;
              } else if (Math.random() < 0.5) {
                  this.is_stunned = true;
                  results.push({
                      name: this.name, team: this.team, element: this.element, level: this.level || 0,
                      id: this.id, type: 'debuff_trigger', debuff_type: 'curse_water',
                      value: 0, value_display: '晕眩', is_counter: false
                  });
              }
          } else if (debuff.type === 'poison_dot') {
              const dotDamage = Math.floor(this.max_hp * debuff.value);
              const oldShield = this.shield;
              const hpDamage = this.takeDamage(dotDamage);
              const shieldDamage = oldShield - this.shield;
              const totalDamage = hpDamage + shieldDamage;

              if (totalDamage > 0) {
                  results.push({
                      name: this.name, team: this.team, element: this.element, level: this.level || 0,
                      id: this.id, type: 'dot_damage', debuff_type: 'poison_dot',
                      value: hpDamage, // 逻辑上HP减少量
                      value_display: formatNumber(totalDamage), // 显示总伤害
                      is_counter: false
                  });
              }
          }

          debuff.duration--;
          
          if (debuff.duration <= 0) {
              keep = false;
              // 移除时的副作用
              if (debuff.type === 'curse_water' && this._original_speed) {
                  this.speed = this._original_speed;
                  this._original_speed = null;
              }
          }

          if (keep) acc.push(debuff);
          return acc;
      }, []);

      return results;
  }
}
