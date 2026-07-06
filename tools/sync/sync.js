#!/usr/bin/env node
const path = require('node:path');
const paths = require('./lib/paths');
const git = require('./lib/git');
const state = require('./lib/state');
const deploy = require('./lib/deploy');
const deployAgents = require('./lib/deploy-agents');
const legacy = require('./lib/legacy');
const skills = require('./lib/skills');
const registry = require('./lib/registry');
const loadManifest = require('./lib/load-manifest');
const ensureCache = require('./lib/ensure-cache');
const prepareProject = require('./lib/prepare-project');
const hooksDeploy = require('./lib/hooks-deploy');
const hooksState = require('./lib/hooks-state');

function parseArgs(argv) {
  const args = { dryRun: false, prune: false, project: null, all: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--prune-legacy-rules') args.prune = true;
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '--project') args.project = argv[++i];
  }
  return args;
}

function reportSkillResults(results) {
  const failed = results.filter((r) => !r.ok);
  if (!failed.length) return;
  console.warn(`Skill sync failed for ${failed.length} target(s):`);
  for (const r of failed) {
    console.warn(`  ${r.name} → ${r.target}: ${r.error}`);
  }
}

function reportDrifted(label, files) {
  if (!files.length) return;
  console.warn(`Skipped ${files.length} locally-modified ${label} (run 'export' first, or pass --force):`);
  files.forEach((f) => console.warn(`  ${f}`));
}

function syncOne(cacheDir, projectRoot, opts, manifest) {
  const managedPrefix = manifest.managedPrefix;
  const backupDir = manifest.prune.backupDir;
  const legacyFiles = legacy.scanLegacy(projectRoot, managedPrefix, manifest);
  const fp = legacy.fingerprint(legacyFiles);

  if (opts.dryRun) {
    console.log(`[dry-run] ${projectRoot}`);
    console.log(`  legacy files (${legacyFiles.length}):`);
    legacyFiles.forEach((f) => console.log(`    ${f}`));
    if (opts.prune) {
      state.writeState(projectRoot, {
        pruneDryRunDone: true,
        pruneDryRunAt: new Date().toISOString(),
        legacyRulesFingerprint: fp,
        legacyRulesDetected: legacyFiles.length,
      });
    }
    return;
  }

  const current = state.readState(projectRoot);
  const result = deploy.deployRules(cacheDir, projectRoot, {
    force: opts.force,
    priorHashes: current.deployedHashes,
    manifest,
    ...(opts.claudeUserDir ? { claudeUserDir: opts.claudeUserDir } : {}),
  });
  reportDrifted('file(s)', result.drifted);

  const agentsResult = deployAgents.deployAgents(cacheDir, projectRoot, {
    force: opts.force,
    priorAgentHashes: current.deployedAgentHashes,
    manifest,
  });
  reportDrifted('agent file(s)', agentsResult.drifted);
  if (agentsResult.missingAgents.length) {
    console.warn(
      `Skipped ${agentsResult.missingAgents.length} project rule(s) without agents frontmatter (add agents: to include in sub-agent bundles):`
    );
    agentsResult.missingAgents.forEach((f) => console.warn(`  rules/project/${f}`));
  }

  const hooksResult = hooksDeploy.deployProjectHooks(cacheDir, projectRoot, {
    force: opts.force,
    priorState: { deployedHooks: current.deployedHooks, deployedHashes: current.deployedHashes },
    manifest,
    ...(opts.claudeDir ? { claudeDir: opts.claudeDir } : {}),
  });
  reportDrifted('hook file(s)', hooksResult.drifted);

  let lastPruneAt = current.lastPruneAt;
  if (opts.prune) {
    if (!current.pruneDryRunDone || current.legacyRulesFingerprint !== fp) {
      throw new Error(
        "Refusing to prune: run with --dry-run --prune-legacy-rules first (legacy set changed or dry-run not done)."
      );
    }
    const backupRoot = legacy.pruneLegacy(projectRoot, legacyFiles, backupDir);
    console.log(`Archived ${legacyFiles.length} legacy file(s) to ${backupRoot}`);
    lastPruneAt = new Date().toISOString();
  }

  state.writeState(projectRoot, {
    cacheCommit: git.revParseHead(cacheDir),
    lastSyncAt: new Date().toISOString(),
    lastPruneAt,
    deployedHashes: { ...result.hashes, ...hooksResult.deployedHashes },
    deployedAgentHashes: agentsResult.hashes,
    deployedHooks: hooksResult.deployedHooks,
  });
  registry.registerProject(projectRoot, opts.homeDir || require('node:os').homedir());
}

function run(opts) {
  let cacheDir = opts.cacheDir || paths.getCacheDir();
  const homeDir = opts.homeDir || require('node:os').homedir();

  let manifest = loadManifest.loadManifest(cacheDir);
  if (!opts.skipEnsureCache) {
    const cacheResult = ensureCache.ensureCache(cacheDir, manifest);
    if (cacheResult.created) {
      console.log(`Cloned MyRules cache to ${cacheDir}`);
      manifest = loadManifest.loadManifest(cacheDir);
    }
  }

  if (!opts.skipPull) {
    if (git.isDirty(cacheDir)) {
      throw new Error(`${cacheDir} has uncommitted changes. Commit/stash, or run push.js, before syncing.`);
    }
    git.pullFastForward(cacheDir);
  }
  if (!opts.skipSkills) {
    const skillResults = skills.syncSkills(cacheDir, {
      cursorSkillsDir: paths.getCursorUserSkillsDir(homeDir),
      claudeSkillsDir: paths.getClaudeUserSkillsDir(homeDir),
    });
    reportSkillResults(skillResults);
  }
  if (!opts.skipUserHooks) {
    const priorUserHooksState = hooksState.readUserHooksState(homeDir);
    const userHooksResult = hooksDeploy.deployUserHooks(cacheDir, {
      homeDir,
      force: opts.force,
      priorState: priorUserHooksState,
      manifest,
    });
    reportDrifted('user hook file(s)', userHooksResult.drifted);
    hooksState.writeUserHooksState(homeDir, {
      deployedHooks: userHooksResult.deployedHooks,
      deployedHashes: userHooksResult.deployedHashes,
    });
  }

  if (opts.all) {
    for (const p of registry.listRegisteredProjects(homeDir)) {
      syncOne(cacheDir, p, opts, manifest);
    }
  } else {
    const projectRoot = paths.getProjectRoot(opts.project);
    if (!opts.skipPrepare) {
      prepareProject.prepareProject(projectRoot, cacheDir, manifest);
    }
    syncOne(cacheDir, projectRoot, opts, manifest);
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

module.exports = { run, parseArgs, reportSkillResults };
