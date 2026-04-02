/**
 * 内置 Gateway 依赖 resources/.../runtime/node（或 Windows 下 node.exe）。
 * 未纳入 Git 或首次克隆时，可从 CDN 拉取。
 *
 * 环境变量：
 *   PET_RUNTIME_NODE_URL — 完整下载地址（覆盖默认）
 * 默认：http://qqai.gtimg.com/qqpet/runtime/node
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const IS_WIN = process.platform === 'win32';
const RUNTIME_EXE = IS_WIN ? 'node.exe' : 'node';
/** 小于此字节视为不完整/占位，需重新下载 */
const MIN_NODE_BYTES = 35 * 1024 * 1024;

const DEFAULT_NODE_URL = 'http://qqai.gtimg.com/qqpet/runtime/node';

function defaultDownloadUrl() {
  const u = process.env.PET_RUNTIME_NODE_URL && String(process.env.PET_RUNTIME_NODE_URL).trim();
  return u || DEFAULT_NODE_URL;
}

function needsDownload(destPath) {
  try {
    const st = fs.statSync(destPath);
    return st.size < MIN_NODE_BYTES;
  } catch {
    return true;
  }
}

/**
 * @param {string} url
 * @param {string} destPath
 * @param {number} [redirectsLeft]
 */
function downloadFile(url, destPath, redirectsLeft = 10) {
  if (redirectsLeft <= 0) return Promise.reject(new Error('重定向次数过多'));

  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        headers: { 'User-Agent': 'qq-pet-runtime-node/1.0' },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).href;
          downloadFile(next, destPath, redirectsLeft - 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} ${url}`));
          return;
        }

        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        const tmp = `${destPath}.part`;
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('error', reject);
        out.on('finish', () => {
          out.close((err) => {
            if (err) return reject(err);
            try {
              fs.renameSync(tmp, destPath);
            } catch (e) {
              return reject(e);
            }
            if (!IS_WIN) {
              try {
                fs.chmodSync(destPath, 0o755);
              } catch {}
            }
            resolve();
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * @param {string} resourcesRoot - resolveResourcesPath() 返回值
 * @param {(msg: string) => void} [log]
 * @param {{ packaged?: boolean }} [opts] — packaged=true 时不下载（安装包内目录通常不可写）
 * @returns {Promise<{ skipped: boolean, dest: string }>}
 */
async function ensureRuntimeNodeDownloaded(resourcesRoot, log, opts) {
  const say = typeof log === 'function' ? log : () => {};
  if (opts && opts.packaged) {
    return { skipped: true, dest: '' };
  }
  if (!resourcesRoot || !fs.existsSync(resourcesRoot)) {
    return { skipped: true, dest: '' };
  }

  const dest = path.join(resourcesRoot, 'runtime', RUNTIME_EXE);
  if (!needsDownload(dest)) {
    return { skipped: true, dest };
  }

  const url = defaultDownloadUrl();
  say(`[runtime-node] 正在从 CDN 下载 ${RUNTIME_EXE}（约百 MB，请稍候）…`);
  say(`[runtime-node] URL: ${url}`);
  await downloadFile(url, dest);

  if (needsDownload(dest)) {
    throw new Error('下载后文件仍过小，可能 CDN 或 URL 异常');
  }
  say(`[runtime-node] 已就绪: ${dest}`);
  return { skipped: false, dest };
}

module.exports = {
  ensureRuntimeNodeDownloaded,
  defaultDownloadUrl,
  MIN_NODE_BYTES,
  RUNTIME_EXE,
};
