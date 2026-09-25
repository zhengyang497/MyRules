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
    opencodeUserDir = paths.getOpencodeUserRulesDir(),
    dshUserDir = paths.getDshUserRulesDir(),
  } = opts;
  const opencodeProjDir = paths.getOpencodeProjectRulesDir(projectRoot);
  const dshProjDir = paths.getDshProjectRulesDir(projectRoot);

  const scans = [
    { dir: cursorDir, ext: manifest.cursor.extension },
    { dir: claudeProjDir, ext: manifest.claude.extension },
    { dir: claudeUserDir, ext: manifest.claude.extension },
    { dir: opencodeProjDir, ext: manifest.opencode.extension },
    { dir: opencodeUserDir, ext: manifest.opencode.extension },
    { dir: dshProjDir, ext: (manifest.dsh && manifest.dsh.extension) || '.md' },
    { dir: dshUserDir, ext: (manifest.dsh && manifest.dsh.extension) || '.md' },
  ];

  for (const { dir, ext } of scans) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith(prefix) || !f.endsWith(ext)) continue;
      // method 短规则与 hook 散文不是 rules/<category>/ 的产物：
      // 它们由 method/hooks 渠道部署，没有对应主题源文件，不参与反查
      if (f.startsWith(`${prefix}method-`) || f.startsWith(`${prefix}${manifest.claude.hookInfix || 'hook-'}`)) continue;
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
