/* ═══════════════════════════════════════════
   文件拖拽 & Claw AI 代理
   拖拽代码文件到企鹅上，获取AI代码摘要
   ═══════════════════════════════════════════ */

const FileDrop = (() => {
  let droppedFileContent = null;
  let isCarrying = false;

  function init() {
    const petContainer = document.getElementById('pet-container');
    if (!petContainer) return;

    // 禁止默认拖放行为
    document.addEventListener('dragover', (e) => { e.preventDefault(); });
    document.addEventListener('drop', (e) => { e.preventDefault(); });

    // 宠物容器接受拖放
    petContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      petContainer.classList.add('file-drop-hover');
    });

    petContainer.addEventListener('dragleave', (e) => {
      e.preventDefault();
      petContainer.classList.remove('file-drop-hover');
    });

    petContainer.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      petContainer.classList.remove('file-drop-hover');

      const files = e.dataTransfer.files;
      if (files.length === 0) return;

      const file = files[0];
      const filePath = file.path;
      if (!filePath) {
        BubbleSystem.show('没有获取到文件路径...😢', 2000);
        return;
      }

      // 企鹅变为"搬运"状态
      isCarrying = true;
      SpriteRenderer.setAnimation('happy');
      BubbleSystem.show(`收到文件：${file.name} 📁\n正在分析中...🔍`, 3000);
      SoundEngine.click();

      BehaviorEngine.pause();

      // 读取文件内容
      if (window.electronAPI) {
        try {
          const result = await window.electronAPI.readDroppedFile(filePath);
          if (result.error) {
            BubbleSystem.show(`读取失败：${result.error} 😢`, 3000);
            isCarrying = false;
            BehaviorEngine.resume();
            return;
          }

          droppedFileContent = result;

          // 切换为思考动画
          SpriteRenderer.setAnimation('thinking');
          BubbleSystem.show('正在分析代码...🤔💻', 2000);

          // 生成本地代码摘要
          setTimeout(() => {
            const summary = generateCodeSummary(result);
            showCodeSummary(summary, result.name);
            isCarrying = false;
          }, 2000);

        } catch (err) {
          BubbleSystem.show(`出错了：${err.message}`, 3000);
          isCarrying = false;
          BehaviorEngine.resume();
        }
      }
    });
  }

  // ─── 本地代码摘要生成（无需API） ───
  function generateCodeSummary(fileData) {
    const { content, ext, name, size } = fileData;
    const lines = content.split('\n');
    const lineCount = lines.length;
    const sizeKB = (size / 1024).toFixed(1);

    // 分析代码特征
    const imports = lines.filter(l => l.match(/^(import |from |require\(|#include|using )/)).length;
    const functions = lines.filter(l => l.match(/(function |def |fn |func |=>|->)/)).length;
    const classes = lines.filter(l => l.match(/(class |struct |interface |enum )/)).length;
    const comments = lines.filter(l => l.trim().match(/^(\/\/|#|\/\*|\*|""")/)).length;
    const todos = lines.filter(l => l.match(/TODO|FIXME|HACK|XXX/i)).length;

    // 检测语言
    const langMap = {
      '.js': 'JavaScript', '.ts': 'TypeScript', '.py': 'Python',
      '.java': 'Java', '.cpp': 'C++', '.c': 'C', '.go': 'Go',
      '.rs': 'Rust', '.swift': 'Swift', '.rb': 'Ruby',
      '.html': 'HTML', '.css': 'CSS', '.json': 'JSON',
      '.md': 'Markdown', '.sh': 'Shell', '.sql': 'SQL',
    };
    const lang = langMap[ext] || ext;

    let summary = `📄 ${name}\n`;
    summary += `├ 语言: ${lang}\n`;
    summary += `├ ${lineCount}行 (${sizeKB}KB)\n`;
    if (imports > 0) summary += `├ ${imports}个导入\n`;
    if (functions > 0) summary += `├ ${functions}个函数\n`;
    if (classes > 0) summary += `├ ${classes}个类/结构体\n`;
    if (comments > 0) summary += `├ ${comments}行注释\n`;
    if (todos > 0) summary += `├ ⚠️ ${todos}个TODO\n`;

    // 提取前几个函数/类名
    const nameMatches = [];
    for (const line of lines) {
      const funcMatch = line.match(/(?:function|def|fn|func)\s+(\w+)/);
      const classMatch = line.match(/(?:class|struct|interface)\s+(\w+)/);
      if (funcMatch) nameMatches.push(funcMatch[1]);
      if (classMatch) nameMatches.push(classMatch[1]);
      if (nameMatches.length >= 5) break;
    }
    if (nameMatches.length > 0) {
      summary += `└ 主要: ${nameMatches.join(', ')}`;
    }

    return summary;
  }

  function showCodeSummary(summary, fileName) {
    SpriteRenderer.setAnimation('talking');
    PetState.setState(PetState.STATES.TALKING, 8000);
    BubbleSystem.show(`🐧 代码分析完成！\n${summary}`, 10000);
    SoundEngine.aiReply();
    if (typeof PetDiary !== 'undefined') PetDiary.addEntry('file_drop', `分析了文件: ${fileName}`);

    setTimeout(() => {
      PetState.autoState();
      SpriteRenderer.setAnimation('idle');
      BehaviorEngine.resume();
    }, 8000);
  }

  return { init, get isCarrying() { return isCarrying; } };
})();
