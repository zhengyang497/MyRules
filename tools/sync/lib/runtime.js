const fs = require('node:fs');
const path = require('node:path');

const RUNTIME_FILE = '.myrules-runtime.json';
const VALID_RUNTIMES = new Set(['agent', 'project']);
const LEGACY_METHOD = path.join('docs', '方法', '项目工作法.md');

const MISSING_RUNTIME_MESSAGE =
  'No MyRules runtime marker (.myrules-runtime.json). Arrange the repo first: ' +
  '「布置普通仓库」(--runtime agent) or 「布置 Project 仓库」(--runtime project). Do not guess.';

function readRuntimeJson(projectRoot) {
  const file = path.join(projectRoot, RUNTIME_FILE);
  if (!fs.existsSync(file)) return null;
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid ${RUNTIME_FILE}: ${err.message}`);
  }
  if (!VALID_RUNTIMES.has(json.runtime)) {
    throw new Error(`Invalid runtime in ${RUNTIME_FILE}: ${json.runtime}`);
  }
  return json;
}

function readRuntimeFile(projectRoot) {
  const json = readRuntimeJson(projectRoot);
  return json ? json.runtime : null;
}

function hasInstanceLanding(projectRoot) {
  const json = readRuntimeJson(projectRoot);
  return Boolean(json && json.instanceLanding === true);
}

function writeRuntimeFile(projectRoot, runtime) {
  if (!VALID_RUNTIMES.has(runtime)) {
    throw new Error(`Invalid runtime: ${runtime}`);
  }
  const file = path.join(projectRoot, RUNTIME_FILE);
  let existing = {};
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      existing = {};
    }
  }
  const next = { ...existing, runtime };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
}

function hasLegacyUnprefixedMethod(projectRoot) {
  return fs.existsSync(path.join(projectRoot, LEGACY_METHOD));
}

function resolveRuntime(projectRoot, { registryRuntime } = {}) {
  const fromFile = readRuntimeFile(projectRoot);
  if (fromFile) {
    return { runtime: fromFile, source: 'file', wrote: false };
  }

  if (VALID_RUNTIMES.has(registryRuntime)) {
    writeRuntimeFile(projectRoot, registryRuntime);
    return { runtime: registryRuntime, source: 'registry', wrote: true };
  }

  if (hasLegacyUnprefixedMethod(projectRoot)) {
    writeRuntimeFile(projectRoot, 'agent');
    return { runtime: 'agent', source: 'legacy', wrote: true };
  }

  const err = new Error(MISSING_RUNTIME_MESSAGE);
  err.code = 'MISSING_RUNTIME';
  throw err;
}

function rolesForRuntime(manifest, runtime) {
  const roles = (manifest.agents && manifest.agents.roles) || {};
  const byRuntime = (manifest.agents && manifest.agents.byRuntime) || {};
  const ids = byRuntime[runtime];
  if (Array.isArray(ids) && ids.length) {
    const out = {};
    for (const id of ids) {
      if (roles[id]) out[id] = roles[id];
    }
    return out;
  }
  return roles;
}

module.exports = {
  RUNTIME_FILE,
  VALID_RUNTIMES,
  MISSING_RUNTIME_MESSAGE,
  readRuntimeJson,
  readRuntimeFile,
  hasInstanceLanding,
  writeRuntimeFile,
  hasLegacyUnprefixedMethod,
  resolveRuntime,
  rolesForRuntime,
};
