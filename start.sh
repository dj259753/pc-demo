#!/bin/bash
# 🐧 QQ宠物 — 启动脚本
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

# 加载 nvm（如果存在）
for nvm_path in "$HOME/.nvm/nvm.sh" "$HOME/.config/nvm/nvm.sh" "/opt/homebrew/opt/nvm/nvm.sh"; do
  [ -f "$nvm_path" ] && source "$nvm_path" && break
done

# 按优先级查找可用的 Electron
CANDIDATES=(
  "$APP_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
  "$HOME/Desktop/holdclaw/holdclaw/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
  "$HOME/Desktop/openclaw-pet-skill-local/bundle/pc-pet-demo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
)

for e in "${CANDIDATES[@]}"; do
  if [ -f "$e" ]; then
    exec "$e" .
  fi
done

# 最后 fallback
exec npx electron .
