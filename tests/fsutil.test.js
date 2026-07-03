const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const fsutil = require('../tools/sync/lib/fsutil');

test('ensureDir creates nested directories', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-'));
  const nested = path.join(tmp, 'a', 'b', 'c');
  fsutil.ensureDir(nested);
  assert.ok(fs.existsSync(nested));
});

test('listFilesWithExt returns only matching files, sorted', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-'));
  fs.writeFileSync(path.join(tmp, 'b.md'), 'b');
  fs.writeFileSync(path.join(tmp, 'a.md'), 'a');
  fs.writeFileSync(path.join(tmp, 'c.txt'), 'c');
  const result = fsutil.listFilesWithExt(tmp, '.md');
  assert.deepStrictEqual(result, [path.join(tmp, 'a.md'), path.join(tmp, 'b.md')]);
});

test('listFilesWithExt returns empty array for missing directory', () => {
  const result = fsutil.listFilesWithExt('/nonexistent/dir', '.md');
  assert.deepStrictEqual(result, []);
});

test('hashContent is stable and detects changes', () => {
  const h1 = fsutil.hashContent('hello');
  const h2 = fsutil.hashContent('hello');
  const h3 = fsutil.hashContent('world');
  assert.strictEqual(h1, h2);
  assert.notStrictEqual(h1, h3);
});
