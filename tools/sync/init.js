#!/usr/bin/env node
const os = require('node:os');
const path = require('node:path');
const paths = require('./lib/paths');
const gitignoreLib = require('./lib/gitignore');
const registry = require('./lib/registry');
const legacy = require('./lib/legacy');
const loadManifest = require('./lib/load-manifest');
const ensureCache = require('./lib/ensure-cache');
const projectSkill = require('./lib/project-skill');
const syncCli = require('./sync');

function parseArgs(argv) {
  let project = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') project = argv[++i];
  }
  return { project };
}

function run(opts = {}) {
  const projectRoot = paths.getProjectRoot(opts.project);
  let cache = opts.cacheDir || paths.getCacheDir();
  const homeDir = opts.homeDir || os.homedir();

  let manifest = loadManifest.loadManifest(cache);
  const cacheResult = ensureCache.ensureCache(cache, manifest);
  if (cacheResult.created) {
    console.log(`Cloned MyRules cache to ${cache}`);
    manifest = loadManifest.loadManifest(cache);
  }

  if (!projectSkill.isProjectSkillInstalled(projectRoot, manifest)) {
    throw new Error(
      'MyRules skill is not installed in this project. Import it from GitHub first ' +
        `(run install-skill.js, or ask the Agent to install MyRules from ${manifest.repo}).`
    );
  }

  if (manifest.deploy.gitignoreDeployArtifacts) {
    gitignoreLib.ensureGitignore(projectRoot, manifest);
  }

  registry.registerProject(projectRoot, homeDir);

  const legacyFiles = legacy.scanLegacy(projectRoot, manifest.managedPrefix, manifest);
  if (legacyFiles.length) {
    console.log(`Detected ${legacyFiles.length} legacy rule file(s) not managed by MyRules:`);
    legacyFiles.forEach((f) => console.log(`  ${f}`));
    console.log('\nThese are left in place. To make MyRules the primary source, run:');
    console.log(`  node "${path.join(cache, 'tools', 'sync', 'sync.js')}" --dry-run --prune-legacy-rules --project "${projectRoot}"`);
  }

  syncCli.run({ ...opts, project: projectRoot, cacheDir: cache });
}

if (require.main === module) {
  try {
    run(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { run, parseArgs };
