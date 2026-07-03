// tools/sync/lib/hooks-deploy.js
const fs = require('node:fs');
const path = require('node:path');
const hooksLib = require('./hooks');
const drift = require('./drift');
const transform = require('./transform');
const fsutil = require('./fsutil');
const paths = require('./paths');
const loadManifest = require('./load-manifest');

function mergeHooksJson(existing, previousCommandsByEvent, currentHooks) {
  const doc = existing && typeof existing === 'object' ? { ...existing } : {};
  if (typeof doc.version !== 'number') doc.version = 1;
  const hooksObj = { ...(doc.hooks || {}) };
  const priorByEvent = previousCommandsByEvent || {};

  const touchedEvents = new Set([...Object.keys(priorByEvent), ...currentHooks.map((h) => h.event)]);

  for (const event of touchedEvents) {
    const existingArray = Array.isArray(hooksObj[event]) ? hooksObj[event] : [];
    const hasRecordForEvent = Object.prototype.hasOwnProperty.call(priorByEvent, event);
    const previousCommands = new Set(priorByEvent[event] || []);

    const kept = existingArray.filter((entry) => {
      if (!hasRecordForEvent) {
        return !(typeof entry.command === 'string' && entry.command.includes('myrules-'));
      }
      return !previousCommands.has(entry.command);
    });

    const additions = currentHooks
      .filter((h) => h.event === event)
      .map((h) => {
        const entry = { command: h.command };
        if (h.matcher !== undefined) entry.matcher = h.matcher;
        if (h.timeout !== undefined) entry.timeout = h.timeout;
        if (h.failClosed !== undefined) entry.failClosed = h.failClosed;
        return entry;
      });

    const merged = kept.concat(additions);
    if (merged.length) hooksObj[event] = merged;
    else delete hooksObj[event];
  }

  doc.hooks = hooksObj;
  return doc;
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${file} as JSON: ${err.message}`);
  }
}

function deployHooks({ sourceDir, scriptsDir, configFile, commandDirPosix, claudeDir, hookInfix, force, priorState }) {
  const sources = hooksLib.loadHookSources(sourceDir);
  const previousNames = Object.keys(priorState.deployedHooks || {});

  if (sources.length === 0 && previousNames.length === 0) {
    return { deployedHooks: {}, deployedHashes: {}, drifted: [], stale: [] };
  }

  fsutil.ensureDir(scriptsDir);
  fsutil.ensureDir(claudeDir);

  const currentHooks = sources.map((s) => ({
    name: s.name,
    event: s.meta.event,
    matcher: s.meta.matcher,
    timeout: s.meta.timeout,
    failClosed: s.meta.failClosed,
    command: `node ${commandDirPosix}/myrules-${s.name}.js`,
  }));

  const currentNames = new Set(sources.map((s) => s.name));
  const staleNames = previousNames.filter((n) => !currentNames.has(n));

  const tracker = drift.createTracker({ force, priorHashes: priorState.deployedHashes || {} });

  for (const s of sources) {
    const scriptTarget = path.join(scriptsDir, `myrules-${s.name}.js`);
    tracker.writeTracked(scriptTarget, fs.readFileSync(s.file, 'utf8'), `script:${s.name}`);

    const claudeTarget = path.join(claudeDir, `myrules-${hookInfix}${s.name}.md`);
    tracker.writeTracked(claudeTarget, transform.transformHookForClaude(s.meta, s.name), `claude:${s.name}`);
  }

  for (const staleName of staleNames) {
    const scriptTarget = path.join(scriptsDir, `myrules-${staleName}.js`);
    const claudeTarget = path.join(claudeDir, `myrules-${hookInfix}${staleName}.md`);
    if (fs.existsSync(scriptTarget)) fs.unlinkSync(scriptTarget);
    if (fs.existsSync(claudeTarget)) fs.unlinkSync(claudeTarget);
  }

  const previousCommandsByEvent = {};
  for (const info of Object.values(priorState.deployedHooks || {})) {
    previousCommandsByEvent[info.event] = previousCommandsByEvent[info.event] || [];
    previousCommandsByEvent[info.event].push(info.command);
  }

  const configFileExisted = fs.existsSync(configFile);
  const existingConfig = readJsonIfExists(configFile);
  const nextConfig = mergeHooksJson(existingConfig, previousCommandsByEvent, currentHooks);
  if (configFileExisted || Object.keys(nextConfig.hooks).length > 0) {
    fs.writeFileSync(configFile, JSON.stringify(nextConfig, null, 2) + '\n');
  }

  const deployedHooks = {};
  for (const h of currentHooks) {
    deployedHooks[h.name] = { event: h.event, command: h.command };
  }

  return { deployedHooks, deployedHashes: tracker.hashes, drifted: tracker.drifted, stale: staleNames };
}

function deployProjectHooks(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  return deployHooks({
    sourceDir: path.join(cacheDir, 'hooks', 'project'),
    scriptsDir: opts.scriptsDir || paths.getCursorProjectHooksDir(projectRoot),
    configFile: opts.configFile || paths.getCursorProjectHooksConfig(projectRoot),
    commandDirPosix: '.cursor/hooks',
    claudeDir: opts.claudeDir || paths.getClaudeProjectRulesDir(projectRoot),
    hookInfix: manifest.claude.hookInfix,
    force: opts.force || false,
    priorState: opts.priorState || {},
  });
}

function deployUserHooks(cacheDir, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const homeDir = opts.homeDir || require('node:os').homedir();
  return deployHooks({
    sourceDir: path.join(cacheDir, 'hooks', 'user'),
    scriptsDir: opts.scriptsDir || paths.getCursorUserHooksDir(homeDir),
    configFile: opts.configFile || paths.getCursorUserHooksConfig(homeDir),
    commandDirPosix: 'hooks',
    claudeDir: opts.claudeDir || paths.getClaudeUserRulesDir(homeDir),
    hookInfix: manifest.claude.hookInfix,
    force: opts.force || false,
    priorState: opts.priorState || {},
  });
}

module.exports = { mergeHooksJson, deployHooks, deployProjectHooks, deployUserHooks };
