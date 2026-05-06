import { loadSystemConfig } from '../model/ConfigLoader.js';

const CONFIG_FILE = 'summer_mini_events.yaml';
const EVENT_KEY_PREFIX = 'XinghanXiuxian:SummerMiniEvent';

let cachedConfig = null;
let dal = null;
let rewardGrant = defaultGrantActivityReward;

async function getDal() {
  if (dal) return dal;
  return import('../api/data-access.js');
}

async function defaultGrantActivityReward(userId, reward) {
  const rewardLogic = await import('./activity_reward_logic.js');
  return rewardLogic.grantActivityReward(userId, reward);
}

function loadConfig() {
  if (!cachedConfig) {
    cachedConfig = loadSystemConfig(CONFIG_FILE);
  }
  return cachedConfig;
}

function getEvents() {
  const config = loadConfig();
  return Array.isArray(config?.events) ? config.events : [];
}

function parseTime(value) {
  return value ? new Date(value).getTime() : 0;
}

function toDateString(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeNow(now) {
  if (!now) return new Date();
  return now instanceof Date ? now : new Date(now);
}

function eventState(event, now = new Date()) {
  const time = normalizeNow(now).getTime();
  const start = parseTime(event.start_time);
  const end = parseTime(event.end_time);
  if (time < start) return 'pending';
  if (time > end) return 'ended';
  return 'active';
}

function getProgressKey(userId, eventId) {
  return `${EVENT_KEY_PREFIX}:${eventId}:${userId}`;
}

function getChoice(event, rawChoice) {
  const options = Array.isArray(event.options) ? event.options : [];
  const choice = String(rawChoice || '').trim();
  if (!choice) {
    return options[Math.floor(Math.random() * options.length)] || null;
  }
  return options.find(option => option.key === choice || option.label === choice) || null;
}

function getDailyFocusOption(event, now = new Date()) {
  const options = Array.isArray(event.options) ? event.options : [];
  if (options.length === 0) return null;
  const seed = `${event.id}:${toDateString(now)}`;
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return options[hash % options.length];
}

function formatReward(reward) {
  return `${reward.name}+${reward.amount}`;
}

function formatGrantList(rewards) {
  return rewards.map(formatReward).join('、');
}

async function grantRewards(userId, rewards = []) {
  const granted = [];
  const messages = [];
  for (const reward of rewards) {
    const result = await rewardGrant(userId, reward);
    if (!result.success) {
      messages.push(...(result.messages || []));
      continue;
    }
    granted.push(...(result.granted || []));
    messages.push(...(result.messages || []));
  }
  return { granted, messages };
}

export function getSummerMiniEvents() {
  return getEvents().map(event => ({
    ...event,
    state: eventState(event)
  }));
}

export function getActiveSummerEvent(now = new Date()) {
  return getEvents().find(event => eventState(event, now) === 'active') || null;
}

export function getEventByCommand(command) {
  return getEvents().find(event => event.command === command) || null;
}

export function getNextSummerEvent(now = new Date()) {
  const currentTime = normalizeNow(now).getTime();
  return getEvents()
    .filter(event => parseTime(event.start_time) > currentTime)
    .sort((a, b) => parseTime(a.start_time) - parseTime(b.start_time))[0] || null;
}

export function getEventDateRange(event) {
  return `${event.start_time} ~ ${event.end_time}`;
}

export async function getSummerEventStatus(userId, now = new Date()) {
  const events = getEvents();
  const activeEvent = getActiveSummerEvent(now);
  const nextEvent = getNextSummerEvent(now);
  let playerProgress = null;

  if (userId && activeEvent) {
    playerProgress = await getPlayerEventProgress(userId, activeEvent.id, now);
  }

  return {
    events: events.map(event => ({
      id: event.id,
      name: event.name,
      command: event.command,
      start_time: event.start_time,
      end_time: event.end_time,
      summary: event.summary,
      play_hint: event.play_hint,
      state: eventState(event, now)
    })),
    activeEvent,
    nextEvent,
    playerProgress
  };
}

export async function getPlayerEventProgress(userId, eventId, now = new Date()) {
  const activeDal = await getDal();
  const key = getProgressKey(userId, eventId);
  const data = await activeDal.redisClient.hGetAll(key);
  const event = getEvents().find(item => item.id === eventId);
  const claimed = JSON.parse(data.claimed || '[]');
  const count = Number(data.count || 0);
  const score = Number(data.score || 0);
  const today = toDateString(now);

  return {
    count,
    score,
    claimed,
    lastDate: data.last_date || '',
    playedToday: data.last_date === today,
    milestones: (event?.milestones || []).map(tier => ({
      days: tier.days,
      name: tier.name,
      claimed: claimed.includes(tier.days),
      canClaim: count >= tier.days && !claimed.includes(tier.days)
    }))
  };
}

export async function playSummerEvent(userId, eventId, rawChoice = '', now = new Date()) {
  const event = getEvents().find(item => item.id === eventId);
  if (!event) {
    return { success: false, message: '未找到对应的入夏活动配置。' };
  }

  const state = eventState(event, now);
  if (state === 'pending') {
    return { success: false, message: `【${event.name}】尚未开启，活动时间：${getEventDateRange(event)}` };
  }
  if (state === 'ended') {
    return { success: false, message: `【${event.name}】已经结束，当前不可参与。` };
  }

  const activeDal = await getDal();
  const exists = await activeDal.existPlayer(userId);
  if (!exists) {
    return { success: false, message: '尚未创建修仙存档，无法参与活动。' };
  }

  const choice = getChoice(event, rawChoice);
  if (!choice) {
    const validChoices = (event.options || []).map(option => option.label).join(' / ');
    return { success: false, message: `请选择有效行动：${validChoices}` };
  }

  const key = getProgressKey(userId, event.id);
  const today = toDateString(now);
  const current = await activeDal.redisClient.hGetAll(key);
  if (current.last_date === today) {
    return { success: false, message: `今日已完成【${event.name}】，明日再来吧。` };
  }

  const count = Number(current.count || 0) + 1;
  const score = Number(current.score || 0) + Number(choice.score || 1);
  const claimed = JSON.parse(current.claimed || '[]');
  const dailyGrant = await grantRewards(userId, choice.rewards || []);
  const focusOption = getDailyFocusOption(event, now);
  const matchedFocus = Boolean(event.match_rewards && focusOption?.key === choice.key);
  const focusGrant = matchedFocus ? await grantRewards(userId, event.match_rewards || []) : { granted: [], messages: [] };
  const milestoneMessages = [];
  const milestoneGranted = [];

  for (const tier of event.milestones || []) {
    if (count >= tier.days && !claimed.includes(tier.days)) {
      const tierGrant = await grantRewards(userId, tier.rewards || []);
      claimed.push(tier.days);
      milestoneGranted.push(...tierGrant.granted);
      milestoneMessages.push(`达成「${tier.name}」累计${tier.days}天奖励：${formatGrantList(tierGrant.granted) || '已发放'}`);
    }
  }

  await activeDal.redisClient.hSet(key, {
    count: String(count),
    score: String(score),
    last_date: today,
    claimed: JSON.stringify(claimed)
  });
  await activeDal.redisClient.expireAt(key, Math.floor((parseTime(event.end_time) + 7 * 24 * 60 * 60 * 1000) / 1000));

  const rewardText = formatGrantList(dailyGrant.granted) || '奖励已处理';
  const focusRewardText = formatGrantList(focusGrant.granted);
  const message = [
    `【${event.name}】${choice.text}`,
    `今日奖励：${rewardText}`,
    matchedFocus ? `${event.match_text || '今日灵机相合。'}${focusRewardText ? ` 额外获得：${focusRewardText}` : ''}` : '',
    `累计${event.progress_name || '进度'}：${count}天`,
    ...milestoneMessages
  ].filter(Boolean).join('\n');

  return {
    success: true,
    message,
    event,
    choice,
    progress: { count, score, claimed },
    rewards: [...dailyGrant.granted, ...focusGrant.granted, ...milestoneGranted]
  };
}

export function __clearSummerMiniEventConfigCacheForTest() {
  cachedConfig = null;
}

export function __setSummerMiniEventTestAdapters(adapters = {}) {
  dal = adapters.dal || null;
  rewardGrant = adapters.grantActivityReward || defaultGrantActivityReward;
}
