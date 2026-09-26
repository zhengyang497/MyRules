// tests/capture.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { seedCacheContent, writeRuntime } = require('./helpers/cache-seed');
const capture = require('../tools/sync/lib/capture');
const syncCli = require('../tools/sync/sync');
const installSkillCli = require('../tools/sync/install-skill');

function run(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeCache() {
  const cache = tmp('myrules-cap-cache-');
  seedCacheContent(cache);
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '# Testing\n\n- write tests');
  run(cache, ['init']);
  run(cache, ['config', 'user.email', 'test@example.com']);
  run(cache, ['config', 'user.name', 'Test']);
  run(cache, ['add', '-A']);
  run(cache, ['commit', '-m', 'init']);
  return cache;
}

function optsFor(project, cache) {
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
  };
}

function arrange(project, cache) {
  installSkillCli.run({ project, sourceDir: installSkillCli.getBundledRepoRoot() });
  writeRuntime(project, 'agent');
  syncCli.run(optsFor(project, cache)); // 首次部署，建立 state 基线
}

function readState(project) {
  return JSON.parse(fs.readFileSync(path.join(project, '.myrules-sync-state.json'), 'utf8'));
}

test('a body-edited rule copy is captured back into the cache source', () => {
  const cache = makeCache();
  const project = tmp('myrules-cap-basic-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write MORE tests'));

  const result = capture.captureHandEdits(cache, project, {
    priorHashes: readState(project).deployedHashes,
    claudeUserDir: optsFor(project, cache).claudeUserDir,
    opencodeUserDir: optsFor(project, cache).opencodeUserDir,
    dshUserDir: optsFor(project, cache).dshUserDir,
    runtime: 'agent',
    instanceLanding: false,
  });

  assert.strictEqual(result.conflicts.length, 0, JSON.stringify(result.conflicts));
  assert.strictEqual(result.captured.length, 1);
  const source = fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8');
  assert.match(source, /write MORE tests/);
});

test('capture refuses when the cache source moved on since the edit (cache-moved)', () => {
  const cache = makeCache();
  const project = tmp('myrules-cap-moved-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write MORE tests'));
  // 缓存在用户手改之后又前进（模拟另一台机器发布）
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '# Testing\n\n- cache WINS');

  const result = capture.captureHandEdits(cache, project, {
    priorHashes: readState(project).deployedHashes,
    claudeUserDir: optsFor(project, cache).claudeUserDir,
    opencodeUserDir: optsFor(project, cache).opencodeUserDir,
    dshUserDir: optsFor(project, cache).dshUserDir,
    runtime: 'agent',
    instanceLanding: false,
  });

  assert.strictEqual(result.captured.length, 0);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].reason, 'cache-moved');
  // 缓存保持新版本，项目文件保持手改
  assert.match(fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8'), /cache WINS/);
  assert.match(fs.readFileSync(deployed, 'utf8'), /write MORE tests/);
});

test('no deploy baseline means no capture (no-baseline)', () => {
  const cache = makeCache();
  const project = tmp('myrules-cap-nobase-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write MORE tests'));

  const result = capture.captureHandEdits(cache, project, {
    priorHashes: {}, // 模拟 state 丢失
    claudeUserDir: optsFor(project, cache).claudeUserDir,
    opencodeUserDir: optsFor(project, cache).opencodeUserDir,
    dshUserDir: optsFor(project, cache).dshUserDir,
    runtime: 'agent',
    instanceLanding: false,
  });

  assert.strictEqual(result.captured.length, 0);
  assert.strictEqual(result.conflicts[0].reason, 'no-baseline');
});

test('two platform copies edited differently both refuse (disagree)', () => {
  const cache = makeCache();
  const project = tmp('myrules-cap-disagree-');
  arrange(project, cache);

  const a = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  const b = path.join(project, '.dsh', 'rules', 'myrules-testing.md');
  fs.writeFileSync(a, fs.readFileSync(a, 'utf8').replace('write tests', 'write A tests'));
  fs.writeFileSync(b, fs.readFileSync(b, 'utf8').replace('write tests', 'write B tests'));

  const result = capture.captureHandEdits(cache, project, {
    priorHashes: readState(project).deployedHashes,
    claudeUserDir: optsFor(project, cache).claudeUserDir,
    opencodeUserDir: optsFor(project, cache).opencodeUserDir,
    dshUserDir: optsFor(project, cache).dshUserDir,
    runtime: 'agent',
    instanceLanding: false,
  });

  assert.strictEqual(result.captured.length, 0);
  const reasons = result.conflicts.map((c) => c.reason).sort();
  assert.deepStrictEqual(reasons, ['disagree', 'disagree']);
});

test('edits that agree across two platform copies capture once', () => {
  const cache = makeCache();
  const project = tmp('myrules-cap-agree-');
  arrange(project, cache);

  const a = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  const b = path.join(project, '.dsh', 'rules', 'myrules-testing.md');
  fs.writeFileSync(a, fs.readFileSync(a, 'utf8').replace('write tests', 'write SAME tests'));
  fs.writeFileSync(b, fs.readFileSync(b, 'utf8').replace('write tests', 'write SAME tests'));

  const result = capture.captureHandEdits(cache, project, {
    priorHashes: readState(project).deployedHashes,
    claudeUserDir: optsFor(project, cache).claudeUserDir,
    opencodeUserDir: optsFor(project, cache).opencodeUserDir,
    dshUserDir: optsFor(project, cache).dshUserDir,
    runtime: 'agent',
    instanceLanding: false,
  });

  assert.strictEqual(result.conflicts.length, 0, JSON.stringify(result.conflicts));
  assert.strictEqual(result.captured.length, 2);
  assert.match(fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8'), /write SAME tests/);
});

test('a new file inside a managed skill dir is reported as new-file, never written', () => {
  const cache = makeCache();
  const project = tmp('myrules-cap-newfile-');
  arrange(project, cache);

  const extra = path.join(project, '.cursor', 'skills', 'project-method', 'notes.md');
  fs.writeFileSync(extra, '- local notes\n');

  const result = capture.captureHandEdits(cache, project, {
    priorHashes: readState(project).deployedHashes,
    claudeUserDir: optsFor(project, cache).claudeUserDir,
    opencodeUserDir: optsFor(project, cache).opencodeUserDir,
    dshUserDir: optsFor(project, cache).dshUserDir,
    runtime: 'agent',
    instanceLanding: false,
  });

  assert.ok(result.conflicts.some((c) => c.reason === 'new-file' && c.abs === extra));
  assert.strictEqual(fs.existsSync(path.join(cache, 'method', 'skills', 'project-method', 'notes.md')), false);
});
