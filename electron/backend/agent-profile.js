'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function stripQuotes(v) {
  const s = String(v || '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('\'') && s.endsWith('\''))) {
    return s.slice(1, -1);
  }
  return s;
}

function normalizeUserPath(p) {
  if (!p) return '';
  return String(p).replace(/^~(?=\/|$)/, os.homedir());
}

function parseAgentsYml(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  let inAgents = false;
  let currentAgent = '';
  const parsed = {};

  for (const line of lines) {
    const noComment = line.replace(/\s+#.*$/, '');
    if (!noComment.trim()) continue;

    if (!inAgents) {
      if (/^\s*agents\s*:\s*$/.test(noComment)) inAgents = true;
      continue;
    }

    const agentMatch = noComment.match(/^\s{2}([A-Za-z0-9._-]+)\s*:\s*$/);
    if (agentMatch) {
      currentAgent = agentMatch[1];
      if (!parsed[currentAgent]) parsed[currentAgent] = {};
      continue;
    }

    if (!currentAgent) continue;
    const keyVal = noComment.match(/^\s{4}([A-Za-z0-9._-]+)\s*:\s*(.+)\s*$/);
    if (!keyVal) continue;

    const key = keyVal[1];
    const value = stripQuotes(keyVal[2]);
    if (key === 'workspace' || key === 'soul' || key === 'identity') {
      parsed[currentAgent][key] = value;
    }
  }

  return parsed;
}

function resolveFromAgentsFile(agentsFilePath, preferredAgent = 'qq-pet') {
  try {
    if (!fs.existsSync(agentsFilePath)) return null;
    const raw = fs.readFileSync(agentsFilePath, 'utf-8');
    const parsed = parseAgentsYml(raw);
    const entry = parsed[preferredAgent] || parsed[Object.keys(parsed)[0]];
    if (!entry) return null;

    const baseDir = path.dirname(agentsFilePath);
    const workspace = normalizeUserPath(entry.workspace) || baseDir;
    const soul = normalizeUserPath(entry.soul || './SOUL.md');
    const identity = normalizeUserPath(entry.identity || './IDENTITY.md');

    const soulPath = path.isAbsolute(soul) ? soul : path.resolve(baseDir, soul);
    const identityPath = path.isAbsolute(identity) ? identity : path.resolve(baseDir, identity);
    const agentDir = workspace || baseDir;

    return {
      source: `AGENTS.yml:${agentsFilePath}`,
      agentKey: preferredAgent,
      agentDir,
      soulPath,
      identityPath,
      agentsFilePath,
      hasSoul: fs.existsSync(soulPath),
      hasIdentity: fs.existsSync(identityPath),
    };
  } catch (err) {
    return {
      source: `AGENTS.yml:${agentsFilePath}`,
      error: err.message,
    };
  }
}

function resolveRuntimeAgentProfile() {
  const home = os.homedir();

  const candidates = [
    path.join(home, '.openclaw', 'agents', 'qq-pet', 'AGENTS.yml'),
    path.join(home, '.qqclaw', 'agents', 'qq-pet', 'AGENTS.yml'),
    path.join(home, '.qq-pet', 'workspace', 'AGENTS.yml'),
  ];

  for (const p of candidates) {
    const resolved = resolveFromAgentsFile(p, 'qq-pet');
    if (resolved && !resolved.error) return resolved;
  }

  // 回退：直接按目录约定读取 SOUL/IDENTITY
  const fallbackDirCandidates = [
    path.join(home, '.openclaw', 'agents', 'qq-pet'),
    path.join(home, '.qqclaw', 'agents', 'qq-pet'),
    path.join(home, '.qq-pet', 'workspace'),
  ];

  for (const dir of fallbackDirCandidates) {
    const soulPath = path.join(dir, 'SOUL.md');
    if (fs.existsSync(soulPath)) {
      return {
        source: `fallback:${dir}`,
        agentKey: 'qq-pet',
        agentDir: dir,
        soulPath,
        identityPath: path.join(dir, 'IDENTITY.md'),
        agentsFilePath: '',
        hasSoul: true,
        hasIdentity: fs.existsSync(path.join(dir, 'IDENTITY.md')),
      };
    }
  }

  // 最终兜底
  const defaultDir = path.join(home, '.qq-pet', 'workspace');
  return {
    source: 'default:~/.qq-pet/workspace',
    agentKey: 'qq-pet',
    agentDir: defaultDir,
    soulPath: path.join(defaultDir, 'SOUL.md'),
    identityPath: path.join(defaultDir, 'IDENTITY.md'),
    agentsFilePath: '',
    hasSoul: fs.existsSync(path.join(defaultDir, 'SOUL.md')),
    hasIdentity: fs.existsSync(path.join(defaultDir, 'IDENTITY.md')),
  };
}

module.exports = {
  resolveRuntimeAgentProfile,
};

