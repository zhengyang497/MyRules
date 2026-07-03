const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const loadManifest = require('../tools/sync/lib/load-manifest');

test('loadManifest reads manifest.js from cache dir when present', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-manifest-'));
  fs.writeFileSync(
    path.join(cache, 'manifest.js'),
    'module.exports = { managedPrefix: "custom-", repo: "https://example.com/repo.git" };\n'
  );
  const manifest = loadManifest.loadManifest(cache);
  assert.strictEqual(manifest.managedPrefix, 'custom-');
  assert.strictEqual(manifest.repo, 'https://example.com/repo.git');
});

test('loadManifest falls back to bundled manifest when cache has no manifest.js', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-manifest-'));
  const manifest = loadManifest.loadManifest(cache);
  assert.strictEqual(manifest.managedPrefix, 'myrules-');
  assert.match(manifest.repo, /MyRules/);
});
