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

function contentForEntry(srcPath, kind) {
  const raw = fs.readFileSync(srcPath, 'utf8');
  if (kind === 'claude-rule') return transform.stripCursorFrontmatter(raw);
  return raw;
}

function staleMethodCleanup(priorHashes, newHashes, projectRoot) {
  const removed = [];
  for (const key of Object.keys(priorHashes || {})) {
    if (!key.startsWith('method:') || key in newHashes) continue;
    const rel = key.slice('method:'.length);
    const filePath = path.join(projectRoot, rel);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      removed.push(filePath);
    }
  }
  return removed;
}

function deployMethod(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const runtime = opts.runtime || 'agent';
  const force = opts.force || false;
  const priorHashes = opts.priorHashes || {};
  const tracker = drift.createTracker({ force, priorHashes });

  for (const entry of entriesForRuntime(manifest, runtime)) {
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

  const staleRemoved = staleMethodCleanup(priorHashes, tracker.hashes, projectRoot);
  return { hashes: tracker.hashes, drifted: tracker.drifted, staleRemoved };
}

module.exports = { deployMethod, entriesForRuntime, staleMethodCleanup };
