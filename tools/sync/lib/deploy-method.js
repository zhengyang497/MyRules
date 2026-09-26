const fs = require('node:fs');
const path = require('node:path');
const drift = require('./drift');
const transform = require('./transform');
const loadManifest = require('./load-manifest');

function posixRel(rel) {
  return String(rel).replace(/\\/g, '/');
}

function listFilesRecursive(root) {
  const out = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) out.push(abs);
    }
  }
  walk(root);
  return out;
}

function entriesForRuntime(manifest, runtime) {
  const files = (manifest.method && manifest.method.files) || [];
  return files.filter((entry) => {
    const runtimes = entry.runtimes || ['agent', 'project'];
    return runtimes.includes(runtime);
  });
}

// 部署内容的字节级 transform（deploy 与 reverse-map 反查共用同一实现，保证逐字节一致）
function contentForText(raw, kind) {
  if (kind === 'claude-rule') return transform.stripCursorFrontmatter(raw);
  // dsh-rule：剥掉 Cursor frontmatter。用 CRLF 兼容的 stripRuleFrontmatter
  // （stripCursorFrontmatter 的正则只认 \n；method 源文件是 CRLF）。
  if (kind === 'dsh-rule') return transform.stripRuleFrontmatter(raw);
  return raw;
}

function contentForEntry(srcPath, kind) {
  return contentForText(fs.readFileSync(srcPath, 'utf8'), kind);
}

function relIsPreserved(rel, preserveRels) {
  for (const p of preserveRels) {
    if (rel === p || rel.startsWith(`${p}/`)) return true;
  }
  return false;
}

function collectPreserveRel(entry, preserveRels) {
  if (entry.destDir) preserveRels.add(posixRel(entry.destDir.replace(/\\/g, '/')));
  if (entry.dest) preserveRels.add(posixRel(entry.dest));
}

function preserveGroupKey(entry) {
  return entry.srcDir ? `dir:${posixRel(entry.srcDir)}` : `file:${posixRel(entry.src)}`;
}

function preserveGroupsOf(manifest) {
  const groups = new Map();
  for (const entry of (manifest.method && manifest.method.files) || []) {
    if (entry.instanceOwned !== 'preserve') continue;
    const key = preserveGroupKey(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return groups;
}

function copyPath(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copyPath(path.join(src, name), path.join(dest, name));
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/**
 * preserve 跨平台补缺（instanceLanding 语义）：
 * - 目标平台缺失 → 从实例自己的姊妹拷贝镜像一份（内容=实例版，不是缓存版）；
 * - 已存在的永不覆盖；
 * - 各平台全被实例删光 → 尊重删除，不重建。
 * 返回被补缺的路径，或 null（无需动作）。
 */
function gapFillPreserve(entry, siblings, projectRoot) {
  const mine = path.join(projectRoot, posixRel(entry.destDir || entry.dest));
  if (fs.existsSync(mine)) return null;
  for (const sibling of siblings) {
    const theirs = path.join(projectRoot, posixRel(sibling.destDir || sibling.dest));
    if (theirs === mine || !fs.existsSync(theirs)) continue;
    copyPath(theirs, mine);
    return mine;
  }
  return null;
}

function unlinkIfFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const st = fs.lstatSync(filePath);
  if (st.isSymbolicLink() || st.isFile()) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

function staleMethodCleanup(priorHashes, newHashes, projectRoot, preserveRels = new Set()) {
  const removed = [];
  for (const key of Object.keys(priorHashes || {})) {
    if (!key.startsWith('method:') || key in newHashes) continue;
    const rel = key.slice('method:'.length);
    if (relIsPreserved(rel, preserveRels)) continue;
    const filePath = path.join(projectRoot, rel);
    if (unlinkIfFile(filePath)) removed.push(filePath);
  }
  return removed;
}

function deployMethod(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const runtime = opts.runtime || 'agent';
  const force = opts.force || false;
  const priorHashes = opts.priorHashes || {};
  const instanceLanding = Boolean(opts.instanceLanding);
  const tracker = drift.createTracker({ force, priorHashes });
  const preserveRels = new Set();
  const dropped = [];
  const gapFilled = [];
  const preserveGroups = preserveGroupsOf(manifest);

  for (const entry of entriesForRuntime(manifest, runtime)) {
    const owned = instanceLanding ? entry.instanceOwned : null;

    if (owned === 'preserve') {
      collectPreserveRel(entry, preserveRels);
      const filled = gapFillPreserve(entry, preserveGroups.get(preserveGroupKey(entry)) || [], projectRoot);
      if (filled) gapFilled.push(filled);
      continue;
    }

    if (owned === 'drop') {
      if (entry.dest) {
        const dest = path.join(projectRoot, posixRel(entry.dest));
        if (unlinkIfFile(dest)) dropped.push(dest);
      }
      continue;
    }

    if (entry.srcDir && entry.destDir) {
      const srcDir = path.join(cacheDir, entry.srcDir);
      if (!fs.existsSync(srcDir)) continue;
      for (const abs of listFilesRecursive(srcDir)) {
        const relInside = path.relative(srcDir, abs);
        const destRel = posixRel(path.posix.join(entry.destDir.replace(/\\/g, '/'), relInside.replace(/\\/g, '/')));
        const dest = path.join(projectRoot, destRel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        tracker.writeTracked(dest, fs.readFileSync(abs, 'utf8'), `method:${destRel}`);
      }
      continue;
    }

    if (!entry.src || !entry.dest) continue;
    const srcPath = path.join(cacheDir, entry.src);
    if (!fs.existsSync(srcPath)) continue;
    const destRel = posixRel(entry.dest);
    const dest = path.join(projectRoot, destRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    tracker.writeTracked(dest, contentForEntry(srcPath, entry.kind), `method:${destRel}`);
  }

  const staleRemoved = staleMethodCleanup(priorHashes, tracker.hashes, projectRoot, preserveRels);
  // captureBaselines：粘性捕获基线（skills/method 成员由同一 tracker 写盘；drift 拒写的目标不在此）
  return { hashes: tracker.hashes, drifted: tracker.drifted, staleRemoved, dropped, gapFilled, preserveRels: [...preserveRels], captureBaselines: tracker.captureBaselines };
}

module.exports = { deployMethod, entriesForRuntime, staleMethodCleanup, relIsPreserved, gapFillPreserve, preserveGroupsOf, contentForText };
