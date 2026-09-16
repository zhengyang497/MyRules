// tests/helpers/cache-seed.js
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..');

function copySkillDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith('.md')) continue;
    fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
  }
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

function writeRuntime(projectRoot, runtime = 'agent') {
  fs.writeFileSync(
    path.join(projectRoot, '.myrules-runtime.json'),
    JSON.stringify({ runtime }, null, 2) + '\n'
  );
}

function seedCacheContent(cacheDir) {
  fs.mkdirSync(path.join(cacheDir, 'rules', 'user'), { recursive: true });
  fs.mkdirSync(path.join(cacheDir, 'rules', 'project'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'manifest.js'), path.join(cacheDir, 'manifest.js'));
  copySkillDir(path.join(REPO_ROOT, 'skills', 'myrules'), path.join(cacheDir, 'skills', 'myrules'));
  fs.writeFileSync(path.join(cacheDir, 'skills-manifest.js'), 'module.exports = { skills: [] };\n');
  for (const f of fs.readdirSync(path.join(REPO_ROOT, 'rules', 'project'))) {
    if (!f.endsWith('.md')) continue;
    fs.copyFileSync(path.join(REPO_ROOT, 'rules', 'project', f), path.join(cacheDir, 'rules', 'project', f));
  }
  for (const f of fs.readdirSync(path.join(REPO_ROOT, 'rules', 'user'))) {
    if (!f.endsWith('.md')) continue;
    fs.copyFileSync(path.join(REPO_ROOT, 'rules', 'user', f), path.join(cacheDir, 'rules', 'user', f));
  }
  fs.mkdirSync(path.join(cacheDir, 'hooks', 'project'), { recursive: true });
  fs.mkdirSync(path.join(cacheDir, 'hooks', 'user'), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, 'hooks', 'project', 'session-start-context.js'),
    path.join(cacheDir, 'hooks', 'project', 'session-start-context.js')
  );
  fs.copyFileSync(
    path.join(REPO_ROOT, 'hooks', 'user', 'session-log.js'),
    path.join(cacheDir, 'hooks', 'user', 'session-log.js')
  );
  const workerHook = path.join(REPO_ROOT, 'hooks', 'project', 'subagent-start-worker.js');
  if (fs.existsSync(workerHook)) {
    fs.copyFileSync(workerHook, path.join(cacheDir, 'hooks', 'project', 'subagent-start-worker.js'));
  }
  copyDirRecursive(path.join(REPO_ROOT, 'method'), path.join(cacheDir, 'method'));
}

module.exports = { seedCacheContent, REPO_ROOT, copySkillDir, writeRuntime };
