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

test('every method.files source path exists in the repo', () => {
  const manifest = require('../manifest.js');
  const root = path.join(__dirname, '..');
  let checked = 0;
  for (const entry of manifest.method.files) {
    if (entry.src) {
      checked++;
      assert.ok(fs.existsSync(path.join(root, entry.src)), `missing method src: ${entry.src}`);
    }
    if (entry.srcDir) {
      checked++;
      assert.ok(fs.existsSync(path.join(root, entry.srcDir)), `missing method srcDir: ${entry.srcDir}`);
    }
  }
  assert.ok(checked > 0, 'manifest.method.files should declare sources');
});
