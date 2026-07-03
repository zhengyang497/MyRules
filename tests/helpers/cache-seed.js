// tests/helpers/cache-seed.js
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..');

function seedCacheContent(cacheDir) {
  fs.mkdirSync(path.join(cacheDir, 'rules', 'user'), { recursive: true });
  fs.mkdirSync(path.join(cacheDir, 'rules', 'project'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'manifest.js'), path.join(cacheDir, 'manifest.js'));
  fs.mkdirSync(path.join(cacheDir, 'skills', 'myrules'), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, 'skills', 'myrules', 'SKILL.md'),
    path.join(cacheDir, 'skills', 'myrules', 'SKILL.md')
  );
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

module.exports = { seedCacheContent, REPO_ROOT };
