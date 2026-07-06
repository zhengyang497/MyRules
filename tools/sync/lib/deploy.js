const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const transform = require('./transform');
const drift = require('./drift');
const loadManifest = require('./load-manifest');

function listMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
}

function isRuleStateKey(key) {
  if (key.startsWith('script:') || key.startsWith('claude:')) return false;
  return (
    key.startsWith('.cursor/rules/') ||
    key.startsWith('.claude/rules/') ||
    key.startsWith('~claude-user~/')
  );
}

function staleRuleCleanup(priorHashes, newHashes, projectRoot, claudeUserDir) {
  const removed = [];
  for (const key of Object.keys(priorHashes || {})) {
    if (!isRuleStateKey(key) || key in newHashes) continue;
    const filePath = key.startsWith('~claude-user~/')
      ? path.join(claudeUserDir, key.slice('~claude-user~/'.length))
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
  const prefix = manifest.managedPrefix;
  const userPrefix = `${prefix}user-`;
  const force = opts.force || false;
  const priorHashes = opts.priorHashes || {};
  const claudeUserDir = opts.claudeUserDir || paths.getClaudeUserRulesDir();
  const cursorDir = paths.getCursorRulesDir(projectRoot);
  const claudeProjDir = paths.getClaudeProjectRulesDir(projectRoot);

  fs.mkdirSync(cursorDir, { recursive: true });
  fs.mkdirSync(claudeProjDir, { recursive: true });
  fs.mkdirSync(claudeUserDir, { recursive: true });

  const tracker = drift.createTracker({ force, priorHashes });

  for (const category of ['user', 'project']) {
    const srcDir = path.join(cacheDir, 'rules', category);
    for (const f of listMdFiles(srcDir)) {
      const topic = path.basename(f, '.md');
      const raw = fs.readFileSync(path.join(srcDir, f), 'utf8');
      const body = transform.stripRuleFrontmatter(raw);

      const cursorName = category === 'user' ? `${userPrefix}${topic}.mdc` : `${prefix}${topic}.mdc`;
      const cursorTarget = path.join(cursorDir, cursorName);
      const cursorStateKey = path.posix.join('.cursor/rules', cursorName);
      tracker.writeTracked(
        cursorTarget,
        transform.transformForCursor(body, topic),
        cursorStateKey
      );

      if (category === 'user') {
        const claudeName = `${userPrefix}${topic}.md`;
        const claudeTarget = path.join(claudeUserDir, claudeName);
        const claudeStateKey = `~claude-user~/${claudeName}`;
        tracker.writeTracked(claudeTarget, transform.transformForClaude(body), claudeStateKey);
      } else {
        const claudeName = `${prefix}${topic}.md`;
        const claudeTarget = path.join(claudeProjDir, claudeName);
        const claudeStateKey = path.posix.join('.claude/rules', claudeName);
        tracker.writeTracked(claudeTarget, transform.transformForClaude(body), claudeStateKey);
      }
    }
  }

  const staleRemoved = staleRuleCleanup(priorHashes, tracker.hashes, projectRoot, claudeUserDir);

  return { hashes: tracker.hashes, drifted: tracker.drifted, staleRemoved };
}

module.exports = { deployRules, staleRuleCleanup, isRuleStateKey };
