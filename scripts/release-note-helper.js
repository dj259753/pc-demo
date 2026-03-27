#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(command) {
  return execSync(command, { encoding: 'utf-8' }).trim();
}

function safeRun(command) {
  try {
    return run(command);
  } catch {
    return '';
  }
}

function getBaseRef(useRoot) {
  if (useRoot) return safeRun('git rev-list --max-parents=0 HEAD | tail -n 1') || '';
  const latestTag = safeRun('git tag --sort=-creatordate | head -n 1');
  if (latestTag) return latestTag;
  return safeRun('git rev-list --max-parents=0 HEAD | tail -n 1') || '';
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function pickHighlights(commits, files) {
  const buckets = {
    feature: [],
    fix: [],
    ux: [],
    infra: [],
  };
  const joinText = `${commits.join('\n')}\n${files.join('\n')}`.toLowerCase();

  commits.forEach((c) => {
    const t = c.toLowerCase();
    if (/(add|新增|支持|接入|实现|feature)/.test(t)) buckets.feature.push(c);
    else if (/(fix|修复|问题|bug|兼容)/.test(t)) buckets.fix.push(c);
    else if (/(ui|样式|交互|体验|vad|voice|语音)/.test(t)) buckets.ux.push(c);
    else buckets.infra.push(c);
  });

  const output = [];
  if (buckets.feature.length) output.push(`新增能力：${buckets.feature.slice(0, 2).join('；')}`);
  if (buckets.fix.length) output.push(`问题修复：${buckets.fix.slice(0, 2).join('；')}`);
  if (buckets.ux.length) output.push(`交互优化：${buckets.ux.slice(0, 2).join('；')}`);
  if (!output.length && commits.length) output.push(`代码更新：${commits.slice(0, 3).join('；')}`);

  if (/renderer\/js\/voice-mode\.js/.test(joinText)) {
    output.push('语音实时通话在嘈杂环境下的 VAD 判定更稳定。');
  }
  if (/electron\/main\.js/.test(joinText)) {
    output.push('更新检查逻辑增强，支持更多版本信息来源。');
  }
  if (/renderer\/js\/taskbar-ui\.js|renderer\/index\.html/.test(joinText)) {
    output.push('设置菜单新增更新相关入口，手动检查更直接。');
  }

  return uniq(output).slice(0, 6);
}

function main() {
  const useRoot = process.argv.includes('--from-root');
  const baseRef = getBaseRef(useRoot);
  if (!baseRef) {
    console.error('无法确定对比基线，请先初始化 Git 仓库。');
    process.exit(1);
  }

  const range = `${baseRef}..HEAD`;
  const commitsRaw = safeRun(`git log --pretty=%s ${range}`);
  const filesRaw = safeRun(`git diff --name-only ${range}`);
  const commits = commitsRaw ? commitsRaw.split('\n').filter(Boolean) : [];
  const files = filesRaw ? filesRaw.split('\n').filter(Boolean) : [];
  const highlights = pickHighlights(commits, files);

  const releasePath = path.join(process.cwd(), 'release', 'version.json');
  let currentVersion = '0.0.0';
  if (fs.existsSync(releasePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(releasePath, 'utf-8'));
      currentVersion = parsed.version || currentVersion;
    } catch {}
  }

  const draftLines = [
    `# v${currentVersion} 发布说明草稿`,
    '',
    `- 对比范围：\`${baseRef}..HEAD\``,
    '',
    '## 建议更新内容',
    ...highlights.map((h) => `- ${h}`),
    '',
    '## 涉及提交',
    ...commits.slice(0, 20).map((c) => `- ${c}`),
  ];

  const outPath = path.join(process.cwd(), 'release', 'RELEASE_NOTES_DRAFT.md');
  fs.writeFileSync(outPath, `${draftLines.join('\n')}\n`, 'utf-8');
  console.log(`已生成：${outPath}`);
  console.log(`基线：${baseRef}`);
  console.log(`提交数：${commits.length}，改动文件数：${files.length}`);
}

main();
