/* ═══════════════════════════════════════════
   🧠 记忆系统 - 三层记忆架构
   工作记忆(会话) + 短期记忆(当天) + 长期记忆(跨天)
   localStorage 持久化
   ═══════════════════════════════════════════ */

const PetMemory = (() => {
  'use strict';

  const STORAGE_KEY_SHORT = 'pet_memory_short';
  const STORAGE_KEY_LONG = 'pet_memory_long';
  const MAX_SHORT_EVENTS = 50;
  const MAX_LONG_HABITS = 10;
  const MAX_LONG_IMPRESSIONS = 10;
  const MAX_LONG_CONVERSATIONS = 15;

  // ═══════════════════════════════════════════
  // 层级 1: 工作记忆 (Working Memory) — 纯内存
  // ═══════════════════════════════════════════

  const workingMemory = {
    recentDialogues: [],  // 最近 5 轮对话
    recentSpeech: [],     // 最近 10 条主动说话
    sessionStart: null,
  };

  // ═══════════════════════════════════════════
  // 层级 2: 短期记忆 (Short-term) — localStorage，当天
  // ═══════════════════════════════════════════

  let shortTerm = {
    date: '',
    events: [],
    stats: {
      chatCount: 0,
      feedCount: 0,
      washCount: 0,
      patCount: 0,
      coffeeCount: 0,
      playCount: 0,
      totalInteractionMinutes: 0,
    },
  };

  // ═══════════════════════════════════════════
  // 层级 3: 长期记忆 (Long-term) — localStorage，跨天
  // ═══════════════════════════════════════════

  let longTerm = {
    relationship: {
      adoptDate: '',       // 领养日期
      daysSinceAdopt: 0,
      intimacyLevel: 30,   // 亲密度 0-100
      petName: '',          // 宠物名字
      ownerName: '',        // 主人名字
    },
    userHabits: [],         // 主人的习惯
    petImpressions: [],     // 宠物对主人的印象
    importantConversations: [],  // 重要对话
    yesterdaySummary: '',    // 昨天的总结
  };

  // ═══════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════

  function init() {
    workingMemory.sessionStart = new Date();
    loadFromStorage();
    checkNewDay();
    console.log('🧠 记忆系统初始化完成');
    console.log(`  领养天数: ${longTerm.relationship.daysSinceAdopt}`);
    console.log(`  亲密度: ${longTerm.relationship.intimacyLevel}`);
    console.log(`  今日事件: ${shortTerm.events.length}`);
  }

  function loadFromStorage() {
    // 短期记忆
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SHORT);
      if (saved) {
        shortTerm = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('短期记忆加载失败:', e);
    }

    // 长期记忆
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LONG);
      if (saved) {
        longTerm = { ...longTerm, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('长期记忆加载失败:', e);
    }

    // 如果没有领养日期，设为今天
    if (!longTerm.relationship.adoptDate) {
      longTerm.relationship.adoptDate = new Date().toISOString().split('T')[0];
    }

    // 计算领养天数
    const adoptDate = new Date(longTerm.relationship.adoptDate);
    const today = new Date();
    longTerm.relationship.daysSinceAdopt = Math.floor(
      (today - adoptDate) / (1000 * 60 * 60 * 24)
    );
  }

  function saveShortTerm() {
    try {
      localStorage.setItem(STORAGE_KEY_SHORT, JSON.stringify(shortTerm));
    } catch (e) {
      console.warn('短期记忆保存失败:', e);
    }
  }

  function saveLongTerm() {
    try {
      localStorage.setItem(STORAGE_KEY_LONG, JSON.stringify(longTerm));
    } catch (e) {
      console.warn('长期记忆保存失败:', e);
    }
  }

  // ─── 新的一天：压缩昨天 → 长期 ───
  function checkNewDay() {
    const today = new Date().toISOString().split('T')[0];
    if (shortTerm.date && shortTerm.date !== today) {
      // 昨天的记忆压缩成摘要
      compressYesterdayToLong();
      // 清空短期记忆
      shortTerm = {
        date: today,
        events: [],
        stats: {
          chatCount: 0, feedCount: 0, washCount: 0,
          patCount: 0, coffeeCount: 0, playCount: 0,
          totalInteractionMinutes: 0,
        },
      };
    } else if (!shortTerm.date) {
      shortTerm.date = today;
    }
    saveShortTerm();
  }

  function compressYesterdayToLong() {
    const s = shortTerm.stats;
    const parts = [];
    if (s.chatCount > 0) parts.push(`聊了${s.chatCount}次天`);
    if (s.feedCount > 0) parts.push(`被喂了${s.feedCount}次`);
    if (s.patCount > 0) parts.push(`被摸了${s.patCount}次头`);
    if (s.washCount > 0) parts.push(`洗了${s.washCount}次澡`);

    if (parts.length > 0) {
      longTerm.yesterdaySummary = `${shortTerm.date}: ${parts.join('，')}`;
    }

    // 亲密度变化
    const totalInteractions = s.chatCount + s.feedCount + s.patCount + s.washCount + s.playCount;
    if (totalInteractions > 10) {
      longTerm.relationship.intimacyLevel = Math.min(100, longTerm.relationship.intimacyLevel + 3);
    } else if (totalInteractions > 5) {
      longTerm.relationship.intimacyLevel = Math.min(100, longTerm.relationship.intimacyLevel + 1);
    } else if (totalInteractions === 0) {
      longTerm.relationship.intimacyLevel = Math.max(0, longTerm.relationship.intimacyLevel - 2);
    }

    saveLongTerm();
  }

  // ═══════════════════════════════════════════
  // 事件记录
  // ═══════════════════════════════════════════

  function addEvent(type, summary) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 短期记忆
    shortTerm.events.push({ time: timeStr, type, summary });
    if (shortTerm.events.length > MAX_SHORT_EVENTS) {
      shortTerm.events = shortTerm.events.slice(-MAX_SHORT_EVENTS);
    }

    // 更新统计
    switch (type) {
      case 'chat': shortTerm.stats.chatCount++; break;
      case 'fed': case 'just_fed': shortTerm.stats.feedCount++; break;
      case 'washed': case 'just_washed': shortTerm.stats.washCount++; break;
      case 'patted': shortTerm.stats.patCount++; break;
      case 'coffee': shortTerm.stats.coffeeCount++; break;
      case 'played': shortTerm.stats.playCount++; break;
    }

    // 工作记忆
    workingMemory.recentSpeech.push({ time: timeStr, type, summary });
    if (workingMemory.recentSpeech.length > 10) workingMemory.recentSpeech.shift();

    saveShortTerm();
  }

  function addDialogue(role, text) {
    workingMemory.recentDialogues.push({ role, text, time: Date.now() });
    if (workingMemory.recentDialogues.length > 10) workingMemory.recentDialogues.shift();
  }

  // ═══════════════════════════════════════════
  // 长期记忆管理
  // ═══════════════════════════════════════════

  function addUserHabit(habit) {
    // 避免重复
    if (longTerm.userHabits.some(h => h === habit)) return;
    longTerm.userHabits.push(habit);
    if (longTerm.userHabits.length > MAX_LONG_HABITS) longTerm.userHabits.shift();
    saveLongTerm();
  }

  function addImpression(impression) {
    longTerm.petImpressions.push(impression);
    if (longTerm.petImpressions.length > MAX_LONG_IMPRESSIONS) longTerm.petImpressions.shift();
    saveLongTerm();
  }

  function addImportantConversation(summary) {
    const date = new Date().toISOString().split('T')[0];
    longTerm.importantConversations.push({ date, summary });
    if (longTerm.importantConversations.length > MAX_LONG_CONVERSATIONS) {
      longTerm.importantConversations.shift();
    }
    saveLongTerm();
  }

  function setRelationship(key, value) {
    if (longTerm.relationship.hasOwnProperty(key)) {
      longTerm.relationship[key] = value;
      saveLongTerm();
    }
  }

  // ═══════════════════════════════════════════
  // 导出给 Prompt 的摘要
  // ═══════════════════════════════════════════

  function getShortTermSummary() {
    if (shortTerm.events.length === 0) return '';

    const recent = shortTerm.events.slice(-8);
    let summary = '';
    recent.forEach(e => {
      summary += `- ${e.time} ${e.summary}\n`;
    });

    const s = shortTerm.stats;
    const statParts = [];
    if (s.chatCount > 0) statParts.push(`聊天${s.chatCount}次`);
    if (s.feedCount > 0) statParts.push(`喂食${s.feedCount}次`);
    if (s.patCount > 0) statParts.push(`摸头${s.patCount}次`);
    if (s.washCount > 0) statParts.push(`洗澡${s.washCount}次`);
    if (statParts.length > 0) {
      summary += `今日统计: ${statParts.join(', ')}\n`;
    }

    return summary;
  }

  function getLongTermSummary() {
    const parts = [];
    const r = longTerm.relationship;

    if (r.daysSinceAdopt > 0) {
      parts.push(`我和主人认识${r.daysSinceAdopt}天了，亲密度${r.intimacyLevel}/100`);
    }
    if (r.petName) parts.push(`我的名字叫${r.petName}`);
    if (r.ownerName) parts.push(`主人叫${r.ownerName}`);

    if (longTerm.userHabits.length > 0) {
      parts.push('主人的习惯: ' + longTerm.userHabits.slice(-3).join('; '));
    }

    if (longTerm.petImpressions.length > 0) {
      parts.push('我的感受: ' + longTerm.petImpressions.slice(-2).join('; '));
    }

    if (longTerm.yesterdaySummary) {
      parts.push(`昨天: ${longTerm.yesterdaySummary}`);
    }

    if (longTerm.importantConversations.length > 0) {
      const recent = longTerm.importantConversations.slice(-2);
      recent.forEach(c => {
        parts.push(`${c.date}的重要对话: ${c.summary}`);
      });
    }

    return parts.join('\n');
  }

  // ═══════════════════════════════════════════
  // 辅助
  // ═══════════════════════════════════════════

  function getSessionDuration() {
    if (!workingMemory.sessionStart) return 0;
    return Math.floor((Date.now() - workingMemory.sessionStart.getTime()) / 60000);
  }

  function getIntimacy() {
    return longTerm.relationship.intimacyLevel;
  }

  function adjustIntimacy(delta) {
    longTerm.relationship.intimacyLevel = Math.max(0, Math.min(100,
      longTerm.relationship.intimacyLevel + delta
    ));
    saveLongTerm();
  }

  // ─── 清理 30 天前的数据 ───
  function cleanup() {
    // 短期记忆只保留当天，无需清理
    // 长期记忆清理旧的重要对话
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

    longTerm.importantConversations = longTerm.importantConversations.filter(
      c => c.date >= cutoff
    );
    saveLongTerm();
  }

  return {
    init,
    addEvent,
    addDialogue,
    addUserHabit,
    addImpression,
    addImportantConversation,
    setRelationship,
    getShortTermSummary,
    getLongTermSummary,
    getSessionDuration,
    getIntimacy,
    adjustIntimacy,
    cleanup,
    get shortTerm() { return shortTerm; },
    get longTerm() { return longTerm; },
    get workingMemory() { return workingMemory; },
  };
})();
