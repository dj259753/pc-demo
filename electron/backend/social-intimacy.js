'use strict';

/* ═══════════════════════════════════════════
   亲密度体系 - 常量与计算逻辑
   独立模块，供 social-client / renderer 共享引用
   ═══════════════════════════════════════════ */

// ── 关系等级定义 ──
const INTIMACY_LEVELS = [
  { key: 'stranger',  name: '初识',   icon: '🥚', minScore: 0,    color: '#9E9E9E' },
  { key: 'acquaintance', name: '熟人', icon: '🌱', minScore: 100,  color: '#8BC34A' },
  { key: 'close',       name: '挚友', icon: '💚', minScore: 400,  color: '#4CAF50' },
  { key: 'bestie',      name: '死党', icon: '🔥', minScore: 1200, color: '#FF9800' },
  { key: 'soul',        name: '挚交', icon: '💎', minScore: 3000, color: '#9C27B0' },
  { key: 'bond',        name: '羁友', icon: '🌟', minScore: 7000, color: '#E91E63' },
];

const MAX_LEVEL_INDEX = INTIMACY_LEVELS.length - 1;

// ── 积分事件规则 ──
const INTIMACY_EVENTS = {
  'visit.success':         { points: 15, label: '拜访成功',    dailyCap: 5 },
  'visit.co-screen.minute':{ points: 2,  label: '同屏陪伴',    dailyCap: 30 }, // 每分钟，上限 30 分钟
  'interaction.hug':       { points: 5,  label: '贴贴',        dailyCap: 10 },
  'interaction.highfive':  { points: 4,  label: '击掌',        dailyCap: 10 },
  'interaction.handshake': { points: 4,  label: '握手',        dailyCap: 10 },
  'interaction.wave':      { points: 3,  label: '打招呼',     dailyCap: 15 },
  'game.gomoku.play':      { points: 10, label: '五子棋对局',  dailyCap: 5 },
  'friend.accepted':       { points: 8,  label: '成为好友',    dailyCap: Infinity }, // 只触发一次
  'gift.send':             { points: 12, label: '赠送礼物',    dailyCap: 3 },
};

/**
 * 根据分数计算当前等级信息
 */
function resolveLevel(score) {
  const s = Math.max(0, Math.floor(Number(score) || 0));
  let level = INTIMACY_LEVELS[0];
  for (let i = MAX_LEVEL_INDEX; i >= 0; i--) {
    if (s >= INTIMACY_LEVELS[i].minScore) {
      level = INTIMACY_LEVELS[i];
      break;
    }
  }
  return { ...level, score: s, levelIndex: INTIMACY_LEVELS.indexOf(level) };
}

/**
 * 获取下一等级信息（已达最高返回 null）
 */
function getNextLevel(score) {
  const current = resolveLevel(score);
  if (current.levelIndex >= MAX_LEVEL_INDEX) return null;
  return INTIMACY_LEVELS[current.levelIndex + 1];
}

/**
 * 计算距离下一级还需多少分
 */
function getProgressToNext(score) {
  const current = resolveLevel(score);
  const next = getNextLevel(score);
  if (!next) return { current, next: null, remaining: 0, progressPercent: 100 };
  const remaining = next.minScore - score;
  const prevMinScore = current.minScore;
  const range = next.minScore - prevMinScore;
  const progressPercent = range > 0 ? Math.min(100, Math.floor(((score - prevMinScore) / range) * 100)) : 100;
  return { current, next, remaining, progressPercent };
}

/**
 * 创建空的亲密度数据（新好友初始化用）
 */
function createEmptyIntimacy() {
  return {
    score: 0,
    dailyEvents: {},
    lastResetDate: '',
    updatedAt: '',
  };
}

/**
 * 获取当日期的 YYYY-MM-DD key（用于每日冷却）
 */
function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 判断是否需要重置每日计数（跨天了）
 */
function needsDailyReset(intimacy) {
  if (!intimacy || !intimacy.lastResetDate) return true;
  return intimacy.lastResetDate !== getTodayKey();
}

/**
 * 尝试增加积分
 * @returns {{ added: number, leveledUp: boolean, fromLevel: *, toLevel: *, intimacy: * }}
 */
function addPoints(intimacy, eventType, amountOverride) {
  const rule = INTIMACY_EVENTS[eventType];
  if (!rule && amountOverride === undefined) {
    return { added: 0, leveledUp: false, intimacy };
  }

  const nowISOVal = new Date().toISOString();
  const today = getTodayKey();

  // 跨日重置
  if (!intimacy || typeof intimacy !== 'object') {
    intimacy = createEmptyIntimacy();
  }
  if (needsDailyReset(intimacy)) {
    intimacy.dailyEvents = {};
    intimacy.lastResetDate = today;
  }

  const points = amountOverride !== undefined ? Number(amountOverride) : rule.points;

  // 检查每日上限
  const used = intOrZero(intimacy.dailyEvents[eventType]);
  const cap = rule ? rule.dailyCap : Infinity;

  if (rule && cap !== Infinity && used >= cap) {
    return { added: 0, leveledUp: false, intimacy, reason: 'daily-cap-reached' };
  }

  const beforeScore = intimacy.score || 0;
  const afterScore = beforeScore + points;
  const beforeLevel = resolveLevel(beforeScore);
  const afterLevel = resolveLevel(afterScore);

  // 更新数据
  intimacy.score = afterScore;
  intimacy.updatedAt = nowISOVal;
  if (rule && cap !== Infinity) {
    intimacy.dailyEvents[eventType] = used + 1; // 计次数而非总分
  } else if (!rule && amountOverride !== undefined) {
    // 自定义金额不记 dailyCap（如管理员操作）
  }

  return {
    added: points,
    leveledUp: afterLevel.levelIndex > beforeLevel.levelIndex,
    fromLevel: beforeLevel,
    toLevel: afterLevel,
    intimacy,
  };
}

/** 安全转整数 fallback 0 */
function intOrZero(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : 0;
}

module.exports = {
  INTIMACY_LEVELS,
  MAX_LEVEL_INDEX,
  INTIMACY_EVENTS,
  resolveLevel,
  getNextLevel,
  getProgressToNext,
  createEmptyIntimacy,
  getTodayKey,
  needsDailyReset,
  addPoints,
};
