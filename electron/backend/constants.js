/**
 * constants.js — 路径常量与解析函数
 * 从 QQClaw src/constants.ts 移植，所有路径从 ~/.qqclaw → ~/.qq-pet
 */

'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// ── 网络端口（19790 避开 QQClaw/OpenClaw 的默认 19789）──
const DEFAULT_PORT = 19790;
const DEFAULT_BIND = 'loopback';

// ── 健康检查 ──
const HEALTH_TIMEOUT_MS = 90_000;
const HEALTH_POLL_INTERVAL_MS = 500;

// ── 崩溃冷却 ──
const CRASH_COOLDOWN_MS = 5_000;

// ── 平台判断 ──
const IS_WIN = process.platform === 'win32';

/** 资源根目录（dev 模式指向 targets/<platform-arch>，打包后 afterPack 已拍平） */
function resolveResourcesPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources');
  }
  // dev 模式：优先本仓库内置的 resources/targets/<platform>-<arch>
  const target = process.env.CLAW_TARGET ?? `${process.platform}-${process.arch}`;
  const devPath = path.join(app.getAppPath(), 'resources', 'targets', target);
  if (fs.existsSync(devPath)) return devPath;
  // 兜底：本机 QQClaw 工程产物（未内置 resources 时）
  const qqclawPath = path.join(process.env.HOME || '', 'Desktop', 'qqclaw', 'resources', 'targets', target);
  if (fs.existsSync(qqclawPath)) return qqclawPath;
  return devPath;
}

/** Node.js 二进制 */
function resolveNodeBin() {
  const exe = IS_WIN ? 'node.exe' : 'node';
  if (!app.isPackaged) {
    const bundled = path.join(resolveResourcesPath(), 'runtime', exe);
    return fs.existsSync(bundled) ? bundled : 'node';
  }
  return path.join(resolveResourcesPath(), 'runtime', exe);
}

/** npm CLI */
function resolveNpmBin() {
  const exe = IS_WIN ? 'npm.cmd' : 'npm';
  if (!app.isPackaged) {
    const bundled = path.join(resolveResourcesPath(), 'runtime', exe);
    return fs.existsSync(bundled) ? bundled : 'npm';
  }
  return path.join(resolveResourcesPath(), 'runtime', exe);
}

/** Gateway 入口（优先使用 openclaw.mjs；旧包回退 gateway-entry.mjs） */
function resolveGatewayEntry() {
  const openclawCliEntry = path.join(resolveResourcesPath(), 'gateway', 'node_modules', 'openclaw', 'openclaw.mjs');
  if (fs.existsSync(openclawCliEntry)) return openclawCliEntry;
  return path.join(resolveResourcesPath(), 'gateway', 'gateway-entry.mjs');
}

/** 用户状态目录（~/.qq-pet/） */
function resolveUserStateDir() {
  if (process.env.OPENCLAW_STATE_DIR) return process.env.OPENCLAW_STATE_DIR;
  const home = IS_WIN ? process.env.USERPROFILE : process.env.HOME;
  return path.join(home || '', '.qq-pet');
}

/** 用户 workspace 目录（~/.qq-pet/workspace/） */
function resolveWorkspaceDir() {
  return path.join(resolveUserStateDir(), 'workspace');
}

/** Gateway 工作目录（使用用户 workspace 目录） */
function resolveGatewayCwd() {
  const workspaceDir = resolveWorkspaceDir();
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }
  return workspaceDir;
}

/** 用户配置文件（~/.qq-pet/openclaw.json） */
function resolveUserConfigPath() {
  return path.join(resolveUserStateDir(), 'openclaw.json');
}

/** 用户配置备份目录 */
function resolveConfigBackupDir() {
  return path.join(resolveUserStateDir(), 'config-backups');
}

/** 最近一次可启动配置快照 */
function resolveLastKnownGoodConfigPath() {
  return path.join(resolveUserStateDir(), 'openclaw.last-known-good.json');
}

/** Gateway 诊断日志 */
function resolveGatewayLogPath() {
  return path.join(resolveUserStateDir(), 'gateway.log');
}

/** 内置 skills 目录 */
function resolveBuiltinSkillsDir() {
  return path.join(resolveResourcesPath(), 'gateway', 'node_modules', 'openclaw', 'skills');
}

/** skillhub CLI 目录 */
function resolveSkillhubCliDir() {
  return path.join(resolveResourcesPath(), 'skillhub-cli');
}

/** workspace 默认文件目录 */
function resolveWorkspaceDefaultsDir() {
  return path.join(resolveResourcesPath(), 'workspace-defaults');
}

/** workspace 中的 SOUL.md 路径 */
function resolveWorkspaceSoulMdPath() {
  return path.join(resolveUserStateDir(), 'workspace', 'SOUL.md');
}

/** workspace 中的 TOOLS.md 路径 */
function resolveWorkspaceToolsMdPath() {
  return path.join(resolveUserStateDir(), 'workspace', 'TOOLS.md');
}

/** workspace 中的 USER.md 路径 */
function resolveWorkspaceUserMdPath() {
  return path.join(resolveUserStateDir(), 'workspace', 'USER.md');
}

/** agents 模型缓存清理 */
function clearAgentModelsCacheFile() {
  const cacheFile = path.join(resolveUserStateDir(), 'agents', 'main', 'agent', 'models.json');
  try { fs.unlinkSync(cacheFile); } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
}

/** 检查 Setup 是否已完成（openclaw.json 存在且有 provider 配置） */
function isSetupComplete() {
  const configPath = resolveUserConfigPath();
  if (!fs.existsSync(configPath)) return false;
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    // 检查是否有 provider 配置
    const providers = config?.models?.providers;
    if (!providers || typeof providers !== 'object') return false;
    return Object.keys(providers).length > 0;
  } catch {
    return false;
  }
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_BIND,
  HEALTH_TIMEOUT_MS,
  HEALTH_POLL_INTERVAL_MS,
  CRASH_COOLDOWN_MS,
  IS_WIN,
  resolveResourcesPath,
  resolveNodeBin,
  resolveNpmBin,
  resolveGatewayEntry,
  resolveUserStateDir,
  resolveWorkspaceDir,
  resolveGatewayCwd,
  resolveUserConfigPath,
  resolveConfigBackupDir,
  resolveLastKnownGoodConfigPath,
  resolveGatewayLogPath,
  resolveBuiltinSkillsDir,
  resolveSkillhubCliDir,
  resolveWorkspaceDefaultsDir,
  resolveWorkspaceSoulMdPath,
  resolveWorkspaceToolsMdPath,
  resolveWorkspaceUserMdPath,
  clearAgentModelsCacheFile,
  isSetupComplete,
};
