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
const opencodeConfig = require('./lib/opencode-config-deploy');
const runtimeLib = require('./lib/runtime');
const deployMethod = require('./lib/deploy-method');
const projectSkill = require('./lib/project-skill');
const dshInstructions = require('./lib/dsh-instructions');
const dshRoles = require('./lib/dsh-roles-deploy');

function parseArgs(argv) {
  const args = { dryRun: false, prune: false, project: null, all: false, force: false, updateSkills: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--prune-legacy-rules') args.prune = true;
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '--update-skills') args.updateSkills = true;
    else if (argv[i] === '--project') args.project = argv[++i];
  }
  return args;
}

function reportSkillResults(results) {
  const failed = results.filter((r) => !r.ok);
  const kept = results.filter((r) => r.ok && r.warning);
  if (failed.length) {
    console.warn(`Skill sync failed for ${failed.length} target(s):`);
    for (const r of failed) {
      console.warn(`  ${r.name} → ${r.target}: ${r.error}`);
    }
  }
  if (kept.length) {
    console.warn(`Skill fetch failed; kept existing files for ${kept.length} target(s):`);
    for (const r of kept) {
      console.warn(`  ${r.name} → ${r.target}: ${r.warning}`);
    }
  }
}

function reportDrifted(label, files) {
  if (!files.length) return;
  console.warn(`Skipped ${files.length} locally-modified ${label} (run 'export' first, or pass --force):`);
  files.forEach((f) => console.warn(`  ${f}`));
}

function syncOne(cacheDir, projectRoot, opts, manifest) {
  const homeDir = opts.homeDir || require('node:os').homedir();
  if (!opts.skipPrepare) {
    // Skill check first so bootstrap failures stay distinguishable from missing runtime.
    if (!projectSkill.isProjectSkillInstalled(projectRoot, manifest)) {
      // 迁移自愈：老项目已有旧平台 skill、仅缺新平台目标时尽力补齐（缓存缺源也不致命）
      if (projectSkill.isLegacySkillInstalled(projectRoot, manifest)) {
        try {
          projectSkill.ensureProjectSkill(projectRoot, cacheDir, manifest);
        } catch {
          /* 缓存缺 skill 源时保持现状：旧平台已装即可继续 */
        }
      }
    }
    if (!projectSkill.isProjectSkillInstalled(projectRoot, manifest) && !projectSkill.isLegacySkillInstalled(projectRoot, manifest)) {
      throw new Error(
        'MyRules skill is not installed in this project. Import it from GitHub first ' +
          `(run install-skill.js, or ask the Agent to install MyRules from ${manifest.repo}).`
      );
    }
  }
  const resolved = runtimeLib.resolveRuntime(projectRoot, {
    registryRuntime: opts.knownRuntime || registry.findRuntime(homeDir, projectRoot),
  });
  const runtime = resolved.runtime;
  if (!opts.skipPrepare) {
    prepareProject.prepareProject(projectRoot, cacheDir, manifest, { runtime });
  }

  const managedPrefix = manifest.managedPrefix;
  const backupDir = manifest.prune.backupDir;
  const legacyFiles = legacy.scanLegacy(projectRoot, managedPrefix, manifest);
  const fp = legacy.fingerprint(legacyFiles);

  if (opts.dryRun) {
    console.log(`[dry-run] ${projectRoot} runtime=${runtime}`);
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
    registry.registerProject(projectRoot, homeDir, runtime);
    return;
  }

  const current = state.readState(projectRoot);
  const result = deploy.deployRules(cacheDir, projectRoot, {
    force: opts.force,
    priorHashes: current.deployedHashes,
    manifest,
    runtime,
    ...(opts.claudeUserDir ? { claudeUserDir: opts.claudeUserDir } : {}),
    ...(opts.opencodeUserDir ? { opencodeUserDir: opts.opencodeUserDir } : {}),
    // dsh 用户目录按 homeDir 推导：测试传 fake homeDir 即可整体隔离
    dshUserDir: opts.dshUserDir || paths.getDshUserRulesDir(homeDir),
  });
  reportDrifted('file(s)', result.drifted);

  const ocConfigResult = opencodeConfig.deployProjectConfig(cacheDir, projectRoot, {
    manifest,
    priorEntries: (current.deployedOpencodeInstructions && current.deployedOpencodeInstructions.project) || [],
  });

  const agentsResult = deployAgents.deployAgents(cacheDir, projectRoot, {
    force: opts.force,
    priorAgentHashes: current.deployedAgentHashes,
    manifest,
    runtime,
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

  const methodPrior = {};
  for (const [key, value] of Object.entries(current.deployedHashes || {})) {
    if (key.startsWith('method:')) methodPrior[key] = value;
  }
  const methodResult = deployMethod.deployMethod(cacheDir, projectRoot, {
    force: opts.force,
    priorHashes: methodPrior,
    manifest,
    runtime,
    instanceLanding: runtimeLib.hasInstanceLanding(projectRoot),
  });
  reportDrifted('method file(s)', methodResult.drifted);

  // dsh：角色委派脚手架 + AGENTS.md 管理块（块装配在 method 之后，含 method 短规则）
  dshRoles.deployRoleToolRows(projectRoot, { manifest, cacheDir, runtime });
  const dshBlockResult = dshInstructions.deployProjectInstructions(projectRoot, {
    manifest,
    cacheDir,
    force: opts.force,
    priorHash: (current.deployedDshBlocks && current.deployedDshBlocks.projectHash) || null,
    extraSections: dshRoles.buildExtraSections({
      agentPrefix: (manifest.agents && manifest.agents.prefix) || manifest.managedPrefix,
      roles: runtimeLib.rolesForRuntime(manifest, runtime),
    }),
  });
  if (dshBlockResult.drifted) {
    console.warn('Skipped locally-modified MyRules block in AGENTS.local.md (edit .dsh/rules/ instead, or pass --force):');
    console.warn(`  ${dshBlockResult.agentsFile}`);
  }
  const userBlockBytes = ((hooksState.readUserHooksState(homeDir).deployedDshBlocks || {}).userBytes) || 0;
  const dshBudget = dshInstructions.budgetWarning(userBlockBytes, dshBlockResult.blockBytes);
  if (dshBudget) console.warn(dshBudget);

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
    deployedHashes: { ...result.hashes, ...hooksResult.deployedHashes, ...methodResult.hashes },
    deployedAgentHashes: agentsResult.hashes,
    deployedHooks: hooksResult.deployedHooks,
    deployedOpencodeInstructions: {
      project: ocConfigResult.instructions,
      user: (current.deployedOpencodeInstructions && current.deployedOpencodeInstructions.user) || [],
    },
    deployedDshBlocks: {
      projectHash: dshBlockResult.blockHash,
      userHash: (current.deployedDshBlocks && current.deployedDshBlocks.userHash) || null,
    },
    runtime,
  });
  registry.registerProject(projectRoot, homeDir, runtime);
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
      dshSkillsDir:
        manifest.platforms && manifest.platforms.includes('dsh')
          ? opts.dshSkillsDir || paths.getDshUserSkillsDir(homeDir)
          : undefined,
      update: Boolean(opts.updateSkills),
    });
    reportSkillResults(skillResults);
    if (!opts.updateSkills && skillResults.some((r) => r.reused)) {
      console.warn('Skill remotes not fetched (pass --update-skills to refresh).');
    }
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

  if (!opts.skipUserConfig) {
    const priorUserState = hooksState.readUserHooksState(homeDir);
    const priorUserInstr = (priorUserState.deployedOpencodeInstructions || {}).user || [];
    const ocUserResult = opencodeConfig.deployUserConfig(cacheDir, {
      homeDir,
      manifest,
      priorEntries: priorUserInstr,
    });
    priorUserState.deployedOpencodeInstructions = priorUserState.deployedOpencodeInstructions || {};
    priorUserState.deployedOpencodeInstructions.user = ocUserResult.instructions;
    hooksState.writeUserHooksState(homeDir, priorUserState);
  }

  if (!opts.skipUserAgentsBlock) {
    const priorUserState = hooksState.readUserHooksState(homeDir);
    const userBlockResult = dshInstructions.deployUserInstructions({
      manifest,
      cacheDir,
      homeDir,
      force: opts.force,
      priorHash: (priorUserState.deployedDshBlocks || {}).userHash || null,
    });
    if (userBlockResult.drifted) {
      console.warn('Skipped locally-modified MyRules block in ~/.dsh/AGENTS.md (edit ~/.dsh/rules/ instead, or pass --force):');
      console.warn(`  ${userBlockResult.agentsFile}`);
    }
    const userBudget = dshInstructions.budgetWarning(userBlockResult.blockBytes, 0);
    if (userBudget) console.warn(userBudget);
    priorUserState.deployedDshBlocks = {
      ...(priorUserState.deployedDshBlocks || {}),
      userHash: userBlockResult.blockHash,
      userBytes: userBlockResult.blockBytes,
    };
    hooksState.writeUserHooksState(homeDir, priorUserState);
  }

  if (opts.all) {
    for (const entry of registry.listRegisteredProjectEntries(homeDir)) {
      syncOne(cacheDir, entry.path, { ...opts, knownRuntime: entry.runtime }, manifest);
    }
  } else {
    const projectRoot = paths.getProjectRoot(opts.project);
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
