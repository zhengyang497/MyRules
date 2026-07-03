const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const fsutil = require('./fsutil');
const transform = require('./transform');
const loadManifest = require('./load-manifest');

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

  const nextHashes = {};
  const drifted = [];
  const written = [];

  function writeTracked(targetFile, content, stateKey) {
    if (!force && fs.existsSync(targetFile)) {
      const currentHash = fsutil.hashContent(fs.readFileSync(targetFile, 'utf8'));
      const expectedHash = priorHashes[stateKey];
      if (expectedHash && currentHash !== expectedHash) {
        drifted.push(targetFile);
        nextHashes[stateKey] = currentHash;
        return;
      }
    }
    fs.writeFileSync(targetFile, content);
    nextHashes[stateKey] = fsutil.hashContent(content);
    written.push(targetFile);
  }

  for (const { file, topic } of listTopics(path.join(cacheDir, 'rules', 'user'))) {
    const body = fs.readFileSync(file, 'utf8');
    const cursorTarget = path.join(cursorDir, `${prefix}user-${topic}${cursorExt}`);
    const claudeTarget = path.join(claudeUserDir, `${prefix}user-${topic}${claudeExt}`);
    writeTracked(cursorTarget, transform.transformForCursor(body, topic), path.relative(projectRoot, cursorTarget));
    writeTracked(claudeTarget, transform.transformForClaude(body), `~claude-user~/${prefix}user-${topic}${claudeExt}`);
  }

  for (const { file, topic } of listTopics(path.join(cacheDir, 'rules', 'project'))) {
    const body = fs.readFileSync(file, 'utf8');
    const cursorTarget = path.join(cursorDir, `${prefix}${topic}${cursorExt}`);
    const claudeTarget = path.join(claudeProjDir, `${prefix}${topic}${claudeExt}`);
    writeTracked(cursorTarget, transform.transformForCursor(body, topic), path.relative(projectRoot, cursorTarget));
    writeTracked(claudeTarget, transform.transformForClaude(body), path.relative(projectRoot, claudeTarget));
  }

  return { written, drifted, hashes: nextHashes };
}

module.exports = { deployRules };
