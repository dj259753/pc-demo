#!/bin/bash
# ═══════════════════════════════════════════
# QQ宠物 Skills 版 — 安装脚本
# 自动配置 OpenClaw qq-pet Agent workspace
# ═══════════════════════════════════════════

set -e

echo "🐧 QQ宠物 Skills 版安装程序"
echo "═══════════════════════════════════"

# ─── 检测环境 ───
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
PET_AGENT_DIR="$HOME/.openclaw/agents/qq-pet"

echo ""
echo "📍 Skill 目录: $SKILL_DIR"
echo "📍 Agent 目录: $PET_AGENT_DIR"

# ─── 检测 OpenClaw ───
echo ""
echo "🔍 检测 OpenClaw..."

OPENCLAW_FOUND=false

# 检查 OpenClaw CLI
if command -v claw &> /dev/null; then
  echo "  ✅ 找到 claw CLI: $(which claw)"
  OPENCLAW_FOUND=true
elif command -v openclaw &> /dev/null; then
  echo "  ✅ 找到 openclaw CLI: $(which openclaw)"
  OPENCLAW_FOUND=true
fi

# 检查 OpenClaw 进程
if pgrep -f "claw|openclaw|codebuddy" > /dev/null 2>&1; then
  echo "  ✅ 检测到 OpenClaw 进程运行中"
  OPENCLAW_FOUND=true
fi

if [ "$OPENCLAW_FOUND" = false ]; then
  echo "  ⚠️  未检测到 OpenClaw，宠物将在降级模式下运行"
  echo "  💡 安装 OpenClaw 后可获得完整 AI 对话体验"
fi

# ─── 创建 Agent Workspace ───
echo ""
echo "📂 创建 qq-pet Agent workspace..."

mkdir -p "$PET_AGENT_DIR/memory"
mkdir -p "$PET_AGENT_DIR/.workbuddy/memory"

# 复制 Agent 配置文件
cp "$SKILL_DIR/agents/qq-pet/SOUL.md" "$PET_AGENT_DIR/SOUL.md"
cp "$SKILL_DIR/agents/qq-pet/IDENTITY.md" "$PET_AGENT_DIR/IDENTITY.md"
cp "$SKILL_DIR/agents/qq-pet/AGENTS.yml" "$PET_AGENT_DIR/AGENTS.yml"

echo "  ✅ SOUL.md 已部署"
echo "  ✅ IDENTITY.md 已部署"
echo "  ✅ AGENTS.yml 已部署"

# ─── 创建初始记忆文件 ───
TODAY=$(date +%Y-%m-%d)
MEMORY_FILE="$PET_AGENT_DIR/memory/MEMORY.md"

if [ ! -f "$MEMORY_FILE" ]; then
  cat > "$MEMORY_FILE" << 'EOF'
# 🐧 小Q的记忆

## 关于主人
- 还不太了解主人，需要多互动才能记住更多！

## 重要的事
- 今天是我来到主人桌面的第一天！

*最后更新：安装日*
EOF
  echo "  ✅ 初始记忆文件已创建"
fi

# ─── 安装桌宠应用依赖 ───
echo ""
echo "📦 安装桌宠应用依赖..."

APP_DIR="$SKILL_DIR/.."
if [ -f "$APP_DIR/package.json" ]; then
  cd "$APP_DIR"
  
  # 检测 npm
  if command -v npm &> /dev/null; then
    npm install --production 2>&1 | tail -3
    echo "  ✅ 依赖安装完成"
  else
    echo "  ⚠️  npm 未找到，请手动运行 npm install"
  fi
fi

# ─── 配置 AI 对话连接 ───
echo ""
echo "🔗 配置 AI 对话连接..."

PET_CONFIG_DIR="$HOME/.qq-pet/config"
mkdir -p "$PET_CONFIG_DIR"

AI_CONFIG_FILE="$PET_CONFIG_DIR/ai-config.json"

# 读取 OpenClaw token
OPENCLAW_CONFIG="$HOME/.openclaw/openclaw.json"
if [ -f "$OPENCLAW_CONFIG" ]; then
  OPENCLAW_TOKEN=$(python3 -c "import json; print(json.load(open('$OPENCLAW_CONFIG')).get('token',''))" 2>/dev/null || echo "")
else
  OPENCLAW_TOKEN=""
fi

if [ -n "$OPENCLAW_TOKEN" ]; then
  cat > "$AI_CONFIG_FILE" << EOF
{
  "provider": "openclaw",
  "api_url": "http://127.0.0.1:18789/v1/chat/completions",
  "api_key": "$OPENCLAW_TOKEN",
  "model": "openclaw:main"
}
EOF
  echo "  ✅ AI 配置已生成: $AI_CONFIG_FILE"
else
  echo "  ⚠️  未找到 OpenClaw token，AI 对话将在降级模式下运行"
  echo "  💡 请确保 OpenClaw 已配置: $OPENCLAW_CONFIG"
fi

# ─── 生成随机性格 ───
echo ""
echo "🎲 为你的企鹅分配性格..."

PERSONALITIES=("ENFP" "INFP" "ENFJ" "INFJ" "ENTP" "INTP" "ENTJ" "INTJ" "ESFP" "ISFP" "ESFJ" "ISFJ" "ESTP" "ISTP" "ESTJ" "ISTJ")
RANDOM_IDX=$((RANDOM % 16))
ASSIGNED_PERSONALITY=${PERSONALITIES[$RANDOM_IDX]}

# 写入性格配置
cat > "$PET_AGENT_DIR/personality.json" << EOF
{
  "assignedMBTI": "$ASSIGNED_PERSONALITY",
  "assignedDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "note": "性格在安装时随机分配，可通过修改此文件更换"
}
EOF

echo "  🎭 你的企鹅性格是: $ASSIGNED_PERSONALITY"

# ─── 完成 ───
echo ""
echo "═══════════════════════════════════"
echo "🎉 安装完成！"
echo ""
echo "📌 启动宠物:"
echo "   cd $APP_DIR && npm start"
echo ""
echo "📌 Agent Workspace:"
echo "   $PET_AGENT_DIR"
echo ""
echo "📌 企鹅性格: $ASSIGNED_PERSONALITY"
echo ""
echo "💡 提示:"
echo "   - 确保 OpenClaw 在运行以获得最佳 AI 对话体验"
echo "   - 没有 OpenClaw 也能运行（使用本地降级模式）"
echo "   - 修改 $PET_AGENT_DIR/SOUL.md 可以自定义企鹅性格"
echo ""
echo "🐧 小Q已经准备好陪伴你了！"
