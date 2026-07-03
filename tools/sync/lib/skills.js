const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fsutil = require('./fsutil');

function loadManifest(cacheDir) {
  const manifestPath = path.join(cacheDir, 'skills-manifest.js');
  delete require.cache[require.resolve(manifestPath)];
  return require(manifestPath);
}

function syncOne(skill, targetRoot) {
  const dest = path.join(targetRoot, skill.name);
  const ref = skill.ref || 'main';
  fsutil.ensureDir(targetRoot);
  if (fs.existsSync(path.join(dest, '.git'))) {
    execFileSync('git', ['-C', dest, 'fetch', '--depth', '1', 'origin', ref], { stdio: 'ignore' });
    execFileSync('git', ['-C', dest, 'reset', '--hard', `origin/${ref}`], { stdio: 'ignore' });
  } else {
    execFileSync('git', ['clone', '--depth', '1', '--branch', ref, skill.repo, dest], { stdio: 'ignore' });
  }
  return dest;
}

function syncSkills(cacheDir, { cursorSkillsDir, claudeSkillsDir }) {
  const { skills } = loadManifest(cacheDir);
  const results = [];

  for (const skill of skills) {
    if (skill.name === 'myrules') continue;
    for (const targetRoot of [cursorSkillsDir, claudeSkillsDir]) {
      try {
        const dest = syncOne(skill, targetRoot);
        results.push({ name: skill.name, target: dest, ok: true });
      } catch (err) {
        results.push({ name: skill.name, target: path.join(targetRoot, skill.name), ok: false, error: err.message });
      }
    }
  }
  return results;
}

module.exports = { syncSkills };
