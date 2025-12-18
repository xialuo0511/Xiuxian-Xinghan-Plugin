import { Combatant } from './Combatant.js';
import { loadItemConfig } from '../../model/ConfigLoader.js';

const allMonsters = Object.values(loadItemConfig('monsters.yaml') || {});

// 定义克制关系
const elementCounterMap = {
  '金': '木',
  '木': '土',
  '土': '水',
  '水': '火',
  '火': '金'
};
const COUNTER_BONUS = 1.5; // 克制伤害提升

const EFFECT_CONFIG = {
  'poison_dot': { name: '剧毒', is_debuff: true, icon: '☠️' },
  'burn_dot': { name: '灼烧', is_debuff: true, icon: '🔥' },
  'freeze': { name: '冰冻', is_debuff: true, icon: '❄️' },
  'curse_water': { name: '诅咒', is_debuff: true, icon: '💧' },
  'taunt': { name: '嘲讽', is_debuff: true, icon: '💢' },
  'stun': { name: '晕眩', is_debuff: true, icon: '💫' },
  'weakness': { name: '虚弱', is_debuff: true, icon: '📉' },
  'force_dmg_one': { name: '威压', is_debuff: true, icon: '🔻' },
  'speed_up_stack': { name: '战意', is_debuff: false, icon: '⚡' },
  'speed_up_talent': { name: '疾风', is_debuff: false, icon: '💨' },
  'damage_up_stack': { name: '锋锐', is_debuff: false, icon: '⚔️' },
  'shield': { name: '护盾', is_debuff: false, icon: '🛡️' },
  'atk_up': { name: '攻击↑', is_debuff: false, icon: '⚔️' },
  'def_up': { name: '防御↑', is_debuff: false, icon: '🛡️' },
  'heal_over_time': { name: '再生', is_debuff: false, icon: '🌿' }
};

/**
 * 战斗引擎 (Action Value System / 跑条制)
 * v4.0: 全面适配玩家PVP与星魂PVE
 */
export async function runCombat(playerSouls, enemyNames, globalBuffs = [], maxRounds = 100) {
  const combatLog = [];

  // 1. 初始化战斗单位
  // 支持传入已经是 Player 对象的数据，或者星魂配置对象
  const playerTeam = playerSouls.map((soul, i) => {
      const c = new Combatant(soul.id || `player_${i + 1}`, soul, 'player');
      // 使用 soul 中预处理好的 global_buffs (存放的是 type，如 damage_up_turn)
      // 而不是传入的 globalBuffs (存放的是 ID，如 damage_up_stack_turn)
      c.global_buffs = soul.global_buffs || []; 
      return c;
  });

  // 敌人同理，如果是字符串则查表，如果是对象则直接用
  const enemyTeam = enemyNames.map((item, i) => {
    if (typeof item === 'string') {
      return new Combatant(`enemy_${i + 1}`, allMonsters.find(m => m.name === item), 'enemy');
    } else {
      return new Combatant(item.id || `enemy_${i + 1}`, item, 'enemy');
    }
  }).filter(Boolean);

  const allCombatants = [...playerTeam,
    ...enemyTeam];

  // 2. 初始化行动值 & 技能 & 战斗开始Buff
  const shieldTargets = [];
  const energyTargets = [];
  
  allCombatants.forEach(c => {
    c.resetAV();
    if (!c.source.skill) {
      c.source.skill = generateDefaultSkill(c);
    }
    
    // ★★★ 存护壁垒 (战斗开始护盾)
    if (c.global_buffs && c.global_buffs.includes('shield_start')) {
        const shieldAmt = Math.floor(c.max_hp * 0.30);
        c.addShield(shieldAmt);
        shieldTargets.push({
            name: c.name, team: c.team, element: c.element, id: c.id,
            type: 'shield', value: shieldAmt, value_display: `(壁垒)${formatNumber(shieldAmt)}`, is_counter: false
        });
    }
    
    // ★★★★ 天道·神力灌注 (战斗开始满能)
    if (c.global_buffs && c.global_buffs.includes('max_energy_start')) {
        const energyAdd = c.max_energy;
        c.addEnergy(energyAdd);
        energyTargets.push({
            name: c.name, team: c.team, element: c.element, id: c.id,
            type: 'heal', value: 0, value_display: '(充能)MAX', is_counter: false // 使用 heal 类型显示绿色文本
        });
    }
    
    // ★★★ 盾灵·戊土 (初始满能)
    if (c.source.initial_energy) {
        c.addEnergy(c.source.initial_energy);
        energyTargets.push({
            name: c.name, team: c.team, element: c.element, id: c.id,
            type: 'heal', value: 0, value_display: '(充能)MAX', is_counter: false
        });
    }
  });

  combatLog.push({ type: 'start', text: '战斗开始！' });

  // 插入存护壁垒日志
  if (shieldTargets.length > 0) {
      combatLog.push({
          type: 'action',
          skill: '存护壁垒', 
          av_cost: 0,
          caster: { name: '天机赐福', team: 'system', element: '无', id: 'system' },
          targets: shieldTargets,
          teamStatus: {
              player: playerTeam.map(getUnitStatus),
              enemy: enemyTeam.map(getUnitStatus)
          }
      });
  }
  
  // 插入神力灌注日志
  if (energyTargets.length > 0) {
      combatLog.push({
          type: 'action',
          skill: '神力灌注', 
          av_cost: 0,
          caster: { name: '天机赐福', team: 'system', element: '无', id: 'system' },
          targets: energyTargets,
          teamStatus: {
              player: playerTeam.map(getUnitStatus),
              enemy: enemyTeam.map(getUnitStatus)
          }
      });
  }

  let totalElapsedAV = 0;
  let actionCount = 0;
  let loopCount = 0; // 防止死循环
  let roundCount = 1;

  combatLog.push({ type: 'turn', text: `--- 第 ${roundCount} 回合 ---` });

  // 3. 战斗循环
      while (playerTeam.some(p => p.isAlive()) && enemyTeam.some(e => e.isAlive())) {
        // --- 0. 终结技检测 (插队) - 仅限玩家 ---
        const potentialUlters = allCombatants.filter(u => u.isAlive() && u.canCastUltimate() && u.team === 'player');
        if (potentialUlters.length > 0) {
            potentialUlters.sort((a, b) => b.speed - a.speed);
            const ultingUnit = potentialUlters[0];
            const skillConfig = ultingUnit.skills.ultimate;
            const friendlyTeam = (ultingUnit.team === 'player') ? playerTeam : enemyTeam;
            const hostileTeam = (ultingUnit.team === 'player') ? enemyTeam : playerTeam;

            combatLog.push({ type: 'system', text: `★ 【${ultingUnit.name}】 能量满溢，释放终结技：${skillConfig.name}！` });

            const { skillResults, debuffsApplied } = executeSkill(ultingUnit, skillConfig, friendlyTeam, hostileTeam);
            ultingUnit.energy -= skillConfig.energy_cost;

            debuffsApplied.forEach(d => {
                const targetUnit = allCombatants.find(c => c.id === d.id);
                if (targetUnit && skillConfig.debuff) {
                    targetUnit.applyDebuff({
                        type: skillConfig.debuff.type,
                        caster_id: d.caster_id,
                        duration: skillConfig.debuff.duration,
                        value: skillConfig.debuff.value
                    });
                }
            });

            combatLog.push({
                type: 'ultimate',
                skill: skillConfig.name,
                caster: { name: ultingUnit.name, team: ultingUnit.team, element: ultingUnit.element, level: ultingUnit.level || 0, id: ultingUnit.id },
                targets: skillResults,
                teamStatus: { player: playerTeam.map(getUnitStatus), enemy: enemyTeam.map(getUnitStatus) }
            });
            continue;
        }

        loopCount++;
    if (loopCount > 1000) {
      combatLog.push({ type: 'system', text: '战斗僵持过久，强制结束。' });
      break;
    }

    // 3.1 寻找 Next Actor
    const aliveUnits = allCombatants.filter(c => c.isAlive());
    if (aliveUnits.length === 0) break;

    aliveUnits.sort((a, b) => a.current_av - b.current_av);
    const activeUnit = aliveUnits[0];

    // ★★★ 锋锐之气 (回合开始增伤 - 叠加)
    if (activeUnit.global_buffs && activeUnit.global_buffs.includes('damage_up_turn')) {
        activeUnit.applyDebuff({
            type: 'damage_up_stack', 
            caster_id: activeUnit.id,
            duration: 99,
            value: 1 
        });
        
        // 增加触发日志 (改为 system 避免显示为独立行动)
        combatLog.push({
            type: 'system',
            text: `${activeUnit.name} 触发【锋锐之气】，伤害提升 5% (当前 ${activeUnit.active_debuffs.find(d=>d.type==='damage_up_stack')?.value || 0} 层)`
        });
    }

    // 结算 activeUnit 的 Debuff (如毒)
    const debuffResults = activeUnit.processDebuffs();
    if (debuffResults.length > 0) {
      combatLog.push({
        type: 'action',
        skill: '状态结算', // 复用 action 模板，显示技能名为“状态结算”
        av_cost: 0, // 状态结算不消耗 AV
        caster: {
          name: activeUnit.name,
          team: activeUnit.team,
          element: activeUnit.element,
          level: activeUnit.level || 0,
          id: activeUnit.id
        },
        targets: debuffResults,
        teamStatus: { // 需要补充状态快照，否则模板渲染可能会报错或显示空白
            player: playerTeam.map(getUnitStatus),
            enemy: enemyTeam.map(getUnitStatus)
        }
      });
    }

    // 检查是否因 Debuff 死亡 (防止尸体行动)
    if (!activeUnit.isAlive()) {
        combatLog.push({ type: 'die', name: activeUnit.name, text: `${activeUnit.name} 倒下了。` });
        continue;
    }

    const elapsedAV = activeUnit.current_av;

    // 3.2 时间流逝
    aliveUnits.forEach(unit => {
      unit.current_av -= elapsedAV;
      if (unit.current_av < 0.0001) unit.current_av = 0;
    });

    totalElapsedAV += elapsedAV;
    
    // 只有当时间真正流逝时，才计入行动轮次
    if (elapsedAV > 0) {
        actionCount++;
    
            // 基于 HSR 机制的回合计数: 首轮 150 AV，后续每轮 100 AV
            let currentRoundByAV = 1;
            if (totalElapsedAV > 150) {
                currentRoundByAV = 1 + Math.ceil((totalElapsedAV - 150) / 100);
            }
        
                if (currentRoundByAV > roundCount) {
        
                  roundCount = currentRoundByAV;
        
                  
        
                  if (roundCount > maxRounds) {
        
                      combatLog.push({ type: 'system', text: `已超过最大回合数 (${maxRounds})，判定失败！` });
        
                      break;
        
                  }
        
            
        
                  combatLog.push({ type: 'turn', text: `--- 第 ${roundCount} 回合 ---` });
        
                }    }

        // 检查控制状态 (如冰冻/晕眩)
        if (activeUnit.is_frozen || activeUnit.is_stunned) {
            const reason = activeUnit.is_frozen ? '被冰冻' : '被晕眩';
            const type = activeUnit.is_frozen ? 'freeze' : 'stun';
            combatLog.push({
                type: 'skipped',
                reason: reason,
                skip_type: type,
                av_cost: Math.floor(elapsedAV),
                caster: {
                    name: activeUnit.name,
                    team: activeUnit.team,
                    element: activeUnit.element,
                    level: activeUnit.level || 0,
                    id: activeUnit.id
                },
                teamStatus: {
                  player: playerTeam.map(getUnitStatus),
                  enemy: enemyTeam.map(getUnitStatus)
                }
            });
            activeUnit.resetAV();
            continue;
        }
    // --- 行动逻辑 ---
    let skillConfig = null;
    let isUltimate = false;

    // 优先释放终结技 (敌我通用)
    if (activeUnit.canCastUltimate()) {
        skillConfig = activeUnit.skills.ultimate;
        activeUnit.energy -= skillConfig.energy_cost;
        isUltimate = true;
        combatLog.push({ type: 'system', text: `★ 【${activeUnit.name}】 积蓄已久，释放终结技：${skillConfig.name}！` });
        
        // ★★★ 剑魂·庚金 (大招回能)
        if (activeUnit.global_buffs && activeUnit.global_buffs.includes('soul_enhancement_gengjin')) {
            activeUnit.addEnergy(60);
            combatLog.push({ type: 'system', text: `触发【剑魂·庚金】，${activeUnit.name} 额外恢复 60 点能量！` });
        }
    } else {
        skillConfig = activeUnit.skills.basic;
    }

    if (!skillConfig) {
         // 容错：如果没有配置普通攻击，尝试使用旧格式
         skillConfig = activeUnit.source.skill;
    }
    
    if (!skillConfig) {
         // 再次容错：跳过
         activeUnit.resetAV();
         continue;
    }

    const friendlyTeam = (activeUnit.team === 'player') ? playerTeam : enemyTeam;
    const hostileTeam = (activeUnit.team === 'player') ? enemyTeam : playerTeam;

    const { skillResults, debuffsApplied, extraDetails } = executeSkill(activeUnit, skillConfig, friendlyTeam, hostileTeam, isUltimate);
    
    // 行动回复能量
    activeUnit.addEnergy(activeUnit.energy_regen || 20);

    // 应用 Debuff
    debuffsApplied.forEach(d => {
      const targetUnit = allCombatants.find(c => c.id === d.id);
      if (targetUnit) {
        // 从原始技能配置中获取debuff的完整参数，因为debuffsApplied只包含日志信息
        const debuffConfig = skillConfig.debuff;
        if (debuffConfig) {
          targetUnit.applyDebuff({
            type: debuffConfig.type,
            caster_id: d.caster_id,
            duration: debuffConfig.duration,
            value: debuffConfig.value
          });
        }
      }
    });

    // 被动技能触发
    const passiveDetails = [];
    if (activeUnit.passive_skills) {
      activeUnit.passive_skills.forEach(skill => {
        if (skill.type === 'heal_turn') {
           const healAmt = Math.floor(activeUnit.max_hp * skill.value);
           if (healAmt > 0) {
             const actualHeal = activeUnit.receiveHeal(healAmt);
             const pName = skill.name || '被动';
             passiveDetails.push(`触发【${pName}】，生命值+${actualHeal}`);
           }
        } else if (skill.type === 'speed_up_on_action') {
            if (activeUnit.addSpeedStack) {
                let speedVal = skill.value;
                // ★★★ 剑魂·庚金 (速度天赋翻倍)
                if (activeUnit.global_buffs && activeUnit.global_buffs.includes('soul_enhancement_gengjin')) {
                    speedVal *= 2;
                }
                activeUnit.addSpeedStack(speedVal, 1, 'speed_up_talent');
                const pName = skill.name || '被动';
                const speedIncrease = (speedVal * 100).toFixed(0);
                passiveDetails.push(`触发【${pName}】，速度提高${speedIncrease}%`);
            }
        } else if (skill.type === 'heal_turn_end') {
             // 寻找目标：生命值最低的友方 (target='lowest_hp_ally')
             // 注意：这里简单实现，假设 target 总是 lowest_hp_ally，如果需要支持更多 target 类型，需扩展
             const team = (activeUnit.team === 'player') ? playerTeam : enemyTeam;
             const allies = team.filter(u => u.isAlive());
             if (allies.length > 0) {
                 // 按血量百分比排序 (升序)
                 allies.sort((a, b) => (a.current_hp / a.max_hp) - (b.current_hp / b.max_hp));
                 const target = allies[0];
                 
                 let baseHeal = 0;
                 if (skill.value_type === 'atk') {
                     baseHeal = activeUnit.attack * skill.value;
                 } else {
                     baseHeal = activeUnit.max_hp * skill.value; // 默认按最大生命值
                 }
                 
                 const healAmt = Math.floor(baseHeal);
                 if (healAmt > 0) {
                     const actualHeal = target.receiveHeal(healAmt);
                     const pName = skill.name || '被动';
                     passiveDetails.push(`触发【${pName}】，${target.name} 回复 ${actualHeal}`);
                 }
             }
        }
      });
    }

    // 合并主动技能结果和 Debuff 结果
    const allActionResults = [...skillResults,
      ...debuffsApplied];
      
    // 合并详细文本 (被动 + 技能副作用)
    const allDetails = [...passiveDetails, ...(extraDetails || [])];

    // 3.4 记录日志
    if (allActionResults.length > 0 || allDetails.length > 0) {
      combatLog.push({
        details: allDetails,
        type: isUltimate ? 'ultimate' : 'action',
        is_extra_turn: activeUnit.is_extra_turn_pending,
        av_cost: Math.floor(elapsedAV),
        skill: skillConfig.name,
        caster: {
          name: activeUnit.name,
          team: activeUnit.team,
          element: activeUnit.element,
          level: activeUnit.level || 0,
          id: activeUnit.id
        },
        targets: allActionResults,
        teamStatus: {
          player: playerTeam.map(getUnitStatus),
          enemy: enemyTeam.map(getUnitStatus)
        }
      });
      
      if (activeUnit.is_extra_turn_pending) activeUnit.is_extra_turn_pending = false;
    }

    activeUnit.resetAV();

    // ★★ 风驰电掣 (首轮再动)
    if (activeUnit.global_buffs && activeUnit.global_buffs.includes('double_act')) {
        if (!activeUnit.has_acted_once) {
            activeUnit.has_acted_once = true;
            activeUnit.current_av = 0; // 立即再次行动
            activeUnit.is_extra_turn_pending = true;
            combatLog.push({ type: 'system', text: `${activeUnit.name} 触发【风驰电掣】，迅捷如风，再次行动！` });
        }
    } else {
        activeUnit.has_acted_once = true;
    }
    
    // ★★★ 咒师·壬水 (连击)
    if (activeUnit.global_buffs && activeUnit.global_buffs.includes('soul_enhancement_renshui')) {
        if (!activeUnit.is_extra_turn_pending && Math.random() < 0.2) {
             activeUnit.is_extra_turn_pending = true;
             activeUnit.current_av = 0;
             combatLog.push({ type: 'system', text: `触发【咒师·壬水】，${activeUnit.name} 法术连发，再次行动！` });
        }
    }
  }

  const playerWon = playerTeam.some(p => p.isAlive()) && roundCount <= maxRounds;
  combatLog.push({ type: 'end', text: playerWon ? '恭喜你，获得了胜利！' : '很遗憾，你失败了。' });

  return { playerWon, log: combatLog, playerTeam, enemyTeam };
}

/**
 * 技能执行器
 */
function executeSkill(caster, skill, friendlyTeam, hostileTeam, isUltimate = false) {
  let targets = [];
  const results = [];
  const extraDetails = []; // 额外详细文本
  const aliveHostiles = hostileTeam.filter(u => u.isAlive());
  const aliveFriendlies = friendlyTeam.filter(u => u.isAlive());

  if (aliveHostiles.length === 0 && skill.type === 'damage') return { skillResults: [], debuffsApplied: [], extraDetails: [] };

  switch (skill.target) {
    case 'single_enemy':
      const t = selectTargetByTaunt(aliveHostiles, caster.id);
      if (t) targets.push(t);
      break;
    case 'all_enemies':
      targets = aliveHostiles;
      break;
    case 'lowest_hp_enemy':
      targets = aliveHostiles.sort((a, b) => (a.current_hp / a.max_hp) - (b.current_hp / b.max_hp)).slice(0, 1);
      break;
    case 'lowest_hp_ally':
      targets = aliveFriendlies.sort((a, b) => (a.current_hp / a.max_hp) - (b.current_hp / b.max_hp)).slice(0, 1);
      break;
    case 'all_allies':
      targets = aliveFriendlies;
      break;
    default:
      const defT = selectTargetByTaunt(aliveHostiles, caster.id);
      if (defT) targets.push(defT);
      break;
  }

  if (targets.length === 0) return { skillResults: [], debuffsApplied: [], extraDetails: [] };

  // ★★★ 孤注一掷 (少敌增伤)
  let focusBonus = 1.0;
  if (caster.global_buffs && caster.global_buffs.includes('aoe_focus_damage')) {
      if (skill.target === 'all_enemies' && targets.length <= 2) {
          focusBonus = 2.0;
      }
  }

  for (const target of targets) {
    let baseValue = 0;
    if (skill.value_type === 'def') baseValue = caster.defense * skill.value;
    else if (skill.value_type === 'max_hp') baseValue = caster.max_hp * skill.value;
    else baseValue = caster.attack * skill.value;
    
    baseValue *= focusBonus; // 应用增伤

    if (skill.type === 'damage') {
      const res = calculateDamage(caster, target, baseValue);
      results.push(res);
      
      // 处理受击回血反馈
      if (res.heal_back > 0) {
          results.push({
              name: res.name, team: res.team, element: res.element, level: res.level || 0,
              id: res.id,
              type: 'heal', 
              value: res.heal_back, 
              value_display: `(守护)${formatNumber(res.heal_back)}`, 
              is_counter: false
          });
      }
      
      // 处理反弹伤害反馈
      if (res.reflected_damage > 0) {
          results.push({
              name: caster.name, team: caster.team, element: caster.element, level: caster.level || 0,
              id: caster.id,
              type: 'reflected_damage', // 新增类型：反弹伤害
              value: res.reflected_damage,
              value_display: formatNumber(res.reflected_damage), // 不带负号，由渲染决定
              is_counter: false
          });
      }
      
      // ★ 激流勇进 (受击加速)
      if (target.global_buffs && target.global_buffs.includes('speed_up_on_hit')) {
          if (target.addSpeedStack) {
             target.addSpeedStack(0.05, 1, 'speed_up_stack');
             extraDetails.push(`触发【激流勇进】，${target.name} 速度+5%`);
          }
      }
      
      // ★★★ 杀意沸腾 (击杀增伤)
      if (res.hp_remaining <= 0 && caster.global_buffs && caster.global_buffs.includes('damage_up_on_kill')) {
          // 20% = 4层 damage_up_stack (每层5%)
          caster.applyDebuff({
              type: 'damage_up_stack',
              caster_id: caster.id,
              duration: 99,
              value: 4 
          });
          extraDetails.push(`触发【杀意沸腾】，${caster.name} 伤害+20%`);
      }
    } else if (skill.type === 'heal') {
      const healed = target.receiveHeal(Math.floor(baseValue));
      results.push({
        name: target.name, team: target.team, element: target.element, level: target.level || 0,
        id: target.id,
        type: 'heal', value: healed, value_display: formatNumber(healed), is_counter: false
      });
    } else if (skill.type === 'shield') {
      target.addShield(Math.floor(baseValue));
      results.push({
        name: target.name,
        team: target.team,
        element: target.element,
        level: target.level || 0,
        id: target.id,
        type: 'shield',
        value: Math.floor(baseValue),
        value_display: formatNumber(Math.floor(baseValue)),
        is_counter: false
      });
      
      // ★ 自身额外护盾 (盾灵·戊土)
      if (skill.self_extra_shield_ratio && target.id === caster.id) {
          const extraShield = Math.floor(baseValue * skill.self_extra_shield_ratio);
          caster.addShield(extraShield);
          results.push({
              name: caster.name, team: caster.team, element: caster.element, level: caster.level || 0,
              id: caster.id,
              type: 'shield',
              value: extraShield,
              value_display: `(加固)${formatNumber(extraShield)}`,
              is_counter: false
          });
      }
      
      // ★ 春风化雨 (可叠加)
      const healCount = (caster.global_buffs || []).filter(b => b === 'shield_heal').length;
      if (healCount > 0) {
          const healAmt = Math.floor(baseValue * 0.15 * healCount);
          const healed = target.receiveHeal(healAmt);
          results.push({
              name: target.name, team: target.team, element: target.element, level: target.level || 0,
              id: target.id,
              type: 'heal', value: healed, value_display: `(盾愈)${formatNumber(healed)}`, is_counter: false
          });
      }
    }
  }

  // ★★★ 药仙·乙木 (大招额外奶)
  if (isUltimate && caster.global_buffs && caster.global_buffs.includes('soul_enhancement_yimu')) {
      const allies = friendlyTeam.filter(u => u.isAlive());
      if (allies.length > 0) {
          allies.sort((a, b) => (a.current_hp / a.max_hp) - (b.current_hp / b.max_hp));
          const target = allies[0];
          const healed = target.receiveHeal(200);
          results.push({
              name: target.name, team: target.team, element: target.element, level: target.level || 0,
              id: target.id,
              type: 'heal', value: healed, value_display: `(乙木)${formatNumber(healed)}`, is_counter: false
          });
      }
  }

    // 处理Debuff
    const debuffsApplied = [];

    // ★★★ 破势重压 (攻击施加虚弱 - 可叠加持续时间)
    const weaknessCount = (caster.global_buffs || []).filter(b => b === 'weakness_on_hit').length;
    if (skill.type === 'damage' && weaknessCount > 0) {
        targets.forEach(t => {
            if (!t.isAlive()) return;
            debuffsApplied.push({
                name: t.name, team: t.team, element: t.element, level: t.level || 0,
                id: t.id,
                type: 'debuff_application',
                debuff_type: 'weakness',
                caster_id: caster.id,
                value: 0,
                value_display: `📉 虚弱 (${weaknessCount}回合)`,
                duration: 1 * weaknessCount,
                is_counter: false,
                is_debuff: true
            });
        });
    }

    if (skill.debuff) {

        // 确定Debuff目标

        let debuffTargets = [];

        // 如果配置显式指定了目标类型，则按配置选

        if (skill.debuff.target === 'all_enemies') {

            debuffTargets = hostileTeam.filter(u => u.isAlive());

        } 

        // 否则默认跟随技能的主要目标

        else {

            debuffTargets = targets;

        }

  

        debuffTargets.forEach(debuffTarget => {

            // 嘲讽特殊处理 (直接生效，不走applyDebuff通用流程？或者通用流程也处理？)

            // 为了统一，我们在 runCombat 的循环里统一 applyDebuff

            // 这里只负责生成“意图”

            if (skill.debuff.type === 'taunt') {

                debuffTarget.setTaunted(caster.id);

            }

  

            const effectConfig = EFFECT_CONFIG[skill.debuff.type] || { name: skill.debuff.type, is_debuff: true };

            

            debuffsApplied.push({

                name: debuffTarget.name, team: debuffTarget.team, element: debuffTarget.element, level: debuffTarget.level || 0,

                id: debuffTarget.id, 

                type: 'debuff_application', // 标记为状态施加

                debuff_type: skill.debuff.type, 

                caster_id: caster.id,

                value: 0,

                value_display: `${effectConfig.is_debuff ? '😈' : '✨'} ${effectConfig.name} (${skill.debuff.duration}回合)`,

                duration: skill.debuff.duration,

                is_counter: false,

                is_debuff: effectConfig.is_debuff

            });

        });

    }

  return { skillResults: results, debuffsApplied, extraDetails };
}

/**
 * 伤害计算逻辑 (自适应公式)
 */
function calculateDamage(attacker, target, rawDamageInput) {
  let elementalBonus = 1.0;
  let isCounter = false;
  let globalMultiplier = 1.0;
  let reflectedDamage = 0; // 新增：记录反弹伤害

  // 克制判断
  if (elementCounterMap[attacker.element] === target.element) {
    elementalBonus = COUNTER_BONUS; // 1.5
    isCounter = true;
  }


  // 元素增伤 Buff
  if (attacker.elemental_buffs && attacker.elemental_buffs[attacker.element]) {
    elementalBonus += attacker.elemental_buffs[attacker.element];
  }

  // --- 全局 Buff/Debuff 处理 ---
  const attackerBuffs = attacker.global_buffs || [];
  
  // ★ 锋锐之气 (回合叠加)
  if (attacker.active_debuffs) {
      const sharpStacks = attacker.active_debuffs.filter(d => d.type === 'damage_up_stack').reduce((acc, d) => acc + d.value, 0);
      if (sharpStacks > 0) {
          globalMultiplier += 0.05 * sharpStacks;
      }
  }
  
  // ★ 击破特攻 (克制增伤)
  if (isCounter && attackerBuffs.includes('break_effect')) {
      globalMultiplier += 0.20;
  }
  // 击破特攻 (基础增伤)
  if (attackerBuffs.includes('break_effect')) {
      globalMultiplier += 0.10;
  }
  
  // ★★★ 绝境爆发 (可叠加)
  const burstCount = attackerBuffs.filter(b => b === 'low_hp_burst').length;
  if (burstCount > 0) {
      const hpPct = attacker.current_hp / attacker.max_hp;
      let burstBonus = 0;
      if (hpPct < 0.3) burstBonus = 1.5;
      else if (hpPct < 0.5) burstBonus = 1.0;
      else if (hpPct < 0.7) burstBonus = 0.5;
      
      globalMultiplier += burstBonus * burstCount;
  }

  // ★★★★ 修罗·血海魔躯
  if (attackerBuffs.includes('rainbow_vampire')) {
      globalMultiplier += 0.60;
  }
  
  // Debuff: 虚弱 (输出降低)
  if (attacker.active_debuffs && attacker.active_debuffs.some(d => d.type === 'weakness')) {
      globalMultiplier *= 0.5;
  }
  
            // Debuff: 虚弱 (承伤增加)
            if (target.active_debuffs && target.active_debuffs.some(d => d.type === 'weakness')) {
                globalMultiplier *= 1.2;
            }
  
            // --- 暴击判定 ---
            let isCrit = false;
            // 基础暴击率 + Buff修正(如果有)
            const critRate = attacker.crit_rate || 0; 
            if (Math.random() < critRate) {
                isCrit = true;
                globalMultiplier *= (attacker.crit_dmg || 1.5);
            }
  
              
  
                        let finalDmg = 0;  // 【核心优化】自适应伤害公式
  
              if (attacker.attack > 10000) {
  
                let def = target.defense * (1 - target.resistance);
  
                let baseDiff = rawDamageInput - def;
  
                let minDmg = rawDamageInput * 0.05;
  
                let baseDmg = Math.max(baseDiff, minDmg);
  
                
  
                // 应用全局倍率
  
                finalDmg = Math.floor(baseDmg * elementalBonus * globalMultiplier * (0.9 + Math.random() * 0.2));
  
              }
  
              else {
  
                const DEF_CONSTANT = 280;
  
                let defenseMultiplier = DEF_CONSTANT / (DEF_CONSTANT + target.defense);
  
                let resistanceMultiplier = (1 - target.resistance);
  
                let baseDmg = rawDamageInput * defenseMultiplier * resistanceMultiplier;
  
                
  
                // 应用全局倍率
  
                finalDmg = Math.floor(baseDmg * elementalBonus * globalMultiplier * (0.9 + Math.random() * 0.2));
  
              }
  
            
  
                            // Debuff: 威压 (伤害强制为1)
                            if (attacker.active_debuffs && attacker.active_debuffs.some(d => d.type === 'force_dmg_one')) {
                                finalDmg = 1;
                            } else {
                                finalDmg = Math.max(1, finalDmg);
                            }
  
            
  
              
  
            
  
                            // ★★★ 咒师·壬水 (减伤)
  
            
  
                            if (target.global_buffs && target.global_buffs.includes('soul_enhancement_renshui')) {
  
            
  
                                finalDmg = Math.floor(finalDmg * 0.8);
  
            
  
                            }
  
            
  
              
  
            
  
                            // ★★★ 炎君·丙火 (名刀)
  
            
  
                            if (target.global_buffs && target.global_buffs.includes('soul_enhancement_binghuo')) {
  
            
  
                                if (target.current_hp <= finalDmg && !target.has_triggered_binghuo) {
  
            
  
                                    finalDmg = Math.max(0, target.current_hp - 1);
  
            
  
                                    target.has_triggered_binghuo = true;
  
            
  
                                    target.current_av = 0; // 立即行动
  
            
  
                                }
  
            
  
                            }
  
            
  
                          
  
            
  
                            // ★ 受击回能
  
            
  
                            target.addEnergy(10);
  
            
  
              const hpDamage = target.takeDamage(finalDmg);
  
  // ★ 盾灵天赋 (受击回血)
  let healBack = 0;
  if (target.source?.skill?.talent?.effect === 'taunt_up_heal') {
      const ratio = target.source.skill.talent.heal_ratio || 0.05;
      healBack = Math.floor(hpDamage * ratio);
      if (healBack > 0) target.receiveHeal(healBack);
  }
  
  // ★★★★ 修罗·血海魔躯 (吸血)
  if (attackerBuffs.includes('rainbow_vampire')) {
      attacker.receiveHeal(Math.floor(finalDmg));
  }
  
  // ★★★★ 天道·因果报应 (反伤)
  if (target.global_buffs && target.global_buffs.includes('rainbow_thorns')) {
      reflectedDamage = Math.floor(finalDmg * 1.2);
      attacker.takeDamage(reflectedDamage);
  }

  return {
    name: target.name,
    team: target.team,
    element: target.element,
    level: target.level || 0,
    id: target.id,
    type: 'damage',
    value: hpDamage,
    value_display: formatNumber(finalDmg), // 显示总伤害 (含护盾吸收)
    is_counter: isCounter,
    is_crit: isCrit,
    hp_remaining: target.current_hp,
    hp_max: target.max_hp,
    shield_remaining: target.shield,
    is_dead: !target.isAlive(),
    heal_back: healBack, // 返回回血量供日志显示
    reflected_damage: reflectedDamage // 返回反弹伤害量供日志显示
  };
}

function selectTargetByTaunt(candidates, casterId) {
  // 优先选择被当前施法者嘲讽的敌人
  // 注意：这里需要确保嘲讽者仍然存活，且目标是被活着的嘲讽者嘲讽
  const tauntedTargets = candidates.filter(c => c.isTaunted() && c.taunted_by_id === casterId);
  if (tauntedTargets.length > 0) {
    // 如果有多个被嘲讽，仍然按 taunt 值选择最高嘲讽度的那个 (虽然理论上只能被一个嘲讽)
    tauntedTargets.sort((a, b) => b.taunt - a.taunt);
    return tauntedTargets[0];
  }

  // 如果没有被当前施法者嘲讽的敌人，则按正常逻辑选择 taunt 值最高的敌人
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.taunt - a.taunt); // Taunt值最高的优先
  return candidates[0];
}

const getUnitStatus = (unit) => {
  const max_hp = unit.max_hp > 0 ? unit.max_hp : 1;
  const current_hp = unit.current_hp || 0;
  let hp_percent = (current_hp / max_hp) * 100;
  let shield_percent = (unit.shield / max_hp) * 100;

  // 映射 Buff/Debuff
  const effects = (unit.active_debuffs || []).map(d => {
      const config = EFFECT_CONFIG[d.type] || { name: d.type, is_debuff: true, icon: '❓' };
      
      let isStackable = false;
      let stackCount = 0;
      
      // 标记可叠加的 Buff 类型
      if (d.type === 'speed_up_stack' || d.type === 'speed_up_talent') {
          isStackable = true;
          stackCount = d.value;
      }
      
      return {
          type: d.type,
          name: config.name,
          icon: config.icon,
          duration: d.duration,
          is_debuff: config.is_debuff,
          is_stackable: isStackable,
          stack_count: stackCount
      };
  });
  
  // 能量状态
  const energy = unit.energy || 0;
  const max_energy = unit.max_energy || 100;
  const energy_percent = (energy / max_energy) * 100;

  // 如果有护盾，也视为一种状态
  if (unit.shield > 0) {
      effects.push({ type: 'shield', name: '护盾', icon: '🛡️', duration: '∞', is_debuff: false });
  }

  return {
    name: unit.name,
    hp: current_hp,
    max_hp: unit.max_hp,
    hp_display: formatNumber(current_hp),
    max_hp_display: formatNumber(unit.max_hp),
    shield: unit.shield,
    hp_percent: parseFloat(hp_percent.toFixed(1)),
    shield_percent: parseFloat(shield_percent.toFixed(1)),
    energy,
    max_energy,
    energy_percent: parseFloat(energy_percent.toFixed(1)),
    effects: effects
  };
};

function formatNumber(num) {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  return Math.floor(num).toString();
}

/**
 * 默认技能生成 (适配玩家)
 */
function generateDefaultSkill(unit) {
  const element = unit.element;
  const nameMap = {
    '金': '万剑归宗',
    '木': '枯木逢春', // 注意：下面逻辑暂未适配治疗，默认全是 damage
    '水': '惊涛骇浪',
    '火': '烈焰焚天',
    '土': '泰山压顶',
    '无': '普通攻击'
  };

  // 如果是木系，我们给一个特殊逻辑？
  // 暂时全部输出，因为PVP主要是对打

  return {
    name: nameMap[element] || '普通攻击',
    type: 'damage',
    target: 'single_enemy',
    value_type: 'atk',
    value: 1.2
  };
}