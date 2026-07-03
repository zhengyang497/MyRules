#!/usr/bin/env node
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const paths = require('./lib/paths');
const loadManifest = require('./lib/load-manifest');
const projectSkill = require('./lib/project-skill');

function parseArgs(argv) {
  let project = null;
  let sourceDir = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') project = argv[++i];
    else if (argv[i] === '--source-dir') sourceDir = argv[++i];
  }
  return { project, sourceDir };
}

function getBundledRepoRoot() {
  return path.join(__dirname, '..', '..');
}

function skillSourceExists(repoRoot, manifest) {
  const rel = (manifest.bootstrap || {}).skillSource || 'skills/myrules/SKILL.md';
  return fs.existsSync(path.join(repoRoot, rel));
}

function shallowClone(repo, parentDir) {
  const dest = fs.mkdtempSync(path.join(parentDir || os.tmpdir(), 'myrules-skill-src-'));
  try {
    execFileSync('git', ['clone', '--depth', '1', repo, dest], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch (err) {
    fs.rmSync(dest, { recursive: true, force: true });
    const detail = err.stderr || err.message || String(err);
    throw new Error(`Failed to clone ${repo}: ${detail}`);
  }
  return dest;
}

function resolveSkillSource(manifest, opts) {
  if (opts.sourceDir) {
    const sourceDir = path.resolve(opts.sourceDir);
    if (!skillSourceExists(sourceDir, manifest)) {
      throw new Error(`MyRules skill source missing in --source-dir: ${sourceDir}`);
    }
    return { sourceDir, cleanup: false };
  }

  const bundled = getBundledRepoRoot();
  if (skillSourceExists(bundled, manifest)) {
    return { sourceDir: bundled, cleanup: false };
  }

  const cache = opts.cacheDir || paths.getCacheDir(opts.homeDir);
  if (skillSourceExists(cache, manifest)) {
    return { sourceDir: cache, cleanup: false };
  }

  const temp = shallowClone(manifest.repo, opts.tempParentDir);
  return { sourceDir: temp, cleanup: true };
}

function run(opts = {}) {
  const projectRoot = paths.getProjectRoot(opts.project);
  const cacheDir = opts.cacheDir || paths.getCacheDir(opts.homeDir);
  const manifest = loadManifest.loadManifest(cacheDir);

  const { sourceDir, cleanup } = resolveSkillSource(manifest, opts);
  try {
    const result = projectSkill.ensureProjectSkill(projectRoot, sourceDir, manifest);
    projectSkill.logSkillInstallResult(result, manifest);
    return result;
  } finally {
    if (cleanup && sourceDir && !opts.keepSource) {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
  }
}

if (require.main === module) {
  try {
    run(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { run, parseArgs, resolveSkillSource, getBundledRepoRoot, skillSourceExists };
