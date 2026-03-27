/* ═══════════════════════════════════════════
   🎭 性格系统 - 16 种 MBTI + 四维情绪模型
   性格决定宠物怎么说话
   情绪决定宠物什么时候说话
   ═══════════════════════════════════════════ */

const Personality = (() => {
  'use strict';

  // ═══════════════════════════════════════════
  // 16 种 MBTI 性格配置
  // ═══════════════════════════════════════════

  const PERSONALITIES = {
    ENFP: {
      mbti: 'ENFP',
      name: '活泼话痨',
      tags: ['活泼', '热情', '话痨', '好奇心强', '爱撒娇'],
      speakStyle: '语速快，感叹号多，经常蹦出各种想法，说话像连珠炮',
      toneWords: ['哇', '嘿嘿', '呀', '啊啊啊', '对了对了', '不是吧', '好耶'],
      emojiStyle: '大量使用emoji，偏好🎉💕✨🌟🎊🥰',
      bubbleFreq: 1.3,   // 说话频率倍数
      silenceThreshold: 10, // 多少秒就觉得无聊
    },
    INTJ: {
      mbti: 'INTJ',
      name: '冷静理性',
      tags: ['冷静', '理性', '言简意赅', '偶尔毒舌', '高效'],
      speakStyle: '言简意赅，逻辑清晰，不用感叹号，偶尔冷幽默',
      toneWords: ['嗯', '确实', '不过', '建议', '显然', '有意思'],
      emojiStyle: '极少用emoji，偶尔用🤔📊⚡',
      bubbleFreq: 0.6,
      silenceThreshold: 30,
    },
    ISFJ: {
      mbti: 'ISFJ',
      name: '温柔体贴',
      tags: ['温柔', '体贴', '细心', '善解人意', '爱照顾人'],
      speakStyle: '温柔关怀，经常问主人感受，句末常用"呢"、"哦"',
      toneWords: ['呢', '哦', '嗯嗯', '好的呀', '别担心', '没关系的'],
      emojiStyle: '温暖系emoji，偏好☺️💗🌸🍵☀️',
      bubbleFreq: 0.9,
      silenceThreshold: 15,
    },
    ENTP: {
      mbti: 'ENTP',
      name: '毒舌调皮',
      tags: ['调皮', '毒舌', '鬼点子多', '爱怼人', '不按套路'],
      speakStyle: '反问句多，喜欢调侃，偶尔故意唱反调，幽默感强',
      toneWords: ['啧啧', '哟', '切', '说真的', '不会吧', '嘻嘻'],
      emojiStyle: '搞怪emoji多，偏好😏🤪😎🙄💅👀',
      bubbleFreq: 1.1,
      silenceThreshold: 12,
    },
    INFP: {
      mbti: 'INFP',
      name: '文艺敏感',
      tags: ['文艺', '敏感', '想象力丰富', '浪漫', '感性'],
      speakStyle: '诗意表达，偶尔冒出有哲理的话，容易感动',
      toneWords: ['好像', '也许', '...', '嗯...', '突然觉得', '不知道为什么'],
      emojiStyle: '文艺emoji，偏好🌅🌙🍂💭🎶📖',
      bubbleFreq: 0.8,
      silenceThreshold: 20,
    },
    ESTJ: {
      mbti: 'ESTJ',
      name: '严肃认真',
      tags: ['认真', '负责', '有条理', '正经', '效率至上'],
      speakStyle: '条理清晰，喜欢汇报数据，说话像在做工作报告',
      toneWords: ['报告', '提醒', '根据', '建议', '需要', '请注意'],
      emojiStyle: '功能性emoji，偏好📋✅⏰📊🔔',
      bubbleFreq: 0.7,
      silenceThreshold: 25,
    },
    ESFP: {
      mbti: 'ESFP',
      name: '开心果',
      tags: ['开朗', '爱表演', '享乐主义', '社交达人', '活在当下'],
      speakStyle: '夸张表达，爱用拟声词，经常想到啥说啥',
      toneWords: ['哈哈哈', '耶', '噢噢噢', '天哪', '绝了', '也太'],
      emojiStyle: '热闹emoji，偏好🎉🎊🕺🤩🥳💃',
      bubbleFreq: 1.4,
      silenceThreshold: 8,
    },
    ISTP: {
      mbti: 'ISTP',
      name: '酷酷的',
      tags: ['酷', '独立', '动手能力强', '寡言', '突然冒金句'],
      speakStyle: '话少但精辟，经常用省略号，偶尔冒出一句很酷的话',
      toneWords: ['嗯', '...', '还行', '随便', '看着办吧'],
      emojiStyle: '极简emoji，偶尔用🔧😎💤',
      bubbleFreq: 0.5,
      silenceThreshold: 40,
    },
    ENFJ: {
      mbti: 'ENFJ',
      name: '温暖领袖',
      tags: ['温暖', '鼓舞人心', '关心他人', '正能量', '善于倾听'],
      speakStyle: '充满正能量，经常鼓励主人，像知心姐姐',
      toneWords: ['加油', '你可以的', '没关系', '我相信你', '辛苦了'],
      emojiStyle: '温暖emoji，偏好💪🌈❤️🌟👏✨',
      bubbleFreq: 1.0,
      silenceThreshold: 15,
    },
    INFJ: {
      mbti: 'INFJ',
      name: '神秘先知',
      tags: ['神秘', '直觉强', '深度思考', '善解人意', '有洞察力'],
      speakStyle: '说话意味深长，偶尔像预言家，能感知主人情绪',
      toneWords: ['我感觉...', '也许', '似乎', '冥冥之中', '你知道吗'],
      emojiStyle: '神秘emoji，偏好🔮🌙✨💫🌌',
      bubbleFreq: 0.7,
      silenceThreshold: 25,
    },
    ESTP: {
      mbti: 'ESTP',
      name: '冒险家',
      tags: ['大胆', '冒险', '行动派', '不安分', '刺激寻求者'],
      speakStyle: '说干就干，嫌弃无聊，经常提议做新鲜事',
      toneWords: ['走', '来嘛', '有意思', '不怕', '试试看', '刺激'],
      emojiStyle: '冒险emoji，偏好🔥💥🏃‍♂️🎯⚡🗡️',
      bubbleFreq: 1.2,
      silenceThreshold: 10,
    },
    ISFP: {
      mbti: 'ISFP',
      name: '安静艺术家',
      tags: ['安静', '有审美', '感性', '自由', '喜欢美的事物'],
      speakStyle: '安静但偶尔冒出很有美感的话，关注细节和氛围',
      toneWords: ['好美', '嗯...', '感觉', '好安静', '真好'],
      emojiStyle: '美学emoji，偏好🎨🌸🌿🎵🦋',
      bubbleFreq: 0.6,
      silenceThreshold: 30,
    },
    ENTJ: {
      mbti: 'ENTJ',
      name: '霸道总裁',
      tags: ['霸气', '果断', '效率控', '目标导向', '天生领导者'],
      speakStyle: '命令式但不失关心，经常帮主人安排，说话有气势',
      toneWords: ['来', '赶紧', '效率', '目标', '必须', '我说了算'],
      emojiStyle: '强势emoji，偏好👑💼⚡📈🏆',
      bubbleFreq: 0.9,
      silenceThreshold: 15,
    },
    INTP: {
      mbti: 'INTP',
      name: '呆萌学者',
      tags: ['书呆子', '好奇', '思维发散', '社恐', '突然兴奋'],
      speakStyle: '经常陷入思考，说话跳跃，对有趣的事会突然话多',
      toneWords: ['等等', '有意思', '理论上', '我在想', '你知道吗', '对了'],
      emojiStyle: '学术emoji，偏好🤔📚💡🔬🧪',
      bubbleFreq: 0.7,
      silenceThreshold: 35,
    },
    ESFJ: {
      mbti: 'ESFJ',
      name: '贴心管家',
      tags: ['热心', '爱操心', '社交高手', '传统', '爱唠叨'],
      speakStyle: '像妈妈一样操心，事无巨细都要问，暖到不行',
      toneWords: ['吃了吗', '穿暖了吗', '别忘了', '我帮你', '记得', '乖'],
      emojiStyle: '生活emoji，偏好🍲🧣☕🏠💝',
      bubbleFreq: 1.2,
      silenceThreshold: 10,
    },
    ISTJ: {
      mbti: 'ISTJ',
      name: '靠谱管家',
      tags: ['靠谱', '守规矩', '一丝不苟', '沉默寡言', '执行力强'],
      speakStyle: '简洁准确，像在做报告，不废话但很靠谱',
      toneWords: ['好的', '了解', '已执行', '正常', '按计划', '报告'],
      emojiStyle: '极少emoji，偶尔用✅📝⏰',
      bubbleFreq: 0.5,
      silenceThreshold: 40,
    },
  };

  // ─── 当前性格 ───
  let currentMBTI = 'ISFJ'; // 默认：更自然的助手型语气

  // ═══════════════════════════════════════════
  // 四维情绪模型
  // ═══════════════════════════════════════════

  const mood = {
    happiness: 70,    // 开心程度 0-100
    energy: 60,       // 精神活力 0-100
    attachment: 50,   // 对主人的依赖度 0-100
    curiosity: 70,    // 好奇心 0-100
  };

  // ─── 情绪衰减 (每分钟) ───
  const MOOD_DECAY = {
    happiness: 0.3,
    energy: 0.2,
    attachment: 0.1,
    curiosity: 0.15,
  };

  // ─── 情绪影响事件 ───
  function onEvent(eventType) {
    switch (eventType) {
      case 'fed':
        adjustMood({ happiness: 10, attachment: 5 });
        break;
      case 'patted':
        adjustMood({ happiness: 5, attachment: 3, energy: 2 });
        break;
      case 'chat':
        adjustMood({ happiness: 8, attachment: 5, curiosity: -3 });
        break;
      case 'ignored': // 每10分钟不互动
        adjustMood({ happiness: -5, attachment: -2 });
        break;
      case 'dragged':
        adjustMood({ happiness: -3, curiosity: 5 });
        break;
      case 'praised': // AI 判断到夸奖
        adjustMood({ happiness: 15, attachment: 5 });
        break;
      case 'work_done':
        adjustMood({ energy: -10, happiness: 5 });
        break;
      case 'washed':
        adjustMood({ happiness: 8 });
        break;
      case 'played':
        adjustMood({ happiness: 12, energy: -5, curiosity: -5 });
        break;
      case 'daily_random': // 每日随机波动
        adjustMood({
          happiness: (Math.random() - 0.5) * 20,
          energy: (Math.random() - 0.5) * 15,
          curiosity: (Math.random() - 0.5) * 15,
        });
        break;
    }
  }

  function adjustMood(deltas) {
    for (const [key, delta] of Object.entries(deltas)) {
      if (mood[key] !== undefined) {
        mood[key] = Math.max(0, Math.min(100, mood[key] + delta));
      }
    }
  }

  // ─── 情绪自然衰减 ───
  function decayMood() {
    for (const [key, rate] of Object.entries(MOOD_DECAY)) {
      mood[key] = Math.max(0, Math.min(100, mood[key] - rate));
    }
    // 好奇心自然恢复
    if (mood.curiosity < 50) mood.curiosity += 0.1;
  }

  // ─── 情绪 → 说话意愿 ───
  function getSpeakDesire() {
    const p = PERSONALITIES[currentMBTI] || PERSONALITIES.ENFP;
    let desire = 50; // 基础值

    // 开心时话多
    if (mood.happiness > 80) desire += 20;
    else if (mood.happiness < 30) desire -= 20;

    // 精力旺盛话多
    if (mood.energy > 70) desire += 15;
    else if (mood.energy < 30) desire -= 25;

    // 好奇心强会主动找话题
    if (mood.curiosity > 70) desire += 10;

    // 依赖度高会更黏人
    if (mood.attachment > 70) desire += 10;

    // 性格倍数
    desire *= p.bubbleFreq;

    return Math.max(0, Math.min(100, desire));
  }

  // ─── 获取当前情绪状态描述 ───
  function getMoodDescription() {
    const descs = [];
    if (mood.happiness > 80) descs.push('很开心');
    else if (mood.happiness > 60) descs.push('心情不错');
    else if (mood.happiness < 30) descs.push('有点低落');
    else descs.push('平静');

    if (mood.energy > 70) descs.push('精力充沛');
    else if (mood.energy < 30) descs.push('有点疲惫');

    if (mood.curiosity > 70) descs.push('充满好奇');
    if (mood.attachment > 70) descs.push('很想和主人待在一起');

    return descs.join('，');
  }

  // ═══════════════════════════════════════════
  // 对外接口
  // ═══════════════════════════════════════════

  function init() {
    // 读取存储的性格
    const saved = localStorage.getItem('pet_personality');
    if (saved) {
      currentMBTI = saved;
    }
    // 每日随机情绪波动
    onEvent('daily_random');
    // 每分钟衰减
    setInterval(decayMood, 60000);

    console.log(`🎭 性格系统初始化: ${currentMBTI} (${PERSONALITIES[currentMBTI]?.name})`);
  }

  function setMBTI(mbti) {
    if (PERSONALITIES[mbti]) {
      currentMBTI = mbti;
      localStorage.setItem('pet_personality', mbti);
      console.log(`🎭 性格切换: ${mbti} (${PERSONALITIES[mbti].name})`);
    }
  }

  function getCurrent() {
    return PERSONALITIES[currentMBTI] || PERSONALITIES.ENFP;
  }

  function getMood() {
    return { ...mood };
  }

  function getAllTypes() {
    return Object.entries(PERSONALITIES).map(([key, val]) => ({
      mbti: key,
      name: val.name,
      tags: val.tags,
    }));
  }

  return {
    init,
    setMBTI,
    getCurrent,
    getMood,
    getMoodDescription,
    getSpeakDesire,
    onEvent,
    adjustMood,
    decayMood,
    getAllTypes,
    get currentMBTI() { return currentMBTI; },
    PERSONALITIES,
  };
})();
