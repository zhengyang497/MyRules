// tests/sync-hooks.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const syncCli = require('../tools/sync/sync');
const installSkillCli = require('../tools/sync/install-skill');
const state = require('../tools/sync/lib/state');
const hooksState = require('../tools/sync/lib/hooks-state');
const { seedCacheContent } = require('./helpers/cache-seed');

function run(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeCacheRepo() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-cache-'));
  seedCacheContent(cache);
  fs.writeFileSync(path.join(cache, 'rules', 'user', 'preferences.md'), '# Preferences\n\n- be concise');
  fs.writeFileSync(
    path.join(cache, 'rules', 'project', 'testing.md'),
    '---\nagents: [implementer, reviewer]\n---\n\n# Testing\n\n- write tests'
  );
  run(cache, ['init']);
  run(cache, ['config', 'user.email', 'test@example.com']);
  run(cache, ['config', 'user.name', 'Test']);
  run(cache, ['add', '-A']);
  run(cache, ['commit', '-m', 'init']);
  return cache;
}

function installSkill(project) {
  installSkillCli.run({ project, sourceDir: installSkillCli.getBundledRepoRoot() });
}

function baseOpts(project, cache, homeDir) {
  return {
    project,
    cacheDir: cache,
    dryRun: false,
    prune: false,
    force: false,
    skipPull: true,
    skipSkills: true,
    claudeUserDir: path.join(homeDir, '.claude', 'rules'),
    homeDir,
  };
}

test('sync.run deploys both project and user hooks in one call', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-project-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-home-'));
  installSkill(project);

  syncCli.run(baseOpts(project, cache, homeDir));

  assert.ok(fs.existsSync(path.join(project, '.cursor', 'hooks', 'myrules-session-start-context.js')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'hooks.json')));
  assert.ok(fs.existsSync(path.join(homeDir, '.cursor', 'hooks', 'myrules-session-log.js')));
  assert.ok(fs.existsSync(path.join(homeDir, '.cursor', 'hooks.json')));

  const s = state.readState(project);
  assert.deepStrictEqual(Object.keys(s.deployedHooks), ['session-start-context']);

  const hs = hooksState.readUserHooksState(homeDir);
  assert.deepStrictEqual(Object.keys(hs.deployedHooks), ['session-log']);
});

test('sync.run --all deploys user hooks once but project hooks into every registered project', () => {
  const cache = makeCacheRepo();
  const projectA = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-a-'));
  const projectB = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-b-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-home-'));
  installSkill(projectA);
  installSkill(projectB);
  syncCli.run(baseOpts(projectA, cache, homeDir));
  syncCli.run(baseOpts(projectB, cache, homeDir));

  syncCli.run({ ...baseOpts(projectA, cache, homeDir), all: true });

  assert.ok(fs.existsSync(path.join(projectA, '.cursor', 'hooks', 'myrules-session-start-context.js')));
  assert.ok(fs.existsSync(path.join(projectB, '.cursor', 'hooks', 'myrules-session-start-context.js')));
  assert.ok(fs.existsSync(path.join(homeDir, '.cursor', 'hooks', 'myrules-session-log.js')));
});

test('sync.run second run reports no drift for untouched hook files', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-project-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-home-'));
  installSkill(project);

  syncCli.run(baseOpts(project, cache, homeDir));
  syncCli.run(baseOpts(project, cache, homeDir));

  const s = state.readState(project);
  assert.deepStrictEqual(Object.keys(s.deployedHooks), ['session-start-context']);
});

test('status.run reports project and user hook counts', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-project-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-home-'));
  installSkill(project);
  syncCli.run(baseOpts(project, cache, homeDir));

  const statusCli = require('../tools/sync/status');
  const result = statusCli.run({ project, cacheDir: cache, homeDir });
  assert.strictEqual(result.projectHooksDeployed, 1);
  assert.strictEqual(result.userHooksDeployed, 1);
});
