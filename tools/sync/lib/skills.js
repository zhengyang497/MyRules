const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fsutil = require('./fsutil');

function loadManifest(cacheDir) {
  const manifestPath = path.join(cacheDir, 'skills-manifest.js');
  delete require.cache[require.resolve(manifestPath)];
  return require(manifestPath);
}

function gitCloneOrUpdate(repo, dest, ref) {
  fsutil.ensureDir(path.dirname(dest));
  if (fs.existsSync(path.join(dest, '.git'))) {
    execFileSync('git', ['-C', dest, 'fetch', '--depth', '1', 'origin', ref], { stdio: 'ignore' });
    execFileSync('git', ['-C', dest, 'reset', '--hard', `origin/${ref}`], { stdio: 'ignore' });
  } else {
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    execFileSync('git', ['clone', '--depth', '1', '--branch', ref, repo, dest], { stdio: 'ignore' });
  }
}

function copyDir(source, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function materializeSubdir(cloneDir, subPath, dest) {
  const source = path.join(cloneDir, subPath);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`skill path not found: ${subPath}`);
  }
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  copyDir(source, dest);
}

function syncOne(skill, targetRoot, cacheDir) {
  const dest = path.join(targetRoot, skill.name);
  const ref = skill.ref || 'main';
  fsutil.ensureDir(targetRoot);

  if (skill.path) {
    const cloneDir = path.join(cacheDir, '.skill-clones', skill.name);
    gitCloneOrUpdate(skill.repo, cloneDir, ref);
    materializeSubdir(cloneDir, skill.path, dest);
    return dest;
  }

  gitCloneOrUpdate(skill.repo, dest, ref);
  return dest;
}

function syncSkills(cacheDir, { cursorSkillsDir, claudeSkillsDir }) {
  const { skills } = loadManifest(cacheDir);
  const results = [];

  for (const skill of skills) {
    if (skill.name === 'myrules') continue;
    for (const targetRoot of [cursorSkillsDir, claudeSkillsDir]) {
      try {
        const dest = syncOne(skill, targetRoot, cacheDir);
        results.push({ name: skill.name, target: dest, ok: true });
      } catch (err) {
        results.push({ name: skill.name, target: path.join(targetRoot, skill.name), ok: false, error: err.message });
      }
    }
  }
  return results;
}

module.exports = { syncSkills };
