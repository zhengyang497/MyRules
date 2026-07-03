const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const ensureCache = require('../tools/sync/lib/ensure-cache');
const { seedCacheContent } = require('./helpers/cache-seed');

function run(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeBareMyRulesRepo(root) {
  const bare = path.join(root, 'myrules.git');
  const seed = path.join(root, 'seed');
  run(root, ['init', '--bare', '-b', 'main', bare]);
  run(root, ['clone', bare, seed]);
  seedCacheContent(seed);
  fs.writeFileSync(path.join(seed, 'rules', 'user', 'preferences.md'), '# P\n');
  fs.writeFileSync(path.join(seed, 'rules', 'project', 'testing.md'), '# T\n');
  run(seed, ['config', 'user.email', 'test@example.com']);
  run(seed, ['config', 'user.name', 'Test']);
  run(seed, ['add', '-A']);
  run(seed, ['commit', '-m', 'init']);
  run(seed, ['push', '-u', 'origin', 'HEAD:main']);
  return bare;
}

test('ensureCache clones when cache dir is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-ensure-cache-'));
  const bare = makeBareMyRulesRepo(root);
  const cacheDir = path.join(root, 'fresh-cache');
  const manifest = { repo: bare };

  const result = ensureCache.ensureCache(cacheDir, manifest);

  assert.strictEqual(result.created, true);
  assert.ok(fs.existsSync(path.join(cacheDir, 'manifest.js')));
  assert.ok(fs.existsSync(path.join(cacheDir, 'skills', 'myrules', 'SKILL.md')));
});

test('ensureCache is a no-op when cache dir already exists', () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-ensure-cache-'));
  seedCacheContent(cacheDir);
  const manifest = { repo: 'https://example.invalid/should-not-clone.git' };

  const result = ensureCache.ensureCache(cacheDir, manifest);

  assert.strictEqual(result.created, false);
});
