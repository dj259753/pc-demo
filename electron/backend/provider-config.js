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
const { resolveUserConfigPath, resolveUserStateDir } = require('./constants');
const { backupCurrentUserConfig } = require('./config-backup');

// ── 用户配置读写 ──

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
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
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
  buildProviderConfig,
  verifyCustom,
  saveProviderConfig,
  getCurrentProviderConfig,
  jsonRequest,
};
