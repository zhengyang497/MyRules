// tests/capture-sync.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { seedCacheContent, writeRuntime } = require('./helpers/cache-seed');
const fsutil = require('../tools/sync/lib/fsutil');
const syncCli = require('../tools/sync/sync');
const pushCli = require('../tools/sync/push');
const installSkillCli = require('../tools/sync/install-skill');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// 捕获一次运行的全部用户可见输出（console.log + console.warn），用于断言输出档位
function captureOutput(fn) {
  const out = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...args) => out.push(args.join(' '));
  console.warn = (...args) => out.push(args.join(' '));
  try {
    fn();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
  return out.join('\n');
}

// state.deployedHashes 的 key → 磁盘文件绝对路径（F4 幂等断言用：逐键核对哈希）
function deployedFileFor(project, key, o, manifest) {
  if (key.startsWith('method:')) return path.join(project, key.slice('method:'.length));
  if (key.startsWith('~claude-user~/')) return path.join(o.claudeUserDir, key.slice('~claude-user~/'.length));
  if (key.startsWith('~opencode-user~/')) return path.join(o.opencodeUserDir, key.slice('~opencode-user~/'.length));
  if (key.startsWith('~dsh-user~/')) return path.join(o.dshUserDir, key.slice('~dsh-user~/'.length));
  if (key.startsWith('script:')) return path.join(project, '.cursor', 'hooks', `myrules-${key.slice('script:'.length)}.js`);
  if (key.startsWith('claude:')) {
    return path.join(project, '.claude', 'rules', `myrules-${manifest.claude.hookInfix}${key.slice('claude:'.length)}.md`);
  }
  if (key.startsWith('dsh:')) {
    return path.join(project, '.dsh', 'rules', `myrules-${manifest.claude.hookInfix}${key.slice('dsh:'.length)}.md`);
  }
  return path.join(project, key); // .cursor/rules/… 等项目内相对路径
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
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: cache, encoding: 'utf8' }).trim();
  assert.ok(dirty.length > 0, 'cache must be dirty after capture');
  pushCli.run({ cacheDir: cache, message: 'publish capture' });
  const clean = execFileSync('git', ['status', '--porcelain'], { cwd: cache, encoding: 'utf8' }).trim();
  assert.strictEqual(clean, '');

  // F4：幂等直接断言（F1/F3 回归的金丝雀）——无改动的第二次 sync 必须：
  // (i) 零捕获/零漂移输出；(ii) deployedHashes 逐键等于磁盘内容哈希；(iii) 无新提交、工作区干净
  const headBefore = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: cache, encoding: 'utf8' });
  const out = captureOutput(() => syncCli.run(syncOpts(project, cache)));
  assert.doesNotMatch(out, /Captured|NOT captured|locally-modified/, `second sync must be silent, got:\n${out}`);

  const s = JSON.parse(fs.readFileSync(path.join(project, '.myrules-sync-state.json'), 'utf8'));
  const keys = Object.keys(s.deployedHashes);
  assert.ok(keys.length > 0);
  const o = syncOpts(project, cache);
  const manifest = require(path.join(cache, 'manifest.js'));
  for (const key of keys) {
    const file = deployedFileFor(project, key, o, manifest);
    assert.ok(fs.existsSync(file), `state key ${key} has no disk file (${file})`);
    assert.strictEqual(s.deployedHashes[key], fsutil.hashContent(fs.readFileSync(file, 'utf8')), `stale hash for ${key}`);
  }

  const headAfter = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: cache, encoding: 'utf8' });
  assert.strictEqual(headAfter, headBefore, 'second sync must not create a cache commit');
  const cleanAfter = execFileSync('git', ['status', '--porcelain'], { cwd: cache, encoding: 'utf8' }).trim();
  assert.strictEqual(cleanAfter, '', 'second sync must leave the cache clean');
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

  const out = captureOutput(() => syncCli.run(syncOpts(project, cache, { noCapture: true })));
  // REFERENCE 承诺：--no-capture "keeps edits local (warn only)"
  assert.match(out, /locally-modified file\(s\)/, 'no-capture must still warn (drift tier)');
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

test('two projects: first capture wins, second refuses on every later sync (no ping-pong)', () => {
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
  const srcAfterA = fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8');
  assert.match(srcAfterA, /write A tests/);

  const outB = captureOutput(() => syncCli.run(syncOpts(projectB, cache))); // B 的手改基于旧缓存 → 冲突，保留
  assert.match(fs.readFileSync(b, 'utf8'), /write B tests/);
  assert.match(outB, /NOT captured/);
  // 钉死实际 reason：文案必须是 cache-moved，而不是被任意 reason 满足的宽松匹配
  assert.match(outB, /cache source changed since your edit/);

  // F1（交替双往返）：B 再 sync 一次必须继续拒绝，绝不把过期手改捕获进 A 已推进的缓存
  const outB2 = captureOutput(() => syncCli.run(syncOpts(projectB, cache)));
  assert.doesNotMatch(outB2, /Captured \d+ hand edit/, `second B sync must not capture, got:\n${outB2}`);
  assert.match(outB2, /cache source changed since your edit/);
  assert.strictEqual(fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8'), srcAfterA);
  assert.match(fs.readFileSync(b, 'utf8'), /write B tests/);
});

test('F1: cache-moved conflict refuses again on every later sync (cache source byte-identical)', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-capsync-f1moved-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write HAND tests'));
  // 另一台机器先推进缓存（用户手改之后）
  const moved = '# Testing\n\n- cache WINS moved elsewhere';
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), moved);

  const out1 = captureOutput(() => syncCli.run(syncOpts(project, cache)));
  assert.match(out1, /NOT captured/);
  assert.match(out1, /cache source changed since your edit/);
  assert.doesNotMatch(out1, /Captured \d+ hand edit/);
  assert.strictEqual(fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8'), moved);

  // 第二次 sync（无任何改动）：拒绝必须持续，缓存源逐字节不变
  const out2 = captureOutput(() => syncCli.run(syncOpts(project, cache)));
  assert.match(out2, /NOT captured/);
  assert.match(out2, /cache source changed since your edit/);
  assert.doesNotMatch(out2, /Captured \d+ hand edit/, `second sync must not capture, got:\n${out2}`);
  assert.strictEqual(fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8'), moved);
  assert.match(fs.readFileSync(deployed, 'utf8'), /write HAND tests/);
});

test('F1: no-baseline conflict refuses again on every later sync', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-capsync-f1nobs-');
  arrange(project, cache);

  // 模拟 state 整体丢失（deployedHashes 与 captureBaselines 一起没了）
  fs.unlinkSync(path.join(project, '.myrules-sync-state.json'));
  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write ORPHAN tests'));

  const srcPath = path.join(cache, 'rules', 'project', 'testing.md');
  const before = fs.readFileSync(srcPath, 'utf8');

  const out1 = captureOutput(() => syncCli.run(syncOpts(project, cache)));
  assert.match(out1, /NOT captured/);
  assert.match(out1, /no deploy baseline in sync state/);
  assert.doesNotMatch(out1, /Captured \d+ hand edit/);

  const out2 = captureOutput(() => syncCli.run(syncOpts(project, cache)));
  assert.match(out2, /NOT captured/);
  assert.match(out2, /no deploy baseline in sync state/);
  assert.doesNotMatch(out2, /Captured \d+ hand edit/, `second sync must not capture, got:\n${out2}`);
  assert.strictEqual(fs.readFileSync(srcPath, 'utf8'), before);
  assert.match(fs.readFileSync(deployed, 'utf8'), /write ORPHAN tests/);
});

test('F2: cache-moved conflict appears only in the conflict tier, not again as drift', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-capsync-f2-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write HAND tests'));
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '# Testing\n\n- cache WINS');

  const out = captureOutput(() => syncCli.run(syncOpts(project, cache)));
  // 冲突档：NOT captured 一行给出单一、自洽的建议
  assert.match(out, /NOT captured/);
  assert.match(out, /\.claude\/rules\/myrules-testing\.md -> cache source changed since your edit/);
  // 同一文件不得再出现在 drift/skip 档（否则会给出互相矛盾的 export --force 建议）
  assert.doesNotMatch(out, /locally-modified file\(s\)/, `drift tier must not repeat the conflict file, got:\n${out}`);
  assert.doesNotMatch(out, /myrules-testing\.md -> (reversible|export|no export)/, `no drift advice line for the conflict file, got:\n${out}`);
  // skip 行为本身保留：文件未被覆盖
  assert.match(fs.readFileSync(deployed, 'utf8'), /write HAND tests/);
});

test('F5/REFERENCE mirror: frontmatter edits are refused and reported every sync (header-edit)', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-capsync-f5head-');
  arrange(project, cache);

  const mdc = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  fs.writeFileSync(mdc, fs.readFileSync(mdc, 'utf8').replace('alwaysApply: true', 'alwaysApply: false'));

  const srcPath = path.join(cache, 'rules', 'project', 'testing.md');
  const before = fs.readFileSync(srcPath, 'utf8');

  // REFERENCE 承诺：frontmatter 改动 "refused and reported, never applied" / "reported every sync"
  const out1 = captureOutput(() => syncCli.run(syncOpts(project, cache)));
  assert.match(out1, /NOT captured/);
  assert.match(out1, /frontmatter changed/);
  assert.doesNotMatch(out1, /Captured \d+ hand edit/);

  const out2 = captureOutput(() => syncCli.run(syncOpts(project, cache)));
  assert.match(out2, /NOT captured/);
  assert.match(out2, /frontmatter changed/);
  assert.doesNotMatch(out2, /Captured \d+ hand edit/, `second sync must not capture, got:\n${out2}`);
  assert.strictEqual(fs.readFileSync(srcPath, 'utf8'), before, 'cache source must stay untouched');
});

test('F3: blank line after generated header captures once, then syncs stay byte-stable', () => {
  const cache = makeCacheRepo();
  // 规则源带 frontmatter：触发 emitted/backfill 前缀不变式的 trimStart 缺陷
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '---\nagents: [implementer]\n---\n\n# Testing\n\n- write tests');
  const project = tmp('myrules-capsync-f3-');
  arrange(project, cache);

  const mdc = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  fs.writeFileSync(mdc, fs.readFileSync(mdc, 'utf8').replace('---\n\n', '---\n\n\n')); // 生成头后插入空行

  const out1 = captureOutput(() => syncCli.run(syncOpts(project, cache)));
  assert.match(out1, /Captured 1 hand edit/);
  assert.doesNotMatch(out1, /locally-modified file\(s\)/, `sync 1 must not drift, got:\n${out1}`);

  const srcPath = path.join(cache, 'rules', 'project', 'testing.md');
  assert.strictEqual(
    fs.readFileSync(srcPath, 'utf8'),
    '---\nagents: [implementer]\n---\n\n\n# Testing\n\n- write tests',
    'captured source must preserve frontmatter bytes and the inserted blank line'
  );

  // 后续无改动 sync：无捕获输出、无漂移输出、缓存源逐字节稳定（幂等）
  const before = fs.readFileSync(srcPath, 'utf8');
  const out2 = captureOutput(() => syncCli.run(syncOpts(project, cache)));
  assert.doesNotMatch(out2, /Captured \d+ hand edit/, `sync 2 must not capture again, got:\n${out2}`);
  assert.doesNotMatch(out2, /NOT captured/, `sync 2 must not conflict, got:\n${out2}`);
  assert.doesNotMatch(out2, /locally-modified file\(s\)/, `sync 2 must not drift, got:\n${out2}`);
  assert.strictEqual(fs.readFileSync(srcPath, 'utf8'), before, 'cache source must be byte-stable across syncs');
});
