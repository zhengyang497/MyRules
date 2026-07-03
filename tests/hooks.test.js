const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const hooks = require('../tools/sync/lib/hooks');

function tmpHooksDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-src-'));
}

test('loadHookSources returns an empty array for a missing directory', () => {
  const missing = path.join(os.tmpdir(), 'myrules-hooks-does-not-exist-' + Date.now());
  assert.deepStrictEqual(hooks.loadHookSources(missing), []);
});

test('loadHookSources loads meta and handle from each .js file', () => {
  const dir = tmpHooksDir();
  fs.writeFileSync(
    path.join(dir, 'example.js'),
    "module.exports.meta = { event: 'sessionStart', description: 'test hook' };\n" +
      'module.exports.handle = function handle(input) { return {}; };\n'
  );
  const result = hooks.loadHookSources(dir);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].name, 'example');
  assert.strictEqual(result[0].meta.event, 'sessionStart');
  assert.strictEqual(typeof result[0].handle, 'function');
});

test('loadHookSources throws a clear error when meta.event is missing', () => {
  const dir = tmpHooksDir();
  fs.writeFileSync(
    path.join(dir, 'broken.js'),
    "module.exports.meta = { description: 'missing event' };\n" +
      'module.exports.handle = function handle() { return {}; };\n'
  );
  assert.throws(() => hooks.loadHookSources(dir), /meta\.event/);
});

test('loadHookSources throws a clear error when meta.description is missing', () => {
  const dir = tmpHooksDir();
  fs.writeFileSync(
    path.join(dir, 'broken.js'),
    "module.exports.meta = { event: 'sessionStart' };\n" +
      'module.exports.handle = function handle() { return {}; };\n'
  );
  assert.throws(() => hooks.loadHookSources(dir), /meta\.description/);
});

test('loadHookSources throws a clear error when handle is missing', () => {
  const dir = tmpHooksDir();
  fs.writeFileSync(
    path.join(dir, 'broken.js'),
    "module.exports.meta = { event: 'sessionStart', description: 'x' };\n"
  );
  assert.throws(() => hooks.loadHookSources(dir), /handle/);
});
