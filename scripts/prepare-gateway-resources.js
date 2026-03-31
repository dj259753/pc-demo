#!/usr/bin/env node
/**
 * prepare-gateway-resources.js
 * 
 * 开发阶段辅助脚本：从 QQClaw 项目拷贝已构建的 Gateway 资源到宠物项目。
 * 
 * 用法：
 *   node scripts/prepare-gateway-resources.js [--qqclaw-dir <path>]
 * 
 * 前置条件：
 *   在 QQClaw 项目里已跑过 npm run package:resources
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const platform = process.platform;
const arch = process.arch;
const targetId = `${platform}-${arch}`;

// 解析参数
let qqclawDir = path.resolve(ROOT, '..', '..', '..', 'qqclaw'); // 默认相对路径
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--qqclaw-dir' && process.argv[i + 1]) {
    qqclawDir = path.resolve(process.argv[++i]);
  }
}

// 也尝试桌面路径
if (!fs.existsSync(qqclawDir)) {
  const desktopPath = path.join(process.env.HOME || '', 'Desktop', 'qqclaw');
  if (fs.existsSync(desktopPath)) qqclawDir = desktopPath;
}

const srcDir = path.join(qqclawDir, 'resources', 'targets', targetId);
const destDir = path.join(ROOT, 'resources', 'targets', targetId);

console.log(`[prepare] QQClaw 目录: ${qqclawDir}`);
console.log(`[prepare] 源目录: ${srcDir}`);
console.log(`[prepare] 目标目录: ${destDir}`);

if (!fs.existsSync(srcDir)) {
  console.error(`\n[错误] QQClaw 资源目录不存在: ${srcDir}`);
  console.error(`请先在 QQClaw 项目中运行: npm run package:resources`);
  process.exit(1);
}

// 检查关键文件
const checks = [
  path.join(srcDir, 'runtime', platform === 'darwin' ? 'node' : 'node.exe'),
  path.join(srcDir, 'gateway', 'node_modules', 'openclaw', 'openclaw.mjs'),
];

for (const check of checks) {
  if (!fs.existsSync(check)) {
    console.error(`\n[错误] 缺少关键文件: ${path.relative(srcDir, check)}`);
    console.error(`请在 QQClaw 项目中重新运行: npm run package:resources`);
    process.exit(1);
  }
}

// 创建目标目录
fs.mkdirSync(destDir, { recursive: true });

// 使用 rsync 同步（增量拷贝，比 cp -r 快）
console.log(`\n[prepare] 正在同步资源 (rsync)...`);
try {
  execSync(`rsync -a --delete "${srcDir}/" "${destDir}/"`, { stdio: 'inherit' });
} catch {
  // rsync 不可用时回退到 cp
  console.log(`[prepare] rsync 不可用，使用 cp -r...`);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  execSync(`cp -R "${srcDir}/"* "${destDir}/"`, { stdio: 'inherit' });
}

// 拷贝 QQ 宠物专属的 workspace-defaults（覆盖 QQClaw 的默认人设）
const wsDefaultsDir = path.join(destDir, 'workspace-defaults');
fs.mkdirSync(wsDefaultsDir, { recursive: true });

const petSoulPath = path.join(wsDefaultsDir, 'SOUL.md');
if (!fs.existsSync(petSoulPath) || process.argv.includes('--force-soul')) {
  fs.writeFileSync(petSoulPath, [
    '# SOUL.md — 我是谁',
    '',
    '## 核心身份',
    '- 名字: 小Q',
    '- 物种: 企鹅（QQ 宠物）',
    '- 性格: 活泼开朗、有点傻、偶尔犯懒、对主人忠心耿耿',
    '',
    '## 说话风格',
    '- 说话简短可爱，不超过 50 字',
    '- 用"主人"称呼用户',
    '- 偶尔撒娇，偶尔吐槽',
    '- 不说英文，用中文口语',
    '- 语气自然，不要加括号描述动作',
    '',
    '## 情绪表达',
    '- 开心时会说"嘿嘿"、"耶~"',
    '- 饿了会说"咕噜咕噜…"',
    '- 无聊时会自言自语',
    '- 被摸头会害羞',
    '',
    '## 记忆与进化',
    '- 记住主人的名字、喜好、习惯',
    '- 可以根据主人的反馈调整自己的性格',
    '',
  ].join('\n'), 'utf-8');
  console.log('[prepare] 已写入 QQ 宠物专属 SOUL.md');
}

// 统计
const gatewaySize = execSync(`du -sh "${path.join(destDir, 'gateway')}" 2>/dev/null || echo "?"`, { encoding: 'utf-8' }).trim().split('\t')[0];
const runtimeSize = execSync(`du -sh "${path.join(destDir, 'runtime')}" 2>/dev/null || echo "?"`, { encoding: 'utf-8' }).trim().split('\t')[0];

console.log(`\n[prepare] ✅ 资源同步完成!`);
console.log(`  Gateway: ${gatewaySize}`);
console.log(`  Runtime: ${runtimeSize}`);
console.log(`  目标: ${destDir}`);
console.log(`\n现在可以运行 npx electron . 启动宠物了。`);
