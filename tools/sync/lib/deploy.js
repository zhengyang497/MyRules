const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const drift = require('./drift');
const loadManifest = require('./load-manifest');
const ruleTargetsLib = require('./rule-targets');

function isRuleStateKey(key) {
  if (key.startsWith('script:') || key.startsWith('claude:') || key.startsWith('dsh:')) return false;
  return (
    key.startsWith('.cursor/rules/') ||
    key.startsWith('.claude/rules/') ||
    key.startsWith('.opencode/rules/') ||
    key.startsWith('.dsh/rules/') ||
    key.startsWith('~claude-user~/') ||
    key.startsWith('~opencode-user~/') ||
    key.startsWith('~dsh-user~/')
  );
}

function staleRuleCleanup(priorHashes, newHashes, projectRoot, claudeUserDir, opencodeUserDir, dshUserDir) {
  const removed = [];
  for (const key of Object.keys(priorHashes || {})) {
    if (!isRuleStateKey(key) || key in newHashes) continue;
    const filePath = key.startsWith('~claude-user~/')
      ? path.join(claudeUserDir, key.slice('~claude-user~/'.length))
      : key.startsWith('~opencode-user~/')
        ? path.join(opencodeUserDir, key.slice('~opencode-user~/'.length))
        : key.startsWith('~dsh-user~/')
          ? path.join(dshUserDir, key.slice('~dsh-user~/'.length))
          : path.join(projectRoot, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      removed.push(filePath);
    }
  }
  return removed;
}

function deployRules(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const force = opts.force || false;
  const priorHashes = opts.priorHashes || {};
  const claudeUserDir = opts.claudeUserDir || paths.getClaudeUserRulesDir();
  const opencodeUserDir = opts.opencodeUserDir || paths.getOpencodeUserRulesDir();
  const dshUserDir = opts.dshUserDir || paths.getDshUserRulesDir();
  const cursorDir = paths.getCursorRulesDir(projectRoot);
  const claudeProjDir = paths.getClaudeProjectRulesDir(projectRoot);
  const opencodeProjDir = paths.getOpencodeProjectRulesDir(projectRoot);
  const dshProjDir = paths.getDshProjectRulesDir(projectRoot);

  fs.mkdirSync(cursorDir, { recursive: true });
  fs.mkdirSync(claudeProjDir, { recursive: true });
  fs.mkdirSync(claudeUserDir, { recursive: true });
  fs.mkdirSync(opencodeProjDir, { recursive: true });
  fs.mkdirSync(opencodeUserDir, { recursive: true });
  fs.mkdirSync(dshProjDir, { recursive: true });
  fs.mkdirSync(dshUserDir, { recursive: true });

  const tracker = drift.createTracker({ force, priorHashes });

  for (const t of ruleTargetsLib.ruleTargets(cacheDir, projectRoot, {
    manifest,
    claudeUserDir,
    opencodeUserDir,
    dshUserDir,
  })) {
    tracker.writeTracked(t.abs, ruleTargetsLib.emittedRuleContent(t, fs.readFileSync(t.sourceAbs, 'utf8')), t.stateKey);
  }

  const staleRemoved = staleRuleCleanup(priorHashes, tracker.hashes, projectRoot, claudeUserDir, opencodeUserDir, dshUserDir);

  // captureBaselines：粘性捕获基线（只含本轮真正写盘的目标，drift 拒写的目标不在此）
  return { hashes: tracker.hashes, drifted: tracker.drifted, staleRemoved, captureBaselines: tracker.captureBaselines };
}

module.exports = { deployRules, staleRuleCleanup, isRuleStateKey };
