/* ═══════════════════════════════════════════
   AI 对话系统 (CMD 终端风格)
   通过 AIBrain 统一调用 AI 接口
   ═══════════════════════════════════════════ */

const ChatSystem = (() => {
  const historyEl = document.getElementById('chat-history');
  const inputEl = document.getElementById('chat-input');

  const messageHistory = [];

  function init() {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && inputEl.value.trim()) {
        const text = inputEl.value.trim();
        inputEl.value = '';
        sendMessage(text);
      }
    });
  }

  // ─── 添加一行到终端 ───
  function addLine(text, cls = '') {
    const div = document.createElement('div');
    div.className = `cmd-line ${cls}`;
    div.textContent = text;

    // 给 user 和 ai 消息添加复制按钮
    if (cls === 'user' || cls === 'ai') {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'cmd-copy-btn';
      copyBtn.textContent = '📋';
      copyBtn.title = '复制';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        // 复制纯文本（不含前缀 emoji）
        const copyText = text;
        if (window.electronAPI && window.electronAPI.clipboardCopy) {
          window.electronAPI.clipboardCopy(copyText);
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(copyText).catch(() => {});
        }
        copyBtn.textContent = '✅';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '📋';
          copyBtn.classList.remove('copied');
        }, 1500);
      });
      div.appendChild(copyBtn);
    }

    historyEl.appendChild(div);
    historyEl.scrollTop = historyEl.scrollHeight;
    return div;
  }

  // ─── 发送消息 ───
  async function sendMessage(text) {
    addLine(text, 'user');
    SoundEngine.click();

    // 通知互动系统
    if (typeof ProactiveChat !== 'undefined') ProactiveChat.notifyInteraction();
    if (typeof Personality !== 'undefined') Personality.onEvent('chat');

    // 企鹅进入思考状态
    BehaviorEngine.pause();
    PetState.setState(PetState.STATES.THINKING, 30000);
    SpriteRenderer.setAnimation('thinking');
    BubbleSystem.showThinking();
    const thinkingLine = addLine('正在思考', 'thinking');

    messageHistory.push({ role: 'user', content: text });

    // 记录到记忆
    if (typeof PetMemory !== 'undefined') {
      PetMemory.addDialogue('user', text);
      PetMemory.addEvent('chat', `CMD终端聊天: "${text.substring(0, 20)}"`);
    }

    try {
      let reply;
      // 优先通过 AIBrain（带性格/记忆/情绪 prompt）
      if (typeof AIBrain !== 'undefined') {
        reply = await AIBrain.chat(text, messageHistory.slice(-10));
      } else {
        throw new Error('无可用网络模型');
      }

      thinkingLine.remove();
      addLine(reply, 'ai');
      messageHistory.push({ role: 'assistant', content: reply });

      // 记录到记忆
      if (typeof PetMemory !== 'undefined') {
        PetMemory.addDialogue('assistant', reply);
      }

      PetState.setState(PetState.STATES.TALKING, 3000);
      SpriteRenderer.setAnimation('talking');
      BubbleSystem.showAIReply(reply);
      SoundEngine.aiReply();

      // 异步提取记忆
      if (typeof AIBrain !== 'undefined') {
        const convo = `用户: ${text}\n宠物: ${reply}`;
        AIBrain.summarizeForMemory(convo).then(memories => {
          if (memories && typeof PetMemory !== 'undefined') {
            memories.forEach(m => PetMemory.addImportantConversation(m));
          }
        });
      }

      setTimeout(() => {
        PetState.autoState();
        BehaviorEngine.resume();
      }, 3000);

    } catch (err) {
      thinkingLine.remove();
      addLine('[系统] 无网络或模型不可用，企鹅已睡眠', 'system');
      PetState.setState(PetState.STATES.SLEEPING, 600000);
      SpriteRenderer.setAnimation('sleeping');
      BubbleSystem.show('没网了，我先睡着了。', 4000);

      setTimeout(() => {
        BehaviorEngine.resume();
      }, 2000);
    }
  }

  return { init, sendMessage, addLine };
})();
