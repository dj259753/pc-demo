/**
 * macOS：内置 Gateway 资源里的 .node / node 二进制常被隔离或签名不匹配，导致 dlopen 失败。
 * 启动前做一次 xattr 清理 + ad-hoc 签名（无需 Apple 开发者账号），减轻本机手工操作。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function walkFiles(root, visitor) {
  if (!root || !fs.existsSync(root)) return;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else visitor(p, e.name);
    }
  }
}

function ensureMacGatewayNativeLoadable(resourcesRoot) {
  if (process.platform !== 'darwin' || !resourcesRoot || !fs.existsSync(resourcesRoot)) return;

  try {
    execFileSync('xattr', ['-cr', resourcesRoot], { stdio: 'ignore' });
  } catch (err) {
    console.warn('[macos-gateway] xattr -cr 失败:', err.message);
  }

  const nodeBin = path.join(resourcesRoot, 'runtime', 'node');
  if (fs.existsSync(nodeBin)) {
    try {
      execFileSync('codesign', ['--force', '--sign', '-', nodeBin], { stdio: 'ignore' });
    } catch (err) {
      console.warn('[macos-gateway] codesign runtime/node 失败:', err.message);
    }
  }

  walkFiles(resourcesRoot, (filePath, name) => {
    if (!name.endsWith('.node')) return;
    try {
      execFileSync('codesign', ['--force', '--sign', '-', filePath], { stdio: 'ignore' });
    } catch {
      /* 单个失败不阻断 */
    }
  });
}

module.exports = { ensureMacGatewayNativeLoadable };
