/* ═══════════════════════════════════════════
   🗣️ 主动说话引擎 - 让宠物"活"起来
   触发调度 + 频率控制 + 预生成 Batch + 降级兜底
   ═══════════════════════════════════════════ */

const ProactiveChat = (() => {
  'use strict';

  // ─── 频率控制 ───
  let lastSpeakTime = 0;
  const GLOBAL_COOLDOWN = 90000;      // 全局冷却 90 秒（原 15 秒）
  const MAX_PER_MINUTE = 1;           // 每分钟最多 1 条（原 2 条）
  let minuteSpeakCount = 0;
  let minuteResetTimer = null;

  // ─── 时间问候已触发标记 ───
  const triggeredToday = {};

  // ─── 预生成缓存 ───
  let pendingBubbles = [];
  let batchGenerating = false;
  let lastBatchTime = 0;
  const BATCH_INTERVAL = 3600000; // 每小时生成一批

  // ─── 调度器 ───
  let schedulerInterval = null;
  let lastInteractionTime = Date.now();

  // ─── 状态标记 ───
  let isInitialized = false;
  let isMuted = false;  // 静音模式（全屏/打字中）

  let lastOfflineSleepAt = 0;

  // ═══════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════

  function init() {
    if (isInitialized) return;
    isInitialized = true;

    // 每分钟重置计数
    minuteResetTimer = setInterval(() => { minuteSpeakCount = 0; }, 60000);

    // 主调度器已禁用：不再主动弹气泡
    // schedulerInterval = setInterval(schedule, 15000);

    // 启动时不再预生成
    // setTimeout(() => { generateBatch(); }, 10000);

    // 监听状态事件
    if (typeof PetState !== 'undefined') {
      PetState.on('low-warning', onLowWarning);
      PetState.on('action', onAction);
    }

    console.log('🗣️ 主动说话引擎启动');
  }

  // ═══════════════════════════════════════════
  // 主调度器
  // ═══════════════════════════════════════════

  function schedule() {
    // 被静音 → 不说话
    if (isMuted) return;

    // 冷却中 → 不说话
    if (Date.now() - lastSpeakTime < GLOBAL_COOLDOWN) return;

    // 分钟限额 → 不说话
    if (minuteSpeakCount >= MAX_PER_MINUTE) return;

    // 对话/面板打开 → 不说话
    if (isDialogOpen()) return;

    // 睡觉中 → 梦话模式
    if (typeof BehaviorEngine !== 'undefined' &&
        BehaviorEngine.currentBehavior === BehaviorEngine.BEHAVIOR.SLEEPING) {
      maybeeDreamTalk();
      return;
    }

    // 番茄钟 → 不说话
    if (typeof FocusMode !== 'undefined' && FocusMode.isActive) return;

    // Claw 工作中 → 不说话（让 claw-bridge 处理）
    if (typeof ClawBridge !== 'undefined' && ClawBridge.isClawWorking) return;

    // ─── 优先级判断 ───

    // P0: 时间问候（实时 AI）
    const timeGreeting = checkTimeGreeting();
    if (timeGreeting) {
      speakWithAI(timeGreeting.trigger, timeGreeting.context);
      return;
    }

    // P1: 养成数值触发（实时 AI）
    const statTrigger = checkStatTrigger();
    if (statTrigger) {
      speakWithAI(statTrigger.trigger, statTrigger.context);
      return;
    }

    // P2: 闲置行为（预生成缓存 or 实时 AI）
    const idleTrigger = checkIdleTrigger();
    if (idleTrigger) {
      speakFromCache(idleTrigger);
      return;
    }
  }

  // ═══════════════════════════════════════════
  // 触发检查器
  // ═══════════════════════════════════════════

  function checkTimeGreeting() {
    const hour = new Date().getHours();
    const min = new Date().getMinutes();
    const todayKey = new Date().toDateString();

    // 早晨问候
    if (hour >= 6 && hour < 10 && !triggeredToday[`${todayKey}_morning`]) {
      triggeredToday[`${todayKey}_morning`] = true;
      return {
        trigger: 'morning_greeting',
        context: { description: `早晨${hour}:${String(min).padStart(2, '0')}，新的一天开始了` },
      };
    }

    // 午餐提醒
    if (hour >= 11 && hour <= 13 && min >= 30 && !triggeredToday[`${todayKey}_lunch`]) {
      triggeredToday[`${todayKey}_lunch`] = true;
      return {
        trigger: 'lunch_reminder',
        context: { description: '中午了，该吃饭了' },
      };
    }

    // 下午犯困
    if (hour >= 14 && hour < 15 && !triggeredToday[`${todayKey}_afternoon`]) {
      triggeredToday[`${todayKey}_afternoon`] = true;
      return {
        trigger: 'afternoon_slump',
        context: { description: '下午犯困时间' },
      };
    }

    // 傍晚问候
    if (hour >= 17 && hour < 19 && !triggeredToday[`${todayKey}_evening`]) {
      triggeredToday[`${todayKey}_evening`] = true;
      return {
        trigger: 'evening_wrap',
        context: { description: '傍晚了，快下班了' },
      };
    }

    // 深夜关怀
    if ((hour >= 23 || hour < 2) && !triggeredToday[`${todayKey}_latenight`]) {
      triggeredToday[`${todayKey}_latenight`] = true;
      return {
        trigger: 'late_night',
        context: { description: '深夜了，主人还在工作吗' },
      };
    }

    return null;
  }

  function checkStatTrigger() {
    const stats = PetState.stats;
    const todayKey = new Date().toDateString();

    if (stats.hunger <= 10 && !triggeredToday[`${todayKey}_starving`]) {
      triggeredToday[`${todayKey}_starving`] = true;
      return {
        trigger: 'starving',
        context: { description: `饥饿值只有${stats.hunger}了！`, hunger: stats.hunger },
      };
    }

    if (stats.hunger <= 20 && stats.hunger > 10 && !triggeredToday[`${todayKey}_hungry`]) {
      triggeredToday[`${todayKey}_hungry`] = true;
      return {
        trigger: 'hungry',
        context: { description: `有点饿了，饥饿值${stats.hunger}`, hunger: stats.hunger },
      };
    }

    if (stats.clean <= 20 && !triggeredToday[`${todayKey}_dirty`]) {
      triggeredToday[`${todayKey}_dirty`] = true;
      return {
        trigger: 'dirty',
        context: { description: `需要洗澡了，清洁值${stats.clean}`, clean: stats.clean },
      };
    }

    if (stats.energy <= 20 && !triggeredToday[`${todayKey}_exhausted`]) {
      triggeredToday[`${todayKey}_exhausted`] = true;
      return {
        trigger: 'exhausted',
        context: { description: `好累，精力值${stats.energy}`, energy: stats.energy },
      };
    }

    // 全满 → 开心
    if (stats.hunger >= 80 && stats.clean >= 80 && stats.energy >= 80 &&
        !triggeredToday[`${todayKey}_allgood`]) {
      triggeredToday[`${todayKey}_allgood`] = true;
      return {
        trigger: 'all_good',
        context: { description: '状态全满，很开心' },
      };
    }

    return null;
  }

  function checkIdleTrigger() {
    const timeSinceSpeak = Date.now() - lastSpeakTime;
    const personality = typeof Personality !== 'undefined' ? Personality : null;
    const silenceThreshold = personality ?
      personality.getCurrent().silenceThreshold * 1000 :
      15000;

    // 深夜降频
    const hour = new Date().getHours();
    const nightMultiplier = (hour >= 23 || hour < 7) ? 2 : 1;

    // 说话意愿
    const speakDesire = personality ? personality.getSpeakDesire() : 50;

    // 随机概率（基于说话意愿和沉默时长）
    const timeFactor = Math.min(timeSinceSpeak / (silenceThreshold * nightMultiplier * 3), 1);
    const probability = (speakDesire / 100) * timeFactor * 0.1; // 最高 10% 概率（原 30%）

    if (Math.random() < probability && timeSinceSpeak > silenceThreshold * nightMultiplier) {
      return { trigger: 'random_idle' };
    }

    return null;
  }

  function maybeeDreamTalk() {
    // 每 2 分钟有 10% 概率说梦话
    if (Math.random() < 0.005) { // 5秒检查一次，2分钟≈24次，0.005*24≈12%
      speakWithAI('dream_talk', {
        description: '正在睡觉中，说梦话',
        constraint: '梦话，10字以内，迷迷糊糊的，可以说一些有趣的梦境片段',
      });
    }
  }

  // ═══════════════════════════════════════════
  // 说话执行
  // ═══════════════════════════════════════════

  async function speakWithAI(trigger, context = {}) {
    if (!canSpeak()) return;

    // 收集环境信息
    const envContext = {
      ...context,
      minutesSinceInteraction: Math.floor((Date.now() - lastInteractionTime) / 60000),
    };

    // 尝试用 AI 生成
    if (typeof AIBrain !== 'undefined') {
      const reply = await AIBrain.speak(trigger, envContext);
      if (reply) {
        showBubble(reply, trigger);
        return;
      }
    }

    // 不再本地兜底：无网时直接休眠
    enterOfflineSleep();
  }

  function speakFromCache(idleTrigger) {
    if (!canSpeak()) return;

    // 优先用预生成缓存
    if (pendingBubbles.length > 0) {
      const text = pendingBubbles.shift();
      showBubble(text, 'cached_idle');

      // 缓存快用完了，异步补充
      if (pendingBubbles.length < 3 && !batchGenerating) {
        generateBatch();
      }
      return;
    }

    // 缓存空了 → 尝试实时 AI
    speakWithAI('random_idle', {
      description: '闲着没事，随便说点什么',
    });
  }

  function showBubble(text, trigger) {
    lastSpeakTime = Date.now();
    minuteSpeakCount++;

    if (typeof BubbleSystem !== 'undefined') {
      BubbleSystem.show(text, 5000);
    }

    // 记录到日记
    if (typeof PetDiary !== 'undefined') {
      PetDiary.addEntry('proactive', `主动说话[${trigger}]: "${text.substring(0, 20)}..."`);
    }

    console.log(`🗣️ [${trigger}] ${text}`);
  }

  function enterOfflineSleep() {
    const now = Date.now();
    if (now - lastOfflineSleepAt < 120000) return;
    lastOfflineSleepAt = now;
    if (typeof BubbleSystem !== 'undefined') BubbleSystem.show('没网了，我先睡着了。', 4000);
    if (typeof PetState !== 'undefined') PetState.setState(PetState.STATES.SLEEPING, 600000);
    if (typeof SpriteRenderer !== 'undefined') SpriteRenderer.setAnimation('sleeping');
  }

  // ═══════════════════════════════════════════
  // 预生成 Batch
  // ═══════════════════════════════════════════

  async function generateBatch() {
    if (batchGenerating) return;
    if (Date.now() - lastBatchTime < BATCH_INTERVAL / 2) return; // 至少半小时间隔

    batchGenerating = true;
    console.log('🗣️ 开始 Batch 预生成...');

    try {
      if (typeof AIBrain !== 'undefined') {
        const lines = await AIBrain.batchGenerate({
          cpu: typeof SystemMonitor !== 'undefined' ? undefined : undefined,
        });

        if (lines && lines.length > 0) {
          pendingBubbles = [...pendingBubbles, ...lines];
          // 打乱顺序
          for (let i = pendingBubbles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pendingBubbles[i], pendingBubbles[j]] = [pendingBubbles[j], pendingBubbles[i]];
          }
          lastBatchTime = Date.now();
          console.log(`🗣️ Batch 预生成完成，缓存${pendingBubbles.length}条`);
        }
      }
    } catch (err) {
      console.warn('🗣️ Batch 预生成失败:', err.message);
    }

    batchGenerating = false;
  }

  // ═══════════════════════════════════════════
  // 频率控制辅助
  // ═══════════════════════════════════════════

  function canSpeak() {
    if (isMuted) return false;
    if (Date.now() - lastSpeakTime < GLOBAL_COOLDOWN) return false;
    if (minuteSpeakCount >= MAX_PER_MINUTE) return false;
    if (isDialogOpen()) return false;
    return true;
  }

  function isDialogOpen() {
    const quickChat = document.getElementById('quick-chat');
    return (quickChat && !quickChat.classList.contains('hidden'));
  }

  // ═══════════════════════════════════════════
  // 事件响应（即时触发的 AI 说话）
  // ═══════════════════════════════════════════

  function onLowWarning({ key, value }) {
    // 低数值警告 → AI 生成关心的话
    const names = { hunger: '饥饿', clean: '清洁', energy: '精力' };
    speakWithAI('low_warning', {
      description: `${names[key]}值只有${value}了，需要关心主人`,
        constraint: '一句简短提醒，20-35字，语气自然，emoji可选',
    });
  }

  function onAction({ type }) {
    // 互动后的即时反馈
    if (type === 'feed') {
      setTimeout(() => {
        speakWithAI('just_fed', {
          description: '刚被喂了食物',
          constraint: '一句轻松反馈，15-30字，少用emoji',
        });
      }, 2000);
    } else if (type === 'wash') {
      setTimeout(() => {
        speakWithAI('just_washed', {
          description: '刚洗完澡',
          constraint: '一句自然反馈，15-30字，不要夸张卖萌',
        });
      }, 3500);
    }
  }

  // ─── 外部调用：通知互动 ───
  function notifyInteraction() {
    lastInteractionTime = Date.now();
  }

  // ─── 外部调用：设置静音 ───
  function setMuted(val) {
    isMuted = val;
  }

  // ─── 外部调用：手动触发说话 ───
  function triggerSpeak(trigger, context) {
    speakWithAI(trigger, context);
  }

  return {
    init,
    notifyInteraction,
    setMuted,
    triggerSpeak,
    generateBatch,
    get pendingBubbles() { return pendingBubbles.length; },
    get lastSpeakTime() { return lastSpeakTime; },
    get isMuted() { return isMuted; },
  };
})();
