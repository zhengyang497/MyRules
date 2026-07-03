const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const syncCli = require('../tools/sync/sync');
const state = require('../tools/sync/lib/state');
const { seedCacheContent } = require('./helpers/cache-seed');

function run(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}


function makeCacheRepo() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-cache-'));
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

function baseOpts(project, cache) {
  return {
    project,
    cacheDir: cache,
    dryRun: false,
    prune: false,
    force: false,
    skipPull: true,
    skipSkills: true,
    claudeUserDir: path.join(project, '.fake-claude-home', 'rules'),
    homeDir: path.join(project, '.fake-home'),
  };
}

test('sync.run deploys rules and writes sync state with the cache commit', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-sync-project-'));

  syncCli.run(baseOpts(project, cache));

  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc')));
  const s = state.readState(project);
  assert.ok(s.cacheCommit);
  assert.ok(s.lastSyncAt);
});

test('sync.run --dry-run --prune-legacy-rules records a fingerprint without writing files', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-sync-project-'));
  fs.mkdirSync(path.join(project, '.cursor', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(project, '.cursor', 'rules', 'old.mdc'), 'legacy');

  syncCli.run({ ...baseOpts(project, cache), dryRun: true, prune: true });

  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc')), false);
  const s = state.readState(project);
  assert.strictEqual(s.pruneDryRunDone, true);
  assert.ok(s.legacyRulesFingerprint);
});

test('sync.run --prune-legacy-rules refuses without a matching prior dry-run', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-sync-project-'));
  fs.mkdirSync(path.join(project, '.cursor', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(project, '.cursor', 'rules', 'old.mdc'), 'legacy');

  assert.throws(() => {
    syncCli.run({ ...baseOpts(project, cache), prune: true });
  }, /dry-run/);
});

test('sync.run --prune-legacy-rules archives legacy files after a matching dry-run', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-sync-project-'));
  fs.mkdirSync(path.join(project, '.cursor', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(project, '.cursor', 'rules', 'old.mdc'), 'legacy');

  syncCli.run({ ...baseOpts(project, cache), dryRun: true, prune: true });
  syncCli.run({ ...baseOpts(project, cache), prune: true });

  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'rules', 'old.mdc')), false);
  const backupDir = path.join(project, '.myrules-backup');
  assert.ok(fs.existsSync(backupDir));
});

test('status.run reports cache dirty state and current sync state together', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-sync-project-'));
  syncCli.run(baseOpts(project, cache));

  const statusCli = require('../tools/sync/status');
  const result = statusCli.run({ project, cacheDir: cache });
  assert.strictEqual(result.cacheDirty, false);
  assert.ok(result.cacheCommit);

  fs.writeFileSync(path.join(cache, 'rules', 'project', 'new.md'), '# New');
  const dirtyResult = statusCli.run({ project, cacheDir: cache });
  assert.strictEqual(dirtyResult.cacheDirty, true);
});

test('push.run reports committed:false when the cache has no changes', () => {
  const cache = makeCacheRepo();
  const pushCli = require('../tools/sync/push');
  const result = pushCli.run({ cacheDir: cache, message: 'no-op' });
  assert.strictEqual(result.committed, false);
});
