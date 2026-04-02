/**
 * provider-config.js — Provider 配置与验证
 * 从 QQClaw src/provider-config.ts 移植
 * 简化版：只保留 Custom（通用 OpenAI 兼容）验证，
 * 因为 QQ 宠物用户统一通过 baseURL + apiKey + model 配置
 */

'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveUserConfigPath, resolveUserStateDir } = require('./constants');
const { backupCurrentUserConfig } = require('./config-backup');

// ── 用户配置读写 ──

/**
 * 与当前内置 OpenClaw CLI 兼容：去掉已废弃/非法字段，避免 Gateway 校验失败。
 */
function sanitizeOpenclawConfig(config) {
  if (!config || typeof config !== 'object') return {};
  const c = JSON.parse(JSON.stringify(config));
  if (c.commands && typeof c.commands === 'object') {
    delete c.commands.ownerDisplay;
    if (Object.keys(c.commands).length === 0) delete c.commands;
  }
  // tools.web.search.provider 易与新版 schema 不兼容；宠物侧网页搜索可走上游能力，直接移除避免挡启动
  if (c.tools && typeof c.tools === 'object' && c.tools.web && typeof c.tools.web === 'object') {
    delete c.tools.web.search;
    if (Object.keys(c.tools.web).length === 0) delete c.tools.web;
    if (Object.keys(c.tools).length === 0) delete c.tools;
  }
  return c;
}

function readUserConfig() {
  const configPath = resolveUserConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch { return {}; }
}

function writeUserConfig(config) {
  const stateDir = resolveUserStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  backupCurrentUserConfig();
  const configPath = resolveUserConfigPath();
  const sanitized = sanitizeOpenclawConfig(config);
  fs.writeFileSync(configPath, JSON.stringify(sanitized, null, 2), 'utf-8');
}

/** 若仅存在 ~/.openclaw/openclaw.json，迁移到 ~/.qq-pet/openclaw.json（Gateway 子进程只用后者） */
function migrateLegacyOpenclawIfNeeded() {
  const target = resolveUserConfigPath();
  if (fs.existsSync(target)) return;
  const legacy = path.join(os.homedir(), '.openclaw', 'openclaw.json');
  if (!fs.existsSync(legacy)) return;
  try {
    const raw = fs.readFileSync(legacy, 'utf-8');
    const cfg = JSON.parse(raw);
    const clean = sanitizeOpenclawConfig(cfg);
    fs.mkdirSync(resolveUserStateDir(), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(clean, null, 2), 'utf-8');
    console.log('[backend] 已从 ~/.openclaw/openclaw.json 迁移到 ~/.qq-pet/openclaw.json（宠物专用配置）');
  } catch (e) {
    console.warn('[backend] 迁移 legacy openclaw 配置失败:', e.message);
  }
}

/** 启动前把磁盘上的 openclaw.json 净化并写回（若发生变化） */
function ensureConfigFileSanitizedOnDisk() {
  const configPath = resolveUserConfigPath();
  if (!fs.existsSync(configPath)) return;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return;
  }
  const next = sanitizeOpenclawConfig(cfg);
  if (JSON.stringify(next) !== JSON.stringify(cfg)) {
    writeUserConfig(next);
    console.log('[backend] 已自动修正 openclaw.json 中与当前 OpenClaw 不兼容的字段');
  }
}

function ensureConfigSanitizedAndMigrated() {
  migrateLegacyOpenclawIfNeeded();
  ensureConfigFileSanitizedOnDisk();
}

// ── 构建 Provider 配置对象（Custom 模式，OpenAI 兼容） ──

function buildProviderConfig(apiKey, modelID, baseURL, supportImage = true) {
  const input = supportImage ? ['text', 'image'] : ['text'];
  return {
    apiKey,
    baseUrl: baseURL,
    api: 'openai-completions',
    models: [{ id: modelID, name: modelID, input }],
  };
}

// ── 验证函数 ──

/**
 * 验证 Custom provider（OpenAI Completions 协议）
 * POST {baseURL}/chat/completions 发一条 "hi"
 */
function verifyCustom(apiKey, baseURL, modelID) {
  return new Promise((resolve, reject) => {
    if (!baseURL) return reject(new Error('需要接口地址'));
    if (!modelID) return reject(new Error('需要模型名称'));

    const base = baseURL.replace(/\/$/, '');
    const url = `${base}/chat/completions`;

    jsonRequest(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelID,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    }).then(resolve).catch(reject);
  });
}

// ── 保存 AI 配置到 openclaw.json ──

/**
 * 保存 AI Provider 配置
 * @param {string} apiKey
 * @param {string} baseURL
 * @param {string} modelID
 */
function saveProviderConfig(apiKey, baseURL, modelID) {
  const config = readUserConfig();

  // 初始化结构
  config.models ??= {};
  config.models.providers ??= {};
  config.agents ??= {};
  config.agents.defaults ??= {};
  config.agents.defaults.model ??= {};

  // 用 "custom" 作为 provider key
  const providerKey = 'custom';
  config.models.providers[providerKey] = buildProviderConfig(apiKey, modelID, baseURL);
  config.agents.defaults.model.primary = `${providerKey}/${modelID}`;

  writeUserConfig(config);
  return config;
}

/**
 * 读取当前 AI Provider 配置（给前端显示用）
 */
function getCurrentProviderConfig() {
  const config = readUserConfig();
  const primary = config?.agents?.defaults?.model?.primary || '';
  const [providerKey, ...modelParts] = primary.split('/');
  const modelID = modelParts.join('/');
  const provider = config?.models?.providers?.[providerKey];

  return {
    providerKey,
    modelID,
    baseURL: provider?.baseUrl || '',
    apiKey: provider?.apiKey || '',
    hasConfig: !!provider,
  };
}

// ── HTTP 请求工具 ──

function jsonRequest(url, opts) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);

    const req = mod.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: opts.method || 'GET',
        headers: opts.headers,
        timeout: 15000,
      },
      (res) => {
        let body = '';
        res.on('data', d => (body += d));
        res.on('end', () => {
          const code = res.statusCode ?? 0;
          if (code >= 200 && code < 300) {
            resolve();
          } else if (code === 401 || code === 403) {
            reject(new Error(`API Key 无效 (${code})`));
          } else {
            reject(new Error(`请求失败 (${code}): ${body.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', e => reject(new Error(`网络错误: ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

module.exports = {
  readUserConfig,
  writeUserConfig,
  sanitizeOpenclawConfig,
  ensureConfigSanitizedAndMigrated,
  buildProviderConfig,
  verifyCustom,
  saveProviderConfig,
  getCurrentProviderConfig,
  jsonRequest,
};
