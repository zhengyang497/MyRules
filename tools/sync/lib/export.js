const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const transform = require('./transform');

function diffFile(deployedFile, sourceFile, report) {
  if (!fs.existsSync(deployedFile)) return;
  let body = fs.readFileSync(deployedFile, 'utf8');
  if (deployedFile.endsWith('.mdc')) body = transform.stripCursorFrontmatter(body);

  if (!fs.existsSync(sourceFile)) {
    report.sourceMissing.push({ deployedFile, sourceFile, body });
    return;
  }
  const sourceBody = fs.readFileSync(sourceFile, 'utf8');
  if (body.trim() !== sourceBody.trim()) {
    report.toUpdate.push({ deployedFile, sourceFile, body });
  }
}

function exportProject(cacheDir, projectRoot, opts = {}) {
  const report = { toUpdate: [], sourceMissing: [] };
  const {
    cursorDir = paths.getCursorRulesDir(projectRoot),
    claudeProjDir = paths.getClaudeProjectRulesDir(projectRoot),
    claudeUserDir = paths.getClaudeUserRulesDir(),
  } = opts;

  const scans = [
    { dir: cursorDir, ext: '.mdc' },
    { dir: claudeProjDir, ext: '.md' },
    { dir: claudeUserDir, ext: '.md' },
  ];

  for (const { dir, ext } of scans) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith('myrules-') || !f.endsWith(ext)) continue;
      const deployedFile = path.join(dir, f);
      const isUser = f.startsWith('myrules-user-');
      const withoutExt = path.basename(f, ext);
      const topic = isUser ? withoutExt.replace(/^myrules-user-/, '') : withoutExt.replace(/^myrules-/, '');
      const category = isUser ? 'user' : 'project';
      const sourceFile = path.join(cacheDir, 'rules', category, `${topic}.md`);
      diffFile(deployedFile, sourceFile, report);
    }
  }

  return report;
}

module.exports = { exportProject };
