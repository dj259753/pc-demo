/* ═══════════════════════════════════════════
   🤖 OpenClaw Agent 双通路桥接
   Skills 版核心：连接 OpenClaw 主 Agent ↔ 宠物 Agent
   
   功能：
   1. 检测 OpenClaw 主 Agent 工作状态 → 企鹅同步反应
   2. 监听主 Agent 对话活动 → 宠物旁观反应
   3. 维护 宠物 Agent 的独立 session
   4. 提供降级：OpenClaw 离线时使用本地规则引擎
   ═══════════════════════════════════════════ */

const ClawBridge = (() => {
  // ─── 状态 ───
  let isClawWorking = false;
  let isOpenClawRunning = false;
  let isPetAgentReady = false;

  // ─── 定时器 ───
  let statusPollInterval = null;    // OpenClaw 状态轮询
  let mainAgentPeekInterval = null; // 主 Agent 旁观
  let bubbleInterval = null;        // 工作模式气泡轮播

  // ─── 动作状态 ───
  let currentActions = [];
  let actionIndex = 0;
  let lastMainAgentSummary = '';

  // ─── 动作关键词 → 中文文案映射 ───
  const ACTION_MAP = {
    // 文件操作
    'read_file':     '📖 正在阅读文件...',
    'write_to_file': '✏️ 正在写入文件...',
    'replace_in_file':'🔧 正在修改代码...',
    'delete_file':   '🗑️ 正在删除文件...',
    'list_dir':      '📂 正在浏览目录...',
    'search_file':   '🔍 正在搜索文件...',
    'search_content':'🔎 正在搜索内容...',
    // 终端操作
    'execute_command':'⚡ 正在执行命令...',
    'terminal':      '💻 正在操作终端...',
    'npm install':   '📦 正在安装依赖...',
    'npm run':       '🏃 正在运行脚本...',
    'git':           '🔀 正在操作Git...',
    'pip install':   '🐍 正在安装Python包...',
    // 代码操作
    'function':      '⚙️ 正在编写函数...',
    'class':         '🏗️ 正在定义类...',
    'import':        '📥 正在导入模块...',
    'test':          '🧪 正在运行测试...',
    'debug':         '🐛 正在调试代码...',
    'fix':           '🔨 正在修复Bug...',
    'refactor':      '♻️ 正在重构代码...',
    'optimize':      '⚡ 正在优化性能...',
    // 分析思考
    'analyze':       '🧠 正在分析代码...',
    'think':         '🤔 正在思考方案...',
    'plan':          '📋 正在制定计划...',
    'review':        '👀 正在审查代码...',
    'search':        '🔍 正在搜索资料...',
    // 创建构建
    'create':        '🎨 正在创建文件...',
    'build':         '🏗️ 正在构建项目...',
    'deploy':        '🚀 正在部署应用...',
    // 通用状态
    'working':       '💻 OpenClaw 正在工作...',
    'coding':        '⌨️ 正在敲代码...',
    'generating':    '✨ 正在生成代码...',
    'processing':    '⏳ 正在处理中...',
  };

  // ═══════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════

  function init() {
    console.log('🤖 OpenClaw Agent Bridge 初始化...');

    // 监听来自主进程的 OpenClaw 状态更新
    if (window.electronAPI) {
      // 工作状态回调（主进程通过进程监控发现 OpenClaw 活动）
      if (window.electronAPI.onClawStatus) {
        window.electronAPI.onClawStatus((data) => {
          handleClawStatus(data);
        });
      }

      // OpenClaw Agent 事件回调（如果 OpenClaw 支持事件推送）
      if (window.electronAPI.onOpenClawEvent) {
        window.electronAPI.onOpenClawEvent((event) => {
          handleOpenClawEvent(event);
        });
      }
    }

    // 启动状态轮询（每5秒）
    statusPollInterval = setInterval(pollOpenClawStatus, 5000);

    // 启动主 Agent 旁观（每60秒偷看一次主对话）
    mainAgentPeekInterval = setInterval(peekMainAgent, 60000);

    // 首次检查
    pollOpenClawStatus();
  }

  // ═══════════════════════════════════════════
  // OpenClaw 状态轮询
  // ═══════════════════════════════════════════

  async function pollOpenClawStatus() {
    try {
      // 通过 IPC 检测 OpenClaw 相关进程
      if (window.electronAPI && window.electronAPI.getProcessList) {
        const processes = await window.electronAPI.getProcessList();
        const clawProcs = processes.filter(p => {
          const name = p.name.toLowerCase();
          return name.includes('claw') ||
                 name.includes('claude') ||
                 name.includes('codebuddy') ||
                 (name.includes('node') && p.cpuPercent > 30);
        });

        const wasRunning = isOpenClawRunning;
        isOpenClawRunning = clawProcs.length > 0;

        // 检测高 CPU 活动（说明 OpenClaw 正在工作）
        const activeProc = clawProcs.find(p => p.cpuPercent > 15);
        const wasWorking = isClawWorking;

        if (activeProc && !isClawWorking) {
          startClawWorkMode();
        } else if (!activeProc && isClawWorking) {
          // 延迟停止，避免闪烁
          setTimeout(() => {
            if (isClawWorking) {
              // 再检查一次
              checkIfStillWorking();
            }
          }, 8000);
        }

        // 首次检测到 OpenClaw
        if (!wasRunning && isOpenClawRunning) {
          onOpenClawConnected();
        } else if (wasRunning && !isOpenClawRunning) {
          onOpenClawDisconnected();
        }
      }

      // 同时更新 AIBrain 连接状态
      if (typeof AIBrain !== 'undefined') {
        isPetAgentReady = AIBrain.isConnected;
      }
    } catch (e) {
      // 静默失败
    }
  }

  async function checkIfStillWorking() {
    if (!window.electronAPI || !window.electronAPI.getProcessList) return;
    try {
      const processes = await window.electronAPI.getProcessList();
      const active = processes.find(p => {
        const name = p.name.toLowerCase();
        return (name.includes('claw') || name.includes('claude') || name.includes('codebuddy')) &&
               p.cpuPercent > 15;
      });
      if (!active && isClawWorking) {
        stopClawWorkMode('');
      }
    } catch (e) {}
  }

  // ═══════════════════════════════════════════
  // OpenClaw 连接/断开事件
  // ═══════════════════════════════════════════

  function onOpenClawConnected() {
    console.log('🤖 检测到 OpenClaw 运行中！');
    isOpenClawRunning = true;

    // 静默连接，不弹气泡（减少刷屏）

    // 尝试连接宠物 Agent
    if (typeof AIBrain !== 'undefined') {
      AIBrain.checkConnection().then(connected => {
        isPetAgentReady = connected;
        if (connected) {
          console.log('🤖 宠物 Agent 就绪 ✅');
        } else {
          console.log('🤖 宠物 Agent 未就绪，使用降级模式');
        }
      });
    }
  }

  function onOpenClawDisconnected() {
    console.log('🤖 OpenClaw 已离线');
    isOpenClawRunning = false;
    isPetAgentReady = false;

    if (isClawWorking) {
      stopClawWorkMode('');
    }
    // 静默断开，不弹气泡
  }

  // ═══════════════════════════════════════════
  // 主进程 IPC 状态处理
  // ═══════════════════════════════════════════

  function handleClawStatus(data) {
    if (data.status === 'working') {
      if (!isClawWorking) {
        startClawWorkMode();
      }
      if (data.action) {
        updateCurrentAction(data.action);
      }
    } else if (data.status === 'idle' || data.status === 'done') {
      if (isClawWorking) {
        stopClawWorkMode(data.summary || '');
      }
    }
  }

  /**
   * 处理 OpenClaw 推送的事件（如果支持）
   */
  function handleOpenClawEvent(event) {
    switch (event.type) {
      case 'agent_message':
        // 主 Agent 产出新消息
        if (event.agentName !== 'qq-pet') {
          // 旁观其他 Agent 的对话
          onMainAgentActivity(event.summary || event.content);
        }
        break;

      case 'tool_call':
        // OpenClaw 正在调用工具
        if (!isClawWorking) startClawWorkMode();
        updateCurrentAction(event.toolName || 'working');
        break;

      case 'task_complete':
        if (isClawWorking) {
          stopClawWorkMode(event.summary || '任务完成');
        }
        break;
    }
  }

  // ═══════════════════════════════════════════
  // 主 Agent 旁观系统（双通路核心特性）
  // ═══════════════════════════════════════════

  async function peekMainAgent() {
    if (!isOpenClawRunning) return;
    if (typeof AIBrain === 'undefined') return;

    try {
      const summary = await AIBrain.peekMainAgent();
      if (summary && summary !== lastMainAgentSummary) {
        lastMainAgentSummary = summary;

        // 有一定概率做出旁观反应（不是每次都反应）
        if (Math.random() < 0.3) {
          const reaction = await AIBrain.reactToMainAgent(summary);
          if (reaction && typeof BubbleSystem !== 'undefined') {
            BubbleSystem.show(`👀 ${reaction}`, 4000);
          }
        }
      }
    } catch (e) {
      // 旁观失败不影响主功能
    }
  }

  function onMainAgentActivity(summary) {
    if (!summary) return;
    lastMainAgentSummary = summary;

    // 低概率旁观反应
    if (Math.random() < 0.2) {
      if (typeof AIBrain !== 'undefined') {
        AIBrain.reactToMainAgent(summary).then(reaction => {
          if (reaction && typeof BubbleSystem !== 'undefined') {
            BubbleSystem.show(`👀 ${reaction}`, 4000);
          }
        });
      }
    }
  }

  // ═══════════════════════════════════════════
  // 工作模式管理
  // ═══════════════════════════════════════════

  function extractActions(text) {
    const actions = [];
    const lower = text.toLowerCase();
    for (const [keyword, label] of Object.entries(ACTION_MAP)) {
      if (lower.includes(keyword.toLowerCase())) {
        actions.push({ keyword, label });
      }
    }
    if (actions.length === 0) {
      actions.push({ keyword: 'working', label: ACTION_MAP.working });
    }
    return actions;
  }

  function updateCurrentAction(actionText) {
    const actions = extractActions(actionText);
    if (actions.length > 0) {
      currentActions = actions;
      // 不再每次动作变化都弹气泡，由工作模式轮播统一控制
      if (typeof PetDiary !== 'undefined') {
        PetDiary.addEntry('claw_work', `OpenClaw: ${actions[0].label}`);
      }
    }
  }

  function startClawWorkMode() {
    if (isClawWorking) return;
    isClawWorking = true;

    // 暂停行为引擎，切换到工作动画
    if (typeof BehaviorEngine !== 'undefined') BehaviorEngine.pause();
    if (typeof SpriteRenderer !== 'undefined') SpriteRenderer.setAnimation('working_1');
    // 不弹气泡，静默进入工作模式

    if (typeof PetDiary !== 'undefined') {
      PetDiary.addEntry('claw_work', 'OpenClaw 开始工作了！企鹅进入协同工作模式');
    }

    // 定期切换工作动画（30秒一次，不再弹气泡）
    actionIndex = 0;
    bubbleInterval = setInterval(() => {
      if (!isClawWorking) {
        clearInterval(bubbleInterval);
        return;
      }

      const anim = Math.random() > 0.5 ? 'working_1' : 'working_2';
      if (typeof SpriteRenderer !== 'undefined') SpriteRenderer.setAnimation(anim);
      // 不再轮播弹气泡，只切换动画
    }, 30000);
  }

  function stopClawWorkMode(summary) {
    if (!isClawWorking) return;
    isClawWorking = false;

    clearInterval(bubbleInterval);
    bubbleInterval = null;
    currentActions = [];
    actionIndex = 0;

    if (typeof SpriteRenderer !== 'undefined') SpriteRenderer.setAnimation('happy');
    // 不弹气泡，静默完成

    if (typeof PetDiary !== 'undefined') {
      PetDiary.addEntry('claw_work', 'OpenClaw 完成工作了！');
    }

    setTimeout(() => {
      if (typeof SpriteRenderer !== 'undefined') SpriteRenderer.setAnimation('idle');
      if (typeof BehaviorEngine !== 'undefined') BehaviorEngine.resume();
    }, 4000);
  }

  // ═══════════════════════════════════════════
  // 外部接口
  // ═══════════════════════════════════════════

  function notifyClawAction(actionText) {
    if (!isClawWorking) startClawWorkMode();
    updateCurrentAction(actionText);
  }

  function notifyClawDone(summary) {
    stopClawWorkMode(summary || '');
  }

  /**
   * 获取当前连接信息（给 UI 展示用）
   */
  function getStatus() {
    return {
      openClawRunning: isOpenClawRunning,
      petAgentReady: isPetAgentReady,
      isWorking: isClawWorking,
    };
  }

  return {
    init,
    notifyClawAction,
    notifyClawDone,
    getStatus,
    get isClawWorking() { return isClawWorking; },
    get isOpenClawRunning() { return isOpenClawRunning; },
    get isPetAgentReady() { return isPetAgentReady; },
  };
})();
