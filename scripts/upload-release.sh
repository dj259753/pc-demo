#!/bin/bash
set -euo pipefail

# ============================================================
# QQ宠物 上传签名产物到 GitHub Release
# 用法: bash scripts/upload-release.sh --version <ver>
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# ---------- 参数解析 ----------
VERSION=""
DRAFT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)  VERSION="$2"; shift 2 ;;
    --draft)    DRAFT=true; shift ;;
    *)          echo "❌ 未知参数: $1"; exit 1 ;;
  esac
done

if [ -z "$VERSION" ]; then
  echo "❌ 必须指定版本号: --version <ver>"
  exit 1
fi

SIGNED_DIR="dist/${VERSION}-signed"
TAG="v${VERSION}"

# ---------- 检查 gh CLI ----------
if ! command -v gh &>/dev/null; then
  echo "❌ 未安装 gh CLI，请先安装: brew install gh"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "❌ gh CLI 未认证，请先运行: gh auth login"
  exit 1
fi

# ---------- 检查签名产物 ----------
echo ""
echo "🔍 检查签名产物..."

DMG_FILES=()

# 查找所有签名的 DMG
for arch_dir in "$SIGNED_DIR"/darwin-*/; do
  if [ -d "$arch_dir" ]; then
    for dmg in "$arch_dir"*-signed.dmg; do
      if [ -f "$dmg" ]; then
        DMG_FILES+=("$dmg")
        echo "   ✅ $(basename "$dmg") ($(du -sh "$dmg" | cut -f1))"
      fi
    done
  fi
done

if [ ${#DMG_FILES[@]} -eq 0 ]; then
  echo "❌ 未找到签名产物: ${SIGNED_DIR}/darwin-*/*-signed.dmg"
  exit 1
fi

echo "   共 ${#DMG_FILES[@]} 个签名 DMG 待上传"

# ---------- 读取 Changelog 作为 Release Notes ----------
CHANGELOG_FILE="dist/${VERSION}/${VERSION}-changelog.md"
RELEASE_NOTES=""

if [ -f "$CHANGELOG_FILE" ]; then
  # 去掉标题行，只保留更新内容
  RELEASE_NOTES=$(tail -n +3 "$CHANGELOG_FILE")
else
  RELEASE_NOTES="QQ宠物 v${VERSION} 发布"
fi

# ---------- 创建 Tag ----------
echo ""
echo "🏷️  创建 Git Tag: ${TAG}..."

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "   ⚠️  Tag ${TAG} 已存在，跳过创建"
else
  git tag "$TAG"
  git push origin "$TAG"
  echo "   ✅ Tag ${TAG} 已创建并推送"
fi

# ---------- 创建 Release 并上传产物 ----------
echo ""
echo "🚀 创建 GitHub Release v${VERSION}..."

GH_ARGS=(
  "release"
  "create"
  "$TAG"
  "${DMG_FILES[@]}"
  --title "QQ宠物 v${VERSION}"
  --notes "$RELEASE_NOTES"
)

if [ "$DRAFT" = true ]; then
  GH_ARGS+=(--draft)
fi

gh "${GH_ARGS[@]}"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  🎉 GitHub Release v${VERSION} 发布成功！                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
