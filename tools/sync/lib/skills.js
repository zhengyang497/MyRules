const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fsutil = require('./fsutil');

function loadManifest(cacheDir) {
  const manifestPath = path.join(cacheDir, 'skills-manifest.js');
  delete require.cache[require.resolve(manifestPath)];
  return require(manifestPath);
}

function formatGitError(err) {
  const parts = [err.message];
  if (err.stderr) parts.push(String(err.stderr).trim());
  if (err.stdout) parts.push(String(err.stdout).trim());
  return [...new Set(parts.filter(Boolean))].join('\n');
}

function runGit(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const wrapped = new Error(formatGitError(err));
    wrapped.status = err.status;
    throw wrapped;
  }
}

function gitCloneOrUpdate(repo, dest, ref, { update = false } = {}) {
  fsutil.ensureDir(path.dirname(dest));
  if (fs.existsSync(path.join(dest, '.git'))) {
    if (!update) return { reused: true };
    try {
      runGit(['-C', dest, 'fetch', '--depth', '1', 'origin', ref]);
      runGit(['-C', dest, 'reset', '--hard', `origin/${ref}`]);
      return { updated: true };
    } catch (err) {
      return { reused: true, warning: err.message };
    }
  }
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  runGit(['clone', '--depth', '1', '--branch', ref, repo, dest]);
  return { cloned: true };
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

function syncOne(skill, targetRoot, cacheDir, { update = false } = {}) {
  const dest = path.join(targetRoot, skill.name);
  const ref = skill.ref || 'main';
  fsutil.ensureDir(targetRoot);

  if (skill.path) {
    const cloneDir = path.join(cacheDir, '.skill-clones', skill.name);
    const gitResult = gitCloneOrUpdate(skill.repo, cloneDir, ref, { update });
    materializeSubdir(cloneDir, skill.path, dest);
    return { dest, ...gitResult };
  }

  const gitResult = gitCloneOrUpdate(skill.repo, dest, ref, { update });
  return { dest, ...gitResult };
}

function syncSkills(cacheDir, { cursorSkillsDir, claudeSkillsDir, update = false } = {}) {
  const { skills } = loadManifest(cacheDir);
  const results = [];

  for (const skill of skills) {
    if (skill.name === 'myrules') continue;
    for (const targetRoot of [cursorSkillsDir, claudeSkillsDir]) {
      try {
        const { dest, reused, warning, updated, cloned } = syncOne(skill, targetRoot, cacheDir, { update });
        results.push({
          name: skill.name,
          target: dest,
          ok: true,
          reused: Boolean(reused),
          warning: warning || undefined,
          updated: Boolean(updated),
          cloned: Boolean(cloned),
        });
      } catch (err) {
        results.push({
          name: skill.name,
          target: path.join(targetRoot, skill.name),
          ok: false,
          error: err.message,
        });
      }
    }
  }
  return results;
}

module.exports = { syncSkills };
