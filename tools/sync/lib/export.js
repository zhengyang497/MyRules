const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const transform = require('./transform');
const loadManifest = require('./load-manifest');
const runtime = require('./runtime');
const reverseMap = require('./reverse-map');

// skillPack 部署的三个平台目录（相对项目根）
const SKILL_PLATFORMS = ['.cursor', '.claude', '.dsh'];

function posix(p) {
  return String(p).replace(/\\/g, '/');
}

function walkFiles(root) {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) out.push(abs);
    }
  };
  walk(root);
  return out;
}

/**
 * sync 告警分流用：这个被手改的文件有没有反向通道。
 * - 'skill' → `export --apply` 可直接写回缓存源
 * - 'rule'  → `export` 会列出差异（源带 frontmatter，人工回填）
 * - null    → 没有反查通道（hooks、method 短规则、脚本、agent 角色文件等），
 *   只能改 ~/.myrules 源后 push，或 --force 接受缓存版
 */
function reverseKind(absPath) {
  const p = posix(absPath);
  if (/\/\.(?:cursor|claude|dsh)\/skills\//.test(p)) return 'skill';
  if (/\/rules\//.test(p)) {
    const base = p.slice(p.lastIndexOf('/') + 1);
    if (/^myrules-(?!method-|hook-).+\.mdc?$/.test(base)) return 'rule';
  }
  return null;
}

function diffFile(deployedFile, sourceFile, report) {
  if (!fs.existsSync(deployedFile)) return;
  let body = fs.readFileSync(deployedFile, 'utf8');
  if (deployedFile.endsWith('.mdc')) body = transform.stripCursorFrontmatter(body);

  if (!fs.existsSync(sourceFile)) {
    report.sourceMissing.push({ deployedFile, sourceFile, body, kind: 'rule' });
    return;
  }
  const sourceBody = transform.stripRuleFrontmatter(fs.readFileSync(sourceFile, 'utf8'));
  if (body.trim() !== sourceBody.trim()) {
    report.toUpdate.push({ deployedFile, sourceFile, body, kind: 'rule' });
  }
}

// 技能文件逐字对比：不剥任何 frontmatter —— SKILL.md 的 YAML 头、
// 模板文件的任何字节都是源的一部分，反向写回时原样保留。
function diffSkillFile(deployedFile, sourceFile, report) {
  const body = fs.readFileSync(deployedFile, 'utf8');
  if (!fs.existsSync(sourceFile)) {
    report.sourceMissing.push({ deployedFile, sourceFile, body, kind: 'skill' });
    return;
  }
  const sourceBody = fs.readFileSync(sourceFile, 'utf8');
  if (body.trim() !== sourceBody.trim()) {
    report.toUpdate.push({ deployedFile, sourceFile, body, kind: 'skill' });
  }
}

function diffSkills(cacheDir, projectRoot, manifest, report) {
  const cacheSkillsDir = path.join(cacheDir, 'method', 'skills');
  if (!fs.existsSync(cacheSkillsDir)) return;
  const known = new Set(fs.readdirSync(cacheSkillsDir));

  // instanceLanding 下 preserve 的技能归实例所有（sync 从不写入），同样不反查进缓存
  const excluded = new Set();
  if (runtime.hasInstanceLanding(projectRoot)) {
    for (const entry of (manifest.method && manifest.method.files) || []) {
      if (entry.instanceOwned !== 'preserve') continue;
      const name = reverseMap.skillNameOfTarget(entry.destDir || entry.dest || '');
      if (name) excluded.add(name);
    }
  }

  for (const platform of SKILL_PLATFORMS) {
    const skillsRoot = path.join(projectRoot, platform, 'skills');
    if (!fs.existsSync(skillsRoot)) continue;
    for (const name of fs.readdirSync(skillsRoot)) {
      // 缓存 method/skills/ 里没有同名技能 → 项目自己的技能，不是托管产物，跳过
      if (!known.has(name) || excluded.has(name)) continue;
      const dir = path.join(skillsRoot, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const abs of walkFiles(dir)) {
        const destRel = posix(path.relative(projectRoot, abs));
        const sourceRel = reverseMap.skillSourceFor(destRel, manifest);
        if (!sourceRel) continue;
        diffSkillFile(abs, path.join(cacheDir, sourceRel), report);
      }
    }
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

  // method 技能包：.{cursor,claude,dsh}/skills/<name>/ ↔ 缓存 method/skills/<name>/
  diffSkills(cacheDir, projectRoot, manifest, report);

  return report;
}

/**
 * `--apply`：把报告中的 skill 差异写回缓存源（method/skills/…、method/core/templates/…）。
 * 只写缓存，不碰项目文件；规则保持报告模式 —— 规则源带 agents/runtimes frontmatter，
 * 回填需保留语义，由人（或模型）照报告手工完成。
 */
function applyReport(report) {
  const applied = [];
  for (const entry of [...report.toUpdate, ...report.sourceMissing]) {
    if (entry.kind !== 'skill') continue;
    fs.mkdirSync(path.dirname(entry.sourceFile), { recursive: true });
    fs.writeFileSync(entry.sourceFile, entry.body);
    applied.push(entry.sourceFile);
  }
  return applied;
}

module.exports = { exportProject, applyReport, reverseKind };
