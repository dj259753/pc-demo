#!/usr/bin/env node
/**
 * 命令行：在启动 Electron 前确保 resources/.../runtime/node 存在（无则 CDN 下载）
 *   npm run ensure:runtime-node
 */
'use strict';

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const targetFromArch = `${process.platform}-${process.arch}`;

const { ensureRuntimeNodeDownloaded } = require(path.join(ROOT, 'electron', 'backend', 'runtime-node-download.js'));

/**
 * Rosetta 下 `node` 常为 x64，会解析成 darwin-x64，但资源目录往往只有 darwin-arm64。
 * 优先 CLAW_TARGET → 当前 arch 目录 → macOS 下任存在的 darwin-arm64 / darwin-x64。
 */
function findResourcesRoot() {
  const candidates = [];
  if (process.env.CLAW_TARGET) candidates.push(String(process.env.CLAW_TARGET).trim());
  candidates.push(targetFromArch);
  if (process.platform === 'darwin') {
    if (!candidates.includes('darwin-arm64')) candidates.push('darwin-arm64');
    if (!candidates.includes('darwin-x64')) candidates.push('darwin-x64');
  }

  for (const sub of ['targets', 'target']) {
    for (const t of candidates) {
      const p = path.join(ROOT, 'resources', sub, t);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

const root = findResourcesRoot();
if (!root) {
  console.error(
    `[ensure-runtime-node] 未找到 gateway 资源目录（试过 ${targetFromArch} 等）。` +
      '请准备 resources/targets/<平台>-<arch>/，或设置 CLAW_TARGET=darwin-arm64（Apple 芯片但 Node 为 x64 时常用）。'
  );
  process.exit(1);
}

console.log(`[ensure-runtime-node] 使用资源目录: ${path.relative(ROOT, root)}`);

ensureRuntimeNodeDownloaded(root, console.log)
  .then((r) => {
    if (r.skipped) console.log(`[ensure-runtime-node] 已存在有效 ${r.dest || path.join(root, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node')}，跳过`);
    process.exit(0);
  })
  .catch((e) => {
    console.error('[ensure-runtime-node]', e.message);
    process.exit(1);
  });
