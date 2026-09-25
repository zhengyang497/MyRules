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

test('a hand-edited file stays protected on every later sync (never silently overwritten)', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'out.txt');
  const first = drift.createTracker({ force: false, priorHashes: {} });
  first.writeTracked(target, 'hello', 'out.txt');

  fs.writeFileSync(target, 'hand-edited');
  const second = drift.createTracker({ force: false, priorHashes: first.hashes });
  second.writeTracked(target, 'hello', 'out.txt');
  assert.strictEqual(second.drifted.length, 1);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'hand-edited');

  // 第三次 sync 以第二次记录的哈希为基线：旧实现在这里会静默覆盖手改
  const third = drift.createTracker({ force: false, priorHashes: second.hashes });
  third.writeTracked(target, 'hello', 'out.txt');
  assert.strictEqual(third.drifted.length, 1);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'hand-edited');
});

test('a pre-existing file never deployed before is not overwritten', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'out.txt');
  fs.writeFileSync(target, 'pre-existing user file');

  const tracker = drift.createTracker({ force: false, priorHashes: {} });
  tracker.writeTracked(target, 'hello', 'out.txt');
  assert.deepStrictEqual(tracker.drifted, [target]);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'pre-existing user file');
  // 期望哈希入账：下一次 sync 继续判 drift
  const second = drift.createTracker({ force: false, priorHashes: tracker.hashes });
  second.writeTracked(target, 'hello', 'out.txt');
  assert.deepStrictEqual(second.drifted, [target]);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'pre-existing user file');
});

test('a pre-existing file already matching the incoming content deploys cleanly', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'out.txt');
  fs.writeFileSync(target, 'hello');

  const tracker = drift.createTracker({ force: false, priorHashes: {} });
  tracker.writeTracked(target, 'hello', 'out.txt');
  assert.deepStrictEqual(tracker.drifted, []);
  assert.deepStrictEqual(tracker.written, [target]);
  assert.ok(tracker.hashes['out.txt']);
});
