const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const fsutil = require('./fsutil');
const transform = require('./transform');
const loadManifest = require('./load-manifest');
const drift = require('./drift');

function listTopics(dir) {
  return fsutil.listFilesWithExt(dir, '.md').map((file) => ({
    file,
    topic: path.basename(file, '.md'),
  }));
}

function deployRules(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const prefix = manifest.managedPrefix;
  const cursorExt = manifest.cursor.extension;
  const claudeExt = manifest.claude.extension;

  const {
    force = false,
    priorHashes = {},
    cursorDir = paths.getCursorRulesDir(projectRoot),
    claudeProjDir = paths.getClaudeProjectRulesDir(projectRoot),
    claudeUserDir = paths.getClaudeUserRulesDir(),
  } = opts;
  fsutil.ensureDir(cursorDir);
  fsutil.ensureDir(claudeProjDir);
  fsutil.ensureDir(claudeUserDir);

  const tracker = drift.createTracker({ force, priorHashes });

  for (const { file, topic } of listTopics(path.join(cacheDir, 'rules', 'user'))) {
    const body = fs.readFileSync(file, 'utf8');
    const cursorTarget = path.join(cursorDir, `${prefix}user-${topic}${cursorExt}`);
    const claudeTarget = path.join(claudeUserDir, `${prefix}user-${topic}${claudeExt}`);
    tracker.writeTracked(cursorTarget, transform.transformForCursor(body, topic), path.relative(projectRoot, cursorTarget));
    tracker.writeTracked(claudeTarget, transform.transformForClaude(body), `~claude-user~/${prefix}user-${topic}${claudeExt}`);
  }

  for (const { file, topic } of listTopics(path.join(cacheDir, 'rules', 'project'))) {
    const body = fs.readFileSync(file, 'utf8');
    const cursorTarget = path.join(cursorDir, `${prefix}${topic}${cursorExt}`);
    const claudeTarget = path.join(claudeProjDir, `${prefix}${topic}${claudeExt}`);
    tracker.writeTracked(cursorTarget, transform.transformForCursor(body, topic), path.relative(projectRoot, cursorTarget));
    tracker.writeTracked(claudeTarget, transform.transformForClaude(body), path.relative(projectRoot, claudeTarget));
  }

  return { written: tracker.written, drifted: tracker.drifted, hashes: tracker.hashes };
}

module.exports = { deployRules };
