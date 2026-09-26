// tests/capture-sync.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { seedCacheContent, writeRuntime } = require('./helpers/cache-seed');
const syncCli = require('../tools/sync/sync');
const pushCli = require('../tools/sync/push');
const installSkillCli = require('../tools/sync/install-skill');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeCacheRepo() {
  const cache = tmp('myrules-capsync-cache-');
  seedCacheContent(cache);
  // Task 3 已批准的 fixture 修正（同一种子缺陷）：deployed 副本必须含 'write tests' 手改锚点
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '# Testing\n\n- write tests');
  execFileSync('git', ['init'], { cwd: cache, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: cache, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: cache, stdio: 'ignore' });
  execFileSync('git', ['add', '-A'], { cwd: cache, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: cache, stdio: 'ignore' });
  return cache;
}

function syncOpts(project, cache, extra = {}) {
  return {
    project,
    cacheDir: cache,
    skipPull: true,
    skipSkills: true,
    skipUserConfig: true,
    skipEnsureCache: true,
    claudeUserDir: path.join(project, '.fake-claude-home', 'rules'),
    opencodeUserDir: path.join(project, '.fake-opencode-home', 'rules'),
    homeDir: path.join(project, '.fake-home'),
    dshUserDir: path.join(project, '.fake-home', '.dsh', 'rules'),
    ...extra,
  };
}

function arrange(project, cache) {
  installSkillCli.run({ project, sourceDir: installSkillCli.getBundledRepoRoot() });
  writeRuntime(project, 'agent');
  syncCli.run(syncOpts(project, cache));
}

test('end-to-end: hand edit is captured on sync, converges all copies, push publishes', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-capsync-e2e-');
  arrange(project, cache);

  const deployed = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write E2E tests'));

  syncCli.run(syncOpts(project, cache)); // 捕获 + 部署收敛

  const source = fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8');
  assert.match(source, /write E2E tests/);
  for (const rel of ['.cursor/rules/myrules-testing.mdc', '.claude/rules/myrules-testing.md', '.dsh/rules/myrules-testing.md']) {
    assert.match(fs.readFileSync(path.join(project, rel), 'utf8'), /write E2E tests/);
  }
  // 捕获让缓存 dirty；push 后干净
  execFileSync('git', ['status', '--porcelain'], { cwd: cache, stdio: 'ignore' });
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: cache, encoding: 'utf8' }).trim();
  assert.ok(dirty.length > 0, 'cache must be dirty after capture');
  pushCli.run({ cacheDir: cache, message: 'publish capture' });
  const clean = execFileSync('git', ['status', '--porcelain'], { cwd: cache, encoding: 'utf8' }).trim();
  assert.strictEqual(clean, '');

  syncCli.run(syncOpts(project, cache)); // 幂等：无捕获、无漂移
  const s = JSON.parse(fs.readFileSync(path.join(project, '.myrules-sync-state.json'), 'utf8'));
  assert.ok(Object.keys(s.deployedHashes).length > 0);
});

test('sync refuses to run while captured edits are unpublished (gate)', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-capsync-gate-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write GATE tests'));
  syncCli.run(syncOpts(project, cache)); // 捕获 → cache dirty

  assert.throws(
    () => syncCli.run(syncOpts(project, cache, { skipPull: false })),
    /uncommitted changes/
  );
  pushCli.run({ cacheDir: cache, message: 'publish' });
  // 控制器裁定：fixture 缓存无 remote，skipPull:false 会在 git pull --ff-only 处失败；
  // 放行断言用默认 sync opts（skipPull: true），dirty-throw 仍走真实闸门路径。
  assert.doesNotThrow(() => syncCli.run(syncOpts(project, cache)));
});

test('--no-capture keeps the edit local and leaves the cache untouched', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-capsync-nocap-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write LOCAL tests'));

  syncCli.run(syncOpts(project, cache, { noCapture: true }));
  assert.ok(!fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8').includes('write LOCAL tests'));
  assert.match(fs.readFileSync(deployed, 'utf8'), /write LOCAL tests/);
});

test('--force discards the edit without capturing it', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-capsync-force-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write FORCED tests'));

  syncCli.run(syncOpts(project, cache, { force: true }));
  assert.ok(!fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8').includes('write FORCED tests'));
  assert.ok(!fs.readFileSync(deployed, 'utf8').includes('write FORCED tests'), 'force overwrites local edits');
});

test('two projects: first capture wins, second gets a cache-moved conflict (no ping-pong)', () => {
  const cache = makeCacheRepo();
  const projectA = tmp('myrules-capsync-pa-');
  const projectB = tmp('myrules-capsync-pb-');
  arrange(projectA, cache);
  arrange(projectB, cache);

  const b = path.join(projectB, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(b, fs.readFileSync(b, 'utf8').replace('write tests', 'write B tests'));
  const a = path.join(projectA, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(a, fs.readFileSync(a, 'utf8').replace('write tests', 'write A tests'));

  syncCli.run(syncOpts(projectA, cache)); // A 先捕获
  assert.match(fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8'), /write A tests/);

  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  try {
    syncCli.run(syncOpts(projectB, cache)); // B 的手改基于旧缓存 → 冲突，保留
  } finally {
    console.warn = origWarn;
  }
  assert.match(fs.readFileSync(b, 'utf8'), /write B tests/);
  assert.match(warns.join('\n'), /cache-moved|冲突|not captured/i);
});
