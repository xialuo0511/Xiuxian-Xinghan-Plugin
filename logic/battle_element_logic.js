import fs from 'fs';
import path from 'path';

// 元素类型常量
const ELEMENTS = {
  FIRE: '仙之心·火',
  WATER: '仙之心·水',
  THUNDER: '仙之心·雷',
  ROCK: '仙之心·岩',
  ICE: '仙之心·冰',
  WIND: '仙之心·风',
  WOOD: '仙之心·木'
};

// 元素反应类型
const REACTIONS = {
  VAPORIZE: 'vaporize',    // 蒸发
  MELT: 'melt',           // 融化
  OVERLOAD: 'overload',   // 超载
  ELECTRO: 'electro',     // 感电
  SUPERCONDUCT: 'superconduct', // 超导
  FREEZE: 'freeze',       // 冻结
  BURN: 'burn',          // 燃烧
  BLOOM: 'bloom',        // 绽放
  INTENSIFY: 'intensify', // 激化
  CRYSTALLIZE: 'crystallize', // 结晶
  SWIRL: 'swirl'         // 扩散
};

/**
 * 处理元素反应
 * @param {string} attackerElement - 攻击者元素
 * @param {string} defenderElement - 防御者元素
 * @param {string} weaponEnchant - 武器附魔
 * @param {number} baseDamage - 基础伤害
 * @param {Array} messages - 消息数组
 * @returns {Object} 反应结果
 */
export function processElementalReactions(attackerElement, defenderElement, weaponEnchant, baseDamage, messages) {
  const result = {
    damage: baseDamage,
    triggered: false,
    statusEffects: {
      burn: false,
      freeze: false,
      electro: false,
      superconduct: false
    },
    roundsAdded: 0,
    defenseBonus: 0
  };

  // 火元素反应
  if (attackerElement === ELEMENTS.FIRE) {
    processFireReactions(defenderElement, weaponEnchant, baseDamage, result, messages);
  }
  // 水元素反应
  else if (attackerElement === ELEMENTS.WATER) {
    processWaterReactions(defenderElement, weaponEnchant, baseDamage, result, messages);
  }
  // 雷元素反应
  else if (attackerElement === ELEMENTS.THUNDER) {
    processThunderReactions(defenderElement, weaponEnchant, baseDamage, result, messages);
  }
  // 冰元素反应
  else if (attackerElement === ELEMENTS.ICE) {
    processIceReactions(defenderElement, weaponEnchant, baseDamage, result, messages);
  }
  // 草元素反应
  else if (attackerElement === ELEMENTS.WOOD) {
    processWoodReactions(defenderElement, weaponEnchant, baseDamage, result, messages);
  }
  // 岩元素反应
  else if (attackerElement === ELEMENTS.ROCK) {
    processRockReactions(result, messages);
  }
  // 风元素反应
  else if (attackerElement === ELEMENTS.WIND) {
    processWindReactions(weaponEnchant, baseDamage, result, messages);
  }

  // 如果没有触发特殊反应，给予基础元素伤害加成
  if (!result.triggered && isElementalAttack(attackerElement)) {
    result.damage = baseDamage * 1.1;
    messages.push('使用了元素战技，额外造成了10%伤害');
  }

  result.messages = messages;

  return result;
}

/**
 * 处理火元素反应
 */
function processFireReactions(defenderElement, weaponEnchant, baseDamage, result, messages) {
  // 火水 - 蒸发
  if (defenderElement === ELEMENTS.WATER || weaponEnchant === '水') {
    result.damage = baseDamage * 2;
    result.triggered = true;
    const bonus = weaponEnchant === '水' ? '100%' : '50%';
    messages.push(`使用了火元素战技，触发了蒸发反应，额外造成了${bonus}伤害`);
  }
  // 火雷 - 超载
  else if (defenderElement === ELEMENTS.THUNDER || weaponEnchant === '雷') {
    result.damage = baseDamage * 1.2;
    result.triggered = true;
    const bonus = weaponEnchant === '雷' ? '50%' : '20%';
    messages.push(`使用了火元素战技，触发了超载反应，额外造成了${bonus}伤害`);
  }
  // 火冰 - 融化
  else if (defenderElement === ELEMENTS.ICE || weaponEnchant === '冰') {
    result.damage = baseDamage * 2;
    result.triggered = true;
    const bonus = weaponEnchant === '冰' ? '100%' : '200%';
    messages.push(`使用了火元素战技，触发了融化反应，额外造成了${bonus}伤害`);
  }
  // 火草 - 燃烧
  else if (defenderElement === ELEMENTS.WOOD || weaponEnchant === '草') {
    const random = Math.random();
    if (random > 0.6) {
      result.damage = baseDamage * 1.2;
      result.triggered = true;
      result.statusEffects.burn = true;
      messages.push('使用了火元素战技，触发了燃烧反应，目标将收到持续伤害3回合');
    }
  }
}

/**
 * 处理水元素反应
 */
function processWaterReactions(defenderElement, weaponEnchant, baseDamage, result, messages) {
  // 水火 - 蒸发
  if (defenderElement === ELEMENTS.FIRE || weaponEnchant === '火') {
    result.damage = baseDamage * 2;
    result.triggered = true;
    messages.push('使用了水元素战技，触发了蒸发反应，额外造成了100%伤害');
  }
  // 水雷 - 感电
  else if (defenderElement === ELEMENTS.THUNDER || weaponEnchant === '雷') {
    result.damage = baseDamage * 1.5;
    result.triggered = true;
    result.statusEffects.electro = true;
    messages.push('使用了水元素战技，触发了感电反应，目标将收到持续伤害3回合');
  }
  // 水冰 - 冻结
  else if (defenderElement === ELEMENTS.ICE || weaponEnchant === '冰') {
    const random = Math.random();
    const threshold = weaponEnchant === '冰' ? 0.5 : 0.95;
    if (random > threshold) {
      result.statusEffects.freeze = true;
      result.roundsAdded = 1;
      messages.push('使用了水元素战技，触发了冻结反应，目标被冻结了，下一回合无法出手');
    }
  }
  // 水草 - 绽放
  else if (defenderElement === ELEMENTS.WOOD || weaponEnchant === '草') {
    result.damage = baseDamage * 1.2;
    result.triggered = true;
    messages.push('使用了水元素战技，触发了绽放反应，草原核爆炸了！');
  }
}

/**
 * 处理雷元素反应
 */
function processThunderReactions(defenderElement, weaponEnchant, baseDamage, result, messages) {
  // 雷火 - 超载
  if (defenderElement === ELEMENTS.FIRE || weaponEnchant === '火') {
    result.damage = baseDamage * 1.2;
    result.triggered = true;
    messages.push('使用了雷元素战技，触发了超载反应，额外造成了20%伤害');
  }
  // 雷水 - 感电
  else if (defenderElement === ELEMENTS.WATER || weaponEnchant === '水') {
    result.damage = baseDamage * 1.5;
    result.triggered = true;
    result.statusEffects.electro = true;
    messages.push('使用了雷元素战技，触发了感电反应，目标将收到持续伤害3回合');
  }
  // 雷冰 - 超导
  else if (defenderElement === ELEMENTS.ICE || weaponEnchant === '冰') {
    const random = Math.random();
    if (random > 0.5) {
      result.damage = baseDamage * 1.5;
      result.triggered = true;
      result.statusEffects.superconduct = true;
      messages.push('使用了雷元素战技，触发了超导反应，目标的抗性被削弱3回合');
    }
  }
  // 雷草 - 激化
  else if (defenderElement === ELEMENTS.WOOD || weaponEnchant === '草') {
    result.damage = baseDamage * 2;
    result.triggered = true;
    messages.push('使用了雷元素战技，触发了激化反应，伤害提升100%');
  }
}

/**
 * 处理冰元素反应
 */
function processIceReactions(defenderElement, weaponEnchant, baseDamage, result, messages) {
  // 冰火 - 融化
  if (defenderElement === ELEMENTS.FIRE || weaponEnchant === '火') {
    result.damage = baseDamage * 2;
    result.triggered = true;
    messages.push('使用了冰元素战技，触发了融化反应，额外造成了200%伤害');
  }
  // 冰水 - 冻结
  else if (defenderElement === ELEMENTS.WATER || weaponEnchant === '水') {
    const random = Math.random();
    if (random > 0.5) {
      result.statusEffects.freeze = true;
      result.roundsAdded = 1;
      messages.push('使用了冰元素战技，触发了冻结反应，目标被冻结了，下一回合无法出手');
    }
  }
  // 冰雷 - 超导
  else if (defenderElement === ELEMENTS.THUNDER || weaponEnchant === '雷') {
    const random = Math.random();
    if (random > 0.5) {
      result.damage = baseDamage * 2;
      result.triggered = true;
      result.statusEffects.superconduct = true;
      messages.push('使用了冰元素战技，触发了超导反应，目标的抗性被削弱3回合');
    }
  }
}

/**
 * 处理草元素反应
 */
function processWoodReactions(defenderElement, weaponEnchant, baseDamage, result, messages) {
  // 草火 - 燃烧
  if (defenderElement === ELEMENTS.FIRE || weaponEnchant === '火') {
    const random = Math.random();
    if (random > 0.6) {
      result.damage = baseDamage * 1.2;
      result.triggered = true;
      result.statusEffects.burn = true;
      messages.push('使用了草元素战技，触发了燃烧反应，目标将收到持续伤害3回合');
    }
  }
  // 草水 - 绽放
  else if (defenderElement === ELEMENTS.WATER || weaponEnchant === '水') {
    result.damage = baseDamage * 1.2;
    result.triggered = true;
    messages.push('使用了草元素战技，触发了绽放反应，草原核爆炸了！');
  }
  // 草雷 - 激化
  else if (defenderElement === ELEMENTS.THUNDER || weaponEnchant === '雷') {
    result.damage = baseDamage * 2;
    result.triggered = true;
    messages.push('使用了草元素战技，触发了激化反应，伤害提升100%');
  }
}

/**
 * 处理岩元素反应
 */
function processRockReactions(result, messages) {
  result.triggered = true;
  messages.push('使用了岩元素战技，触发了结晶反应，自身抗性得到了大幅提高');
}

/**
 * 处理风元素反应
 */
function processWindReactions(weaponEnchant, baseDamage, result, messages) {
  const elements = ['水',
    '雷',
    '火',
    '冰',
    '草'];
  if (elements.includes(weaponEnchant)) {
    result.damage = baseDamage * 1.2;
    result.triggered = true;
    messages.push('使用了风元素战技，触发了扩散反应，伤害得到了提高');
  }
}

/**
 * 判断是否为元素攻击
 */
function isElementalAttack(element) {
  return Object.values(ELEMENTS).includes(element);
}

/**
 * 处理武器效果
 * @param {Object} weapon - 武器信息
 * @param {string} attackerElement - 攻击者元素
 * @param {Object} player - 玩家信息
 * @param {number} baseDamage - 基础伤害
 * @param {number} random - 随机数
 * @param {Array} messages - 消息数组
 * @returns {Object} 武器效果结果
 */
export function processWeaponEffects(weapon, attackerElement, player, baseDamage, random, messages) {
  const result = {
    damage: baseDamage,
    defenseBonus: 0,
    statusEffects: {
      freeze: false,
      burn: false
    }
  };

  if (!weapon || !weapon.name) return result;

  switch (weapon.name) {
    case '赤角石溃杵':
      processChijiaoWeapon(weapon, attackerElement, player, baseDamage, random, result, messages);
      break;
    case '玄冰之枪':
      processXuanbingWeapon(weapon, attackerElement, baseDamage, random, result, messages);
      break;
    case '冰封巨锤':
      processBingfengWeapon(weapon, attackerElement, player, baseDamage, random, result, messages);
      break;
    case '护摩之杖':
      processHumoWeapon(weapon, attackerElement, player, baseDamage, random, result, messages);
      break;
    case '雾切之回光':
      processWuqieWeapon(weapon, attackerElement, baseDamage, random, result, messages);
      break;
    case '贯虹之槊':
      processGuanhongWeapon(weapon, attackerElement, player, baseDamage, random, result, messages);
      break;
    case '磐岩结绿':
      processPanyanWeapon(weapon, attackerElement, player, baseDamage, random, result, messages);
      break;
    case '苍古自由之誓':
      processCangguWeapon(weapon, attackerElement, baseDamage, random, result, messages);
      break;
    case '湛卢':
      processZhanluWeapon(player, baseDamage, result, messages);
      break;
    case '终末嗟叹之诗':
      processZhongmoWeapon(weapon, attackerElement, baseDamage, random, result, messages);
      break;
  }

  result.messages = messages;

  return result;
}

/**
 * 处理赤角石溃杵武器效果
 */
function processChijiaoWeapon(weapon, attackerElement, player, baseDamage, random, result, messages) {
  if (attackerElement === ELEMENTS.ROCK && random > 0.5) {
    if (weapon.fumo === '岩') {
      messages.push('触发元素爆发:[鬼域狂欢],百分之0.2的防御转化成攻击');
      player.防御 *= 0.6;
      result.damage = baseDamage + (player.防御 * 0.2);
      result.damage = baseDamage * 1.5;
    } else {
      messages.push('触发元素爆发:[鬼王游行通通闪开],百分之0.1的防御转化成攻击');
      player.防御 *= 0.8;
      result.damage = baseDamage + (player.防御 * 0.1);
    }
  } else {
    messages.push('触发赤角石溃杵被动技能:[御嘉大王],防御增强50%,攻击增强120%');
    result.defenseBonus += player.防御 * 0.5;
    result.damage = baseDamage * 1.2;
  }
}

/**
 * 处理玄冰之枪武器效果
 */
function processXuanbingWeapon(weapon, attackerElement, baseDamage, random, result, messages) {
  if (attackerElement === ELEMENTS.ICE) {
    if ((weapon.fumo === '水' || weapon.fumo === '火' || weapon.fumo === '雷') && random > 0.5) {
      if (weapon.fumo === '水') {
        messages.push('寒冰之枪，出鞘！\n成功冻结对方一回合');
        result.statusEffects.freeze = true;
      } else if (weapon.fumo === '火') {
        result.damage = baseDamage * 1.8;
        messages.push('寒冰之枪，出鞘！\n使用了冰元素技能,由于武器自带火属性附魔,造成了融化反应,伤害爆炸了');
      } else if (weapon.fumo === '雷') {
        result.damage = baseDamage * 1.8;
        messages.push('寒冰之枪，出鞘！\n使用了冰元素技能,由于武器自带雷属性附魔,造成了超导反应,伤害爆炸了');
      }
    } else {
      result.damage = baseDamage * 1.5;
      messages.push('寒冰之枪，出鞘！\n使用了冰元素技能,伤害提高了');
    }
  } else {
    result.damage = baseDamage * 1.2;
    messages.push('寒冰之枪，出鞘！\n使用了冰元素技能,伤害提高了');
  }
}

/**
 * 处理冰封巨锤武器效果
 */
function processBingfengWeapon(weapon, attackerElement, player, baseDamage, random, result, messages) {
  if (random > 0.82) {
    messages.push('哈！用力拿起了冰封巨锤,向对手冲了过来');
    if (attackerElement === ELEMENTS.ICE) {
      result.damage = baseDamage * 1.3;
      result.defenseBonus += player.防御;
      messages.push('触发冰封巨锤被动技能:[冰墙巨障],防御提升100%,伤害提升30%');

      if (weapon.fumo === '水') {
        result.statusEffects.freeze = true;
        messages.push('触发了冻结反应');
      }
    } else {
      messages.push('触发冰封巨锤被动技能:[冰墙巨障],防御提升100%,伤害提升15%');
      result.defenseBonus += player.防御;
      result.damage = baseDamage * 1.15;
    }
  }
}

/**
 * 处理护摩之杖武器效果
 */
function processHumoWeapon(weapon, attackerElement, player, baseDamage, random, result, messages) {
  if (player.当前血量 < player.血量上限 / 2 && random > 0.8) {
    messages.push('起！拿起护摩之杖使用[碟来引生]向对手冲了过来');
    if (attackerElement === ELEMENTS.FIRE) {
      result.damage = baseDamage * 2.5;
      messages.push('触发护摩之杖被动技能:[无羁的朱赤之蝶],伤害大幅度提升');

      if (weapon.fumo === '水') {
        result.damage = baseDamage * 3;
        messages.push('触发了蒸发反应');
      }
    } else {
      messages.push('触发护摩之杖被动技能:[无羁的朱赤之蝶],伤害大幅度提升');
      result.damage = baseDamage * 2;
    }
  }
}

/**
 * 处理雾切之回光武器效果
 */
function processWuqieWeapon(weapon, attackerElement, baseDamage, random, result, messages) {
  if (random > 0.8) {
    messages.push('迅影如剑！使用[星斗归位]闪现了过来');
    if (attackerElement === ELEMENTS.THUNDER) {
      let multiplier = 1.7;
      let description = '触发雾切之回光被动技能:[雾切御腰物],元素伤害提升120%';

      if (weapon.fumo === '水') {
        multiplier = 2.5;
        description += ',触发了感电反应';
      } else if (weapon.fumo === '草') {
        multiplier = 2.7;
        description += ',触发了激化反应';
      } else if (weapon.fumo === '冰') {
        multiplier = 2.3;
        description += ',触发了超导反应';
      } else if (weapon.fumo === '火') {
        multiplier = 2.0;
        description += ',触发了超载反应';
      }

      result.damage = baseDamage * multiplier;
      messages.push(description);
    } else {
      messages.push('触发雾切之回光被动技能:[雾切御腰物],元素伤害提升120%');
      result.damage = baseDamage * 1.2;
    }
  }
}

/**
 * 处理贯虹之槊武器效果
 */
function processGuanhongWeapon(weapon, attackerElement, player, baseDamage, random, result, messages) {
  if (random > 0.7) {
    messages.push('安如磐石，使用了元素战技[地心]');
    if (attackerElement === ELEMENTS.ROCK) {
      result.defenseBonus += player.防御 * 0.5;
      result.damage = baseDamage * 1.5;
      messages.push('触发贯虹之槊被动技能:[金璋皇极],防御强效增强150%');

      if (weapon.fumo === '岩') {
        result.defenseBonus += player.防御 * 0.5;
        messages.push('岩属性附魔与武器产生了共鸣');

        if (random > 0.8) {
          messages.push('开启了元素爆发鬼王游行通通闪开,防御转化成了攻击,元素伤害增加了300%');
          result.damage = baseDamage * 3;
          player.防御 = -result.defenseBonus;
        }
      }
    } else {
      messages.push('触发贯虹之槊被动技能:[金璋皇极],防御强效增强120%');
      result.defenseBonus += player.防御 * 0.5;
    }
  }
}

/**
 * 处理磐岩结绿武器效果
 */
function processPanyanWeapon(weapon, attackerElement, player, baseDamage, random, result, messages) {
  if (random > 0.8) {
    messages.push('拿起[磐岩结绿]使用了古华剑派独门剑技[雨画笼山]');
    if (attackerElement === ELEMENTS.WATER) {
      const healAmount = player.血量上限 * 0.3;
      if (player.当前血量 + healAmount >= player.血量上限) {
        player.当前血量 = player.血量上限;
      } else {
        player.当前血量 += healAmount;
      }

      let multiplier = 1.3;
      if (weapon.fumo === '水') {
        multiplier = 1.5;
      }

      result.damage = baseDamage * multiplier;
      messages.push('触发磐岩结绿被动技能:[护国的无垢之心],血量恢复30%');
    } else {
      const healAmount = player.血量上限 * 0.3;
      if (player.血量上限 - player.当前血量 >= healAmount) {
        player.当前血量 = player.血量上限;
      } else {
        player.当前血量 += healAmount;
      }
      messages.push('触发磐岩结绿被动技能:[护国的无垢之心],血量恢复30%');
    }
  }
}

/**
 * 处理苍古自由之誓武器效果
 */
function processCangguWeapon(weapon, attackerElement, baseDamage, random, result, messages) {
  if (random > 0.8) {
    messages.push('\'可叹落叶飘零\'周围吹起风墙,无数枫叶飞舞在双方周围');
    if (attackerElement === ELEMENTS.WIND) {
      let multiplier = 1.3;
      let defenseReduction = 0.8;

      if (weapon.fumo === '风') {
        multiplier = 1.4;
        defenseReduction = 0.6;
        messages.push('风元素附魔与其产生共鸣,触发苍古被动[抗争的践行之歌]');
      } else if (['火',
        '冰',
        '雷',
        '水',
        '草'].includes(weapon.fumo)) {
        const elementMap = { '火': 1.6, '冰': 1.5, '雷': 1.8, '水': 1.4, '草': 1.5 };
        multiplier = elementMap[weapon.fumo] || 1.3;
        messages.push(`扩散${weapon.fumo}元素附魔,下次攻击转化成${weapon.fumo}元素伤害`);
      }

      result.damage = baseDamage * multiplier;
      // 注意：这里需要在调用处处理防御减少
    } else {
      result.damage = baseDamage * 1.3;
      messages.push('异界的仙力催动武器,触发苍古被动[抗争的践行之歌],伤害提升了30%');
    }
  }
}

/**
 * 处理湛卢武器效果
 */
function processZhanluWeapon(player, baseDamage, result, messages) {
  messages.push('触发特殊技能，获得50%生命加成，150%攻击加成');
  result.damage = baseDamage * 2.5;
  player.当前血量 *= 1.5;
}

/**
 * 处理终末嗟叹之诗武器效果
 */
function processZhongmoWeapon(weapon, attackerElement, baseDamage, random, result, messages) {
  if (random > 0.8) {
    messages.push('催动终末嗟叹之诗,释放风神之诗,恐怖的风龙卷慢慢的逼近对手');
    if (attackerElement === ELEMENTS.WIND) {
      let multiplier = 1.3;
      let defenseReduction = 0.7;

      if (weapon.fumo === '风') {
        multiplier = 1.4;
        defenseReduction = 0.4;
        messages.push('风元素附魔与其产生共鸣,终末被动[别离的思念之歌]');
      } else if (['火',
        '冰',
        '雷',
        '水',
        '草'].includes(weapon.fumo)) {
        const elementMap = { '火': 1.6, '冰': 1.5, '雷': 1.8, '水': 1.4, '草': 1.5 };
        multiplier = elementMap[weapon.fumo] || 1.3;
        messages.push(`扩散${weapon.fumo}元素附魔,下次攻击转化成${weapon.fumo}元素伤害`);
      }

      result.damage = baseDamage * multiplier;
      // 注意：这里需要在调用处处理防御减少
    } else {
      result.damage = baseDamage * 1.3;
      messages.push('异界的仙力催动武器,终末被动[别离的思念之歌],伤害提升了30%');
    }
  }
}

/**
 * 处理附魔书效果
 * @param {Object} equipment - 装备信息
 * @param {number} baseDamage - 基础伤害
 * @param {Object} player - 玩家信息
 * @param {number} random - 随机数
 * @param {Array} messages - 消息数组
 * @returns {Object} 附魔效果结果
 */
export function processEnchantmentEffects(equipment, baseDamage, player, random, messages) {
  const result = {
    damage: baseDamage,
    defenseBonus: 0,
    statusEffects: {
      freeze: false,
      burn: false
    }
  };

  // 处理武器附魔书
  if (equipment.武器?.fumo) {
    processWeaponEnchantments(equipment.武器.fumo, baseDamage, player, random, result, messages);
  }

  // 处理护具附魔书
  if (equipment.护具?.fumo) {
    processArmorEnchantments(equipment.护具.fumo, player, random, result, messages);
  }

  // 处理法宝附魔书
  if (equipment.法宝?.fumo) {
    processTreasureEnchantments(equipment.法宝.fumo, baseDamage, player, random, result, messages);
  }

  // 处理项链效果
  if (equipment.项链?.name) {
    processNecklaceEffects(equipment.项链, player, random, result, messages);
  }

  result.messages = messages;

  return result;
}

/**
 * 处理武器附魔书效果
 */
function processWeaponEnchantments(enchantment, baseDamage, player, random, result, messages) {
  // 锋利系列
  const sharpnessMatch = enchantment.match(/^锋利(\d)$/);
  if (sharpnessMatch && random > 0.8) {
    const level = parseInt(sharpnessMatch[1]);
    const multiplier = 1 + (level * 0.1);
    result.damage = baseDamage * multiplier;
    messages.push(`由于武器的附魔书属性是锋利${level},下次伤害提升${level * 10}%`);
    return;
  }

  // 横扫之刃系列
  const sweepingMatch = enchantment.match(/^横扫之刃(\d)$/);
  if (sweepingMatch && random > 0.8) {
    const level = parseInt(sweepingMatch[1]);
    const multiplier = level <= 3 ? 1 + (level * 0.1) : 1.3; // 4和5级都是1.3倍
    result.damage = baseDamage * multiplier;
    messages.push(`由于武器的附魔书属性是横扫之刃${level},下次伤害提升${Math.min(level * 10, 50)}%`);
    return;
  }

  // 力量系列
  const strengthMatch = enchantment.match(/^力量(\d)$/);
  if (strengthMatch && random > 0.8) {
    const level = parseInt(strengthMatch[1]);
    const multiplier = 1 + (level * 0.1);
    result.damage = baseDamage * multiplier;
    messages.push(`由于武器的附魔书属性是力量${level},下次伤害提升${level * 10}%`);
    return;
  }

  // 特殊附魔
  switch (enchantment) {
    case '斩首':
      result.damage = baseDamage * 1.5;
      messages.push('使用了斩首,冲向了对手,下次伤害提升50%');
      break;
    case '夏侯兄弟':
      if (random > 0.8) {
        result.damage = baseDamage * 1.5;
        messages.push('使用了箭震山河');
      } else {
        result.damage = baseDamage * 1.2;
        messages.push('使用了侵略如火');
      }
      break;
    case '江东霸王':
      if (random > 0.6 && random <= 0.8) {
        result.damage = baseDamage * 1.5;
        messages.push('使用了决机');
      } else if (random > 0.8) {
        result.damage = baseDamage * 1.5;
        messages.push('使用了火船摄阵,下次伤害提升了50%');
      } else {
        result.damage = baseDamage * 1.2;
        messages.push('使用了余音绕梁');
      }
      break;
  }
}

/**
 * 处理护具附魔书效果
 */
function processArmorEnchantments(enchantment, player, random, result, messages) {
  // 保护系列
  const protectionMatch = enchantment.match(/^保护(\d)$/);
  if (protectionMatch && random > 0.8) {
    const level = parseInt(protectionMatch[1]);
    const bonus = level * 0.1;
    result.defenseBonus += player.防御 * bonus;
    messages.push(`由于护具的附魔书属性是保护${level},下次防御提升${level * 10}%`);
    return;
  }

  // 特殊护具附魔
  switch (enchantment) {
    case '乱世枭雄':
      processLuanshiXiongxiong(player, random, result, messages);
      break;
    case '长板之龙':
      processChangbanLong(player, random, result, messages);
      break;
  }
}

/**
 * 处理法宝附魔书效果
 */
function processTreasureEnchantments(enchantment, baseDamage, player, random, result, messages) {
  // 生命吸收系列
  const lifeStealMatch = enchantment.match(/^生命吸收(\d)$/);
  if (lifeStealMatch && random > 0.8) {
    const level = parseInt(lifeStealMatch[1]);
    const drainPercent = level * 0.1;
    messages.push(`使用了生命吸收,对手${level * 10}%血量被吸取了`);
    // 注意：实际的血量操作需要在调用处处理
    return;
  }

  // 制衡天下系列
  const zhihengMatch = enchantment.match(/^制衡天下(\d)$/);
  if (zhihengMatch) {
    const level = parseInt(zhihengMatch[1]);
    processZhihengTianxia(level, player, result, messages);
    return;
  }

  // 特殊法宝附魔
  switch (enchantment) {
    case '天变之龙':
      processTianbianzLong(baseDamage, player, random, result, messages);
      break;
    case '赤壁奇谋':
      processChibiQimou(baseDamage, player, random, result, messages);
      break;
  }
}

/**
 * 处理项链效果
 */
function processNecklaceEffects(necklace, player, random, result, messages) {
  switch (necklace.name) {
    case '强石之链':
      if (random > 0.5) {
        result.statusEffects.freeze = true;
        messages.push('触发特殊技能，对方晕眩一回合');
      } else {
        messages.push('触发特殊技能,对方防御力降低50%');
        // 注意：防御降低需要在调用处处理
      }
      break;
    case '七七的项链':
      player.防御 *= 2;
      if (random > 0.33) {
        messages.push('【星神之域】从体内爆发出星神之域,77%概率免疫77%攻击伤害');
        player.防御 *= 1.77;
        // 注意：攻击减少需要在调用处处理
      }
      break;
  }
}

/**
 * 处理仙宠加成
 * @param {Object} pet - 仙宠信息
 * @param {Object} player - 玩家信息
 * @param {number} damage - 当前伤害
 * @param {number} random - 随机数
 * @param {Array} messages - 消息数组
 * @returns {Object} 仙宠加成结果
 */
export function processPetBonus(pet, player, damage, random, messages) {
  const result = {
    damage: damage,
    defenseBonus: 0,
    healthBonus: 0
  };

  if (!pet || pet.type !== '战斗') return result;

  if (random < 0.8) {
    const damageBonus = damage * pet.加成;
    const defenseBonus = player.防御 * pet.加成;
    const healthBonus = player.当前血量 * pet.加成;

    result.damage = damage + damageBonus;
    result.defenseBonus = defenseBonus;
    result.healthBonus = healthBonus;

    player.当前血量 *= (1 + pet.加成);

    messages.push(`仙宠【${pet.name}】辅佐了玩家，使其的伤害增加了[${damageBonus}]防御增加了[${defenseBonus}]血量增加了[${healthBonus}]`);
  }

  result.messages = messages;

  return result;
}

/**
 * 更新状态效果
 * @param {Object} statusData - 状态数据
 * @param {Object} reactions - 反应结果
 * @returns {Object} 更新后的状态数据
 */
export function updateStatusEffects(statusData, reactions) {
  const newStatus = { ...statusData };

  // 更新燃烧和感电状态
  if (reactions.statusEffects.burn || reactions.statusEffects.electro) {
    newStatus.gandianhuihe += 3;
  }

  // 更新超导状态
  if (reactions.statusEffects.superconduct) {
    newStatus.chaodaohuihe2 += 3;
  }

  // 更新冻结状态
  if (reactions.statusEffects.freeze) {
    newStatus.cnt += 1;
  }

  return newStatus;
}

// 辅助函数
function processLuanshiXiongxiong(player, random, result, messages) {
  if (random > 0.8) {
    messages.push('使用了火卦-星火燎原,下次伤害将转化成燃烧反应,下次伤害提升了100%');
    result.damage *= 2;
    result.statusEffects.burn = true;
  } else if (random > 0.3) {
    messages.push('使用了水卦-背水一战,双方血量同时减少20%');
    // 注意：血量减少需要在调用处处理
  } else {
    messages.push('使用了凤卦-变幻莫测,下次防御提升了30%');
    player.防御 *= 1.3;
  }
}

function processChangbanLong(player, random, result, messages) {
  if (random > 0.8) {
    messages.push('使用了长板之龙主动技能百鸟朝凤,下次伤害提升了100%');
    result.damage *= 2;
  } else {
    messages.push('使用了虎守,下次防御增加20%,血量增加20%');
    player.防御 *= 1.2;
    player.当前血量 += player.血量上限 * 0.2;
  }
}

function processZhihengTianxia(level, player, result, messages) {
  const healPercent = level * 0.1;
  messages.push(`使用了制衡天下,血量回复为满血,对手血量增加了${(6 - level)}%`);
  player.当前血量 = player.血量上限;
  // 注意：对手血量增加需要在调用处处理
}

function processTianbianzLong(baseDamage, player, random, result, messages) {
  if (random > 0.8) {
    messages.push('使用了八卦奇袭');
    result.damage = baseDamage * 2;
  } else if (random > 0.6) {
    messages.push('使用了十面之围');
    result.damage = baseDamage * 1.5;
  } else {
    messages.push('使用了虎守,下次防御增加20%,血量增加20%');
    player.防御 *= 1.2;
    player.当前血量 += player.血量上限 * 0.2;
  }
}

function processChibiQimou(baseDamage, player, random, result, messages) {
  if (random > 0.7) {
    messages.push('使用了赤壁奇谋主动技能炎龙冲阵,下次伤害转化成燃烧反应,伤害提升了50%');
    result.damage = baseDamage * 1.5;
    result.statusEffects.burn = true;
  } else {
    messages.push('使用了赤壁奇谋被动技能疾风烈火,下次伤害转化成燃烧扩散反应,伤害提升了20%');
    result.damage = baseDamage * 1.2;
    result.statusEffects.burn = true;
  }
}