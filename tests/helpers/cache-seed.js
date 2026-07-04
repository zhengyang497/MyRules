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

function seedCacheContent(cacheDir) {
  fs.mkdirSync(path.join(cacheDir, 'rules', 'user'), { recursive: true });
  fs.mkdirSync(path.join(cacheDir, 'rules', 'project'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'manifest.js'), path.join(cacheDir, 'manifest.js'));
  copySkillDir(path.join(REPO_ROOT, 'skills', 'myrules'), path.join(cacheDir, 'skills', 'myrules'));
  fs.writeFileSync(path.join(cacheDir, 'skills-manifest.js'), 'module.exports = { skills: [] };\n');
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
}

module.exports = { seedCacheContent, REPO_ROOT, copySkillDir };
