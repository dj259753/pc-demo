/**
 * config-backup.js — 配置文件备份与恢复
 * 从 QQClaw src/config-backup.ts 移植
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  resolveConfigBackupDir,
  resolveLastKnownGoodConfigPath,
  resolveUserConfigPath,
  resolveUserStateDir,
} = require('./constants');

const BACKUP_FILE_PREFIX = 'openclaw-';
const BACKUP_FILE_EXT = '.json';
const MAX_BACKUP_FILES = 10;
const SETUP_BASELINE_FILE = 'openclaw-setup-baseline.json';

/** 检查当前 openclaw.json 的可解析性 */
function inspectUserConfigHealth() {
  const configPath = resolveUserConfigPath();
  if (!fs.existsSync(configPath)) return { exists: false, validJson: false };
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    JSON.parse(raw);
    return { exists: true, validJson: true };
  } catch (err) {
    return { exists: true, validJson: false, parseError: err?.message ?? 'JSON parse failed' };
  }
}

/** 在覆盖写入配置前自动备份当前文件 */
function backupCurrentUserConfig() {
  const configPath = resolveUserConfigPath();
  const raw = readValidConfigRaw(configPath);
  if (!raw) return;

  const backupDir = ensureBackupDir();
  const fileName = buildBackupFileName(backupDir);
  fs.writeFileSync(path.join(backupDir, fileName), raw, 'utf-8');
  pruneOldBackups(backupDir);
}

/** 列出历史备份 */
function listUserConfigBackups() {
  const backupDir = resolveConfigBackupDir();
  if (!fs.existsSync(backupDir)) return [];
  pruneOldBackups(backupDir);

  return fs.readdirSync(backupDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && isBackupFileName(entry.name))
    .map(entry => {
      const abs = path.join(backupDir, entry.name);
      const stat = fs.statSync(abs);
      return { fileName: entry.name, createdAt: stat.mtime.toISOString(), size: stat.size };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** 首次 setup 成功后保留基线配置 */
function recordSetupBaselineConfigSnapshot() {
  const configPath = resolveUserConfigPath();
  const raw = readValidConfigRaw(configPath);
  if (!raw) return;

  const stateDir = resolveUserStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  const baselinePath = path.join(stateDir, SETUP_BASELINE_FILE);
  if (fs.existsSync(baselinePath)) return;
  fs.writeFileSync(baselinePath, raw, 'utf-8');
}

/** 恢复指定备份 */
function restoreUserConfigBackup(fileName) {
  if (!isBackupFileName(fileName)) throw new Error('非法备份文件名');
  const backupPath = path.join(resolveConfigBackupDir(), fileName);
  if (!fs.existsSync(backupPath)) throw new Error('备份文件不存在');
  const raw = readValidConfigRaw(backupPath);
  if (!raw) throw new Error('备份文件不是有效 JSON');
  backupCurrentUserConfig();
  writeConfigRaw(raw);
}

/** 记录"最近一次可启动"的配置快照 */
function recordLastKnownGoodConfigSnapshot() {
  const configPath = resolveUserConfigPath();
  const raw = readValidConfigRaw(configPath);
  if (!raw) return;

  const stateDir = resolveUserStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  const snapshotPath = resolveLastKnownGoodConfigPath();

  if (fs.existsSync(snapshotPath)) {
    try {
      const prevRaw = fs.readFileSync(snapshotPath, 'utf-8');
      if (prevRaw === raw) return;
    } catch {}
  }
  fs.writeFileSync(snapshotPath, raw, 'utf-8');
}

/** 一键恢复最近一次可启动快照 */
function restoreLastKnownGoodConfigSnapshot() {
  const snapshotPath = resolveLastKnownGoodConfigPath();
  if (!fs.existsSync(snapshotPath)) throw new Error('没有可用的最近成功快照');
  const raw = readValidConfigRaw(snapshotPath);
  if (!raw) throw new Error('最近成功快照损坏');
  backupCurrentUserConfig();
  writeConfigRaw(raw);
}

/** 汇总恢复页面需要的元信息 */
function getConfigRecoveryData() {
  const lastKnownGoodPath = resolveLastKnownGoodConfigPath();
  let lastKnownGoodUpdatedAt = null;
  if (fs.existsSync(lastKnownGoodPath)) {
    try { lastKnownGoodUpdatedAt = fs.statSync(lastKnownGoodPath).mtime.toISOString(); } catch {}
  }
  return {
    configPath: resolveUserConfigPath(),
    backupDir: resolveConfigBackupDir(),
    lastKnownGoodPath,
    hasLastKnownGood: fs.existsSync(lastKnownGoodPath),
    lastKnownGoodUpdatedAt,
    backups: listUserConfigBackups(),
  };
}

// ── 内部工具 ──

function readValidConfigRaw(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    JSON.parse(raw);
    return raw;
  } catch { return null; }
}

function writeConfigRaw(raw) {
  const stateDir = resolveUserStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(resolveUserConfigPath(), raw, 'utf-8');
}

function ensureBackupDir() {
  const backupDir = resolveConfigBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function buildBackupFileName(backupDir) {
  const stamp = formatTimestamp(new Date());
  const base = `${BACKUP_FILE_PREFIX}${stamp}`;
  const primary = `${base}${BACKUP_FILE_EXT}`;
  if (!fs.existsSync(path.join(backupDir, primary))) return primary;
  for (let i = 1; i < 100; i++) {
    const suffix = String(i).padStart(2, '0');
    const candidate = `${base}-${suffix}${BACKUP_FILE_EXT}`;
    if (!fs.existsSync(path.join(backupDir, candidate))) return candidate;
  }
  return `${base}-${Date.now()}${BACKUP_FILE_EXT}`;
}

function isBackupFileName(fileName) {
  return /^openclaw-\d{8}-\d{6}(?:-\d{2}|-\d{13})?\.json$/.test(fileName);
}

function formatTimestamp(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

function pruneOldBackups(backupDir) {
  const files = fs.readdirSync(backupDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && isBackupFileName(entry.name))
    .map(entry => entry.name);
  if (files.length <= MAX_BACKUP_FILES) return;

  const sorted = files
    .map(fileName => {
      const abs = path.join(backupDir, fileName);
      const mtimeMs = fs.statSync(abs).mtimeMs;
      return { fileName, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const toDelete = sorted.slice(MAX_BACKUP_FILES);
  for (const item of toDelete) {
    try { fs.unlinkSync(path.join(backupDir, item.fileName)); } catch {}
  }
}

module.exports = {
  inspectUserConfigHealth,
  backupCurrentUserConfig,
  listUserConfigBackups,
  recordSetupBaselineConfigSnapshot,
  restoreUserConfigBackup,
  recordLastKnownGoodConfigSnapshot,
  restoreLastKnownGoodConfigSnapshot,
  getConfigRecoveryData,
};
