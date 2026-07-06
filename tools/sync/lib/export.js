const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const transform = require('./transform');
const loadManifest = require('./load-manifest');

function diffFile(deployedFile, sourceFile, report) {
  if (!fs.existsSync(deployedFile)) return;
  let body = fs.readFileSync(deployedFile, 'utf8');
  if (deployedFile.endsWith('.mdc')) body = transform.stripCursorFrontmatter(body);

  if (!fs.existsSync(sourceFile)) {
    report.sourceMissing.push({ deployedFile, sourceFile, body });
    return;
  }
  const sourceBody = transform.stripRuleFrontmatter(fs.readFileSync(sourceFile, 'utf8'));
  if (body.trim() !== sourceBody.trim()) {
    report.toUpdate.push({ deployedFile, sourceFile, body });
  }
}

function exportProject(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const prefix = manifest.managedPrefix;
  const userPrefix = `${prefix}user-`;
  const report = { toUpdate: [], sourceMissing: [] };
  const {
    cursorDir = paths.getCursorRulesDir(projectRoot),
    claudeProjDir = paths.getClaudeProjectRulesDir(projectRoot),
    claudeUserDir = paths.getClaudeUserRulesDir(),
  } = opts;

  const scans = [
    { dir: cursorDir, ext: manifest.cursor.extension },
    { dir: claudeProjDir, ext: manifest.claude.extension },
    { dir: claudeUserDir, ext: manifest.claude.extension },
  ];

  for (const { dir, ext } of scans) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith(prefix) || !f.endsWith(ext)) continue;
      const deployedFile = path.join(dir, f);
      const isUser = f.startsWith(userPrefix);
      const withoutExt = path.basename(f, ext);
      const topic = isUser ? withoutExt.slice(userPrefix.length) : withoutExt.slice(prefix.length);
      const category = isUser ? 'user' : 'project';
      const sourceFile = path.join(cacheDir, 'rules', category, `${topic}.md`);
      diffFile(deployedFile, sourceFile, report);
    }
  }

  return report;
}

module.exports = { exportProject };
