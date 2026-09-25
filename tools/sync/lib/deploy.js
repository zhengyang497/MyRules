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
  const prefix = manifest.managedPrefix;
  const userPrefix = `${prefix}user-`;
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

  for (const category of ['user', 'project']) {
    const srcDir = path.join(cacheDir, 'rules', category);
    for (const f of listMdFiles(srcDir)) {
      const topic = path.basename(f, '.md');
      const raw = fs.readFileSync(path.join(srcDir, f), 'utf8');
      const parsed = transform.parseRuleFrontmatter(raw);
      if (parsed.runtimes !== null) continue;
      const body = parsed.body;

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

        const opencodeName = `${userPrefix}${topic}.md`;
        const opencodeTarget = path.join(opencodeUserDir, opencodeName);
        const opencodeStateKey = `~opencode-user~/${opencodeName}`;
        tracker.writeTracked(opencodeTarget, transform.transformForOpencode(body), opencodeStateKey);

        // Also deploy user rules to project .opencode/rules/ so the project-level
        // instructions glob (e.g. ".opencode/rules/myrules-*.md") picks them up.
        // The global opencode.json instructions are overridden by project config.
        const opencodeProjName = `${userPrefix}${topic}.md`;
        const opencodeProjTarget = path.join(opencodeProjDir, opencodeProjName);
        const opencodeProjStateKey = path.posix.join('.opencode/rules', opencodeProjName);
        tracker.writeTracked(opencodeProjTarget, transform.transformForOpencode(body), opencodeProjStateKey);

        // dsh 用户规则只进用户目录（~/.dsh/AGENTS.md 管理块常驻，无需复制进项目）
        const dshName = `${userPrefix}${topic}.md`;
        const dshTarget = path.join(dshUserDir, dshName);
        const dshStateKey = `~dsh-user~/${dshName}`;
        tracker.writeTracked(dshTarget, transform.transformForDsh(body), dshStateKey);
      } else {
        const claudeName = `${prefix}${topic}.md`;
        const claudeTarget = path.join(claudeProjDir, claudeName);
        const claudeStateKey = path.posix.join('.claude/rules', claudeName);
        tracker.writeTracked(claudeTarget, transform.transformForClaude(body), claudeStateKey);

        const opencodeName = `${prefix}${topic}.md`;
        const opencodeTarget = path.join(opencodeProjDir, opencodeName);
        const opencodeStateKey = path.posix.join('.opencode/rules', opencodeName);
        tracker.writeTracked(opencodeTarget, transform.transformForOpencode(body), opencodeStateKey);

        const dshName = `${prefix}${topic}.md`;
        const dshTarget = path.join(dshProjDir, dshName);
        const dshStateKey = path.posix.join('.dsh/rules', dshName);
        tracker.writeTracked(dshTarget, transform.transformForDsh(body), dshStateKey);
      }
    }
  }

  const staleRemoved = staleRuleCleanup(priorHashes, tracker.hashes, projectRoot, claudeUserDir, opencodeUserDir, dshUserDir);

  return { hashes: tracker.hashes, drifted: tracker.drifted, staleRemoved };
}

module.exports = { deployRules, staleRuleCleanup, isRuleStateKey };
