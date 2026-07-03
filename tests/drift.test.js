const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const drift = require('../tools/sync/lib/drift');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-drift-'));
}

test('writeTracked writes a new file and records its hash', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'out.txt');
  const tracker = drift.createTracker({ force: false, priorHashes: {} });
  tracker.writeTracked(target, 'hello', 'out.txt');
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'hello');
  assert.strictEqual(tracker.written.length, 1);
  assert.strictEqual(tracker.drifted.length, 0);
  assert.ok(tracker.hashes['out.txt']);
});

test('writeTracked skips and reports a file whose content no longer matches the prior hash', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'out.txt');
  const first = drift.createTracker({ force: false, priorHashes: {} });
  first.writeTracked(target, 'hello', 'out.txt');

  fs.writeFileSync(target, 'hand-edited');
  const second = drift.createTracker({ force: false, priorHashes: first.hashes });
  second.writeTracked(target, 'hello', 'out.txt');

  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'hand-edited');
  assert.deepStrictEqual(second.drifted, [target]);
});

test('writeTracked with force:true overwrites a drifted file', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'out.txt');
  const first = drift.createTracker({ force: false, priorHashes: {} });
  first.writeTracked(target, 'hello', 'out.txt');

  fs.writeFileSync(target, 'hand-edited');
  const second = drift.createTracker({ force: true, priorHashes: first.hashes });
  second.writeTracked(target, 'hello', 'out.txt');

  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'hello');
  assert.strictEqual(second.drifted.length, 0);
});
