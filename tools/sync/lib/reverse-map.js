// tools/sync/lib/reverse-map.js
//
// 反查映射：部署产物 ↔ 缓存源。capture（自动回流）与 export（报告/手动回填）
// 共用这一份映射，保证「部署写哪里、反查回哪里」只有一处定义。
//
// 核心不变式（prefixesFor 保证，reverse-map.test.js 逐成员验证）：
//   emittedSource(m, S) === dstPrefix + S.slice(srcPrefix.length)
//   backfillSource(m, S, D) === S.slice(0, srcPrefix.length) + D.slice(dstPrefix.length)
//   且 backfillSource(m, S, emittedSource(m, S)).source === S（round-trip 无损）
const fs = require('node:fs');
const path = require('node:path');
const transform = require('./transform');
const deployMethod = require('./deploy-method');
const ruleTargetsLib = require('./rule-targets');

function posix(p) {
  return String(p).replace(/\\/g, '/');
}

const SKILL_ROOT_RE = /^\.(?:cursor|claude|dsh)\/skills(\/|$)/;

function isSkillsRoot(rel) {
  return SKILL_ROOT_RE.test(posix(rel));
}

function skillNameOfTarget(target) {
  const m = posix(target).match(/^\.(?:cursor|claude|dsh)\/skills\/([^/]+)/);
  return m ? m[1] : null;
}

function splitFrontmatter(text) {
  const m = text.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/);
  return m ? { header: m[1], body: m[2] } : { header: '', body: text };
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
 * 部署 transform 的字节前缀关系：emitted = dstPrefix + sourceText.slice(srcPrefix.length)
 * - rules cursor：剥源头+空行、加生成头
 * - rules .md：剥源头+空行，正文原样
 * - method cursor-rule / claude-rule(CRLF 未剥中)：整文拷贝，源头随行 → 改头即冲突
 * - method claude-rule(剥中) / dsh-rule：剥源头+空行，正文原样
 */
function prefixesFor(entry, sourceText) {
  if (entry.surface === 'rule') {
    const body = transform.parseRuleFrontmatter(sourceText).body;
    const src = sourceText.slice(0, sourceText.length - body.length);
    const dst = entry.emit === 'cursor' ? transform.transformForCursor('', entry.topic) : '';
    return { src, dst };
  }
  if (entry.backfill === 'bytes') return { src: '', dst: '' };
  if (entry.methodKind === 'claude-rule') {
    const stripped = transform.stripCursorFrontmatter(sourceText);
    if (stripped !== sourceText) {
      return { src: sourceText.slice(0, sourceText.length - stripped.length), dst: '' };
    }
    const h = splitFrontmatter(sourceText).header;
    return { src: h, dst: h };
  }
  if (entry.methodKind === 'dsh-rule') {
    const stripped = transform.stripRuleFrontmatter(sourceText);
    return { src: sourceText.slice(0, sourceText.length - stripped.length), dst: '' };
  }
  const h = splitFrontmatter(sourceText).header;
  return { src: h, dst: h };
}

function emittedSource(entry, sourceText) {
  if (entry.surface === 'rule') {
    return ruleTargetsLib.emittedRuleContent(entry, sourceText);
  }
  return deployMethod.contentForText(sourceText, entry.methodKind);
}

function backfillSource(entry, sourceText, deployedText) {
  if (entry.backfill === 'bytes') return { ok: true, source: deployedText };
  const { src, dst } = prefixesFor(entry, sourceText);
  if (!deployedText.startsWith(dst)) return { ok: false, reason: 'header-edit' };
  return { ok: true, source: sourceText.slice(0, src.length) + deployedText.slice(dst.length) };
}

function methodMembers(cacheDir, projectRoot, opts) {
  const manifest = opts.manifest;
  const runtime = opts.runtime || 'agent';
  const instanceLanding = Boolean(opts.instanceLanding);
  const out = [];
  for (const entry of deployMethod.entriesForRuntime(manifest, runtime)) {
    if (instanceLanding && entry.instanceOwned) continue;
    const surfaceOf = (rel) => (isSkillsRoot(rel) ? 'skill' : 'method');
    if (entry.srcDir && entry.destDir) {
      const srcDir = path.join(cacheDir, entry.srcDir);
      if (!fs.existsSync(srcDir)) continue;
      for (const abs of walkFiles(srcDir)) {
        const relInside = posix(path.relative(srcDir, abs));
        const destRel = posix(path.posix.join(entry.destDir.replace(/\\/g, '/'), relInside));
        out.push({
          abs: path.join(projectRoot, destRel),
          stateKey: `method:${destRel}`,
          sourceAbs: abs,
          surface: surfaceOf(destRel),
          backfill: 'bytes',
        });
      }
      continue;
    }
    if (!entry.src || !entry.dest) continue;
    const destRel = posix(entry.dest);
    out.push({
      abs: path.join(projectRoot, destRel),
      stateKey: `method:${destRel}`,
      sourceAbs: path.join(cacheDir, entry.src),
      surface: surfaceOf(destRel),
      backfill: entry.kind ? 'body' : 'bytes',
      methodKind: entry.kind,
    });
  }
  return out;
}

function buildReverseMap(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || require('./load-manifest').loadManifest(cacheDir);
  const members = [];
  for (const t of ruleTargetsLib.ruleTargets(cacheDir, projectRoot, {
    manifest,
    ...(opts.claudeUserDir ? { claudeUserDir: opts.claudeUserDir } : {}),
    ...(opts.opencodeUserDir ? { opencodeUserDir: opts.opencodeUserDir } : {}),
    ...(opts.dshUserDir ? { dshUserDir: opts.dshUserDir } : {}),
  })) {
    members.push({ ...t, surface: 'rule', backfill: 'body' });
  }
  members.push(...methodMembers(cacheDir, projectRoot, { ...opts, manifest }));
  return members;
}

// 技能部署文件 → 缓存源：manifest 显式单文件映射优先，其次 method/skills/<name>/<rel> 约定
function skillSourceFor(destRel, manifest) {
  const norm = posix(destRel);
  for (const entry of (manifest.method && manifest.method.files) || []) {
    if (entry.src && entry.dest && isSkillsRoot(entry.dest) && posix(entry.dest) === norm) {
      return posix(entry.src);
    }
  }
  const m = norm.match(/^\.(?:cursor|claude|dsh)\/skills\/([^/]+)\/(.+)$/);
  return m ? `method/skills/${m[1]}/${m[2]}` : null;
}

module.exports = {
  buildReverseMap,
  emittedSource,
  backfillSource,
  splitFrontmatter,
  isSkillsRoot,
  skillNameOfTarget,
  skillSourceFor,
};
