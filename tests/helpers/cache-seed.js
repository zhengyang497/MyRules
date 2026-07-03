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
}

module.exports = { seedCacheContent, REPO_ROOT };
