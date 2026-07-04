const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const installSkillCli = require('../tools/sync/install-skill');
const syncCli = require('../tools/sync/sync');
const initCli = require('../tools/sync/init');
const { seedCacheContent } = require('./helpers/cache-seed');

function run(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeCacheRepo() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-install-cache-'));
  seedCacheContent(cache);
  fs.writeFileSync(path.join(cache, 'rules', 'user', 'preferences.md'), '# Preferences\n\n- be concise');
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '# Testing\n\n- write tests');
  run(cache, ['init']);
  run(cache, ['config', 'user.email', 'test@example.com']);
  run(cache, ['config', 'user.name', 'Test']);
  run(cache, ['add', '-A']);
  run(cache, ['commit', '-m', 'init']);
  return cache;
}

function installSkill(project) {
  installSkillCli.run({
    project,
    sourceDir: installSkillCli.getBundledRepoRoot(),
  });
}

test('install-skill.run installs project skill without deploying rules', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-install-project-'));

  installSkill(project);

  assert.ok(fs.existsSync(path.join(project, '.cursor', 'skills', 'myrules', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'skills', 'myrules', 'REFERENCE.md')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'skills', 'myrules', 'COMMANDS.md')));
  assert.ok(fs.existsSync(path.join(project, '.claude', 'skills', 'myrules', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(project, '.claude', 'skills', 'myrules', 'REFERENCE.md')));
  assert.ok(fs.existsSync(path.join(project, '.claude', 'skills', 'myrules', 'COMMANDS.md')));
  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc')), false);
});

test('sync.run deploys rules when skill is already installed', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-sync-project-'));

  installSkill(project);
  syncCli.run({
    project,
    cacheDir: cache,
    skipPull: true,
    skipSkills: true,
    claudeUserDir: path.join(project, '.fake-claude-home', 'rules'),
    homeDir: path.join(project, '.fake-home'),
  });

  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc')));
});

test('sync.run refuses when project skill is missing', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-sync-no-skill-'));

  assert.throws(
    () =>
      syncCli.run({
        project,
        cacheDir: cache,
        skipPull: true,
        skipSkills: true,
        homeDir: path.join(project, '.fake-home'),
      }),
    /MyRules skill is not installed/
  );
});

test('init.js remains a backward-compatible alias for sync', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-init-alias-'));

  installSkill(project);
  initCli.run({
    project,
    cacheDir: cache,
    skipPull: true,
    skipSkills: true,
    claudeUserDir: path.join(project, '.fake-claude-home', 'rules'),
    homeDir: path.join(project, '.fake-home'),
  });

  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc')));
});
