const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const state = require('../tools/sync/lib/state');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-project-'));
}

test('readState returns defaults when no state file exists', () => {
  const project = tmpProject();
  const s = state.readState(project);
  assert.strictEqual(s.schemaVersion, 1);
  assert.strictEqual(s.pruneDryRunDone, false);
  assert.strictEqual(s.cacheCommit, null);
});

test('writeState creates the file and readState reflects it', () => {
  const project = tmpProject();
  state.writeState(project, { cacheCommit: 'abc123', pruneDryRunDone: true });
  const s = state.readState(project);
  assert.strictEqual(s.cacheCommit, 'abc123');
  assert.strictEqual(s.pruneDryRunDone, true);
});

test('writeState merges with existing state instead of replacing it', () => {
  const project = tmpProject();
  state.writeState(project, { cacheCommit: 'abc123' });
  state.writeState(project, { pruneDryRunDone: true });
  const s = state.readState(project);
  assert.strictEqual(s.cacheCommit, 'abc123');
  assert.strictEqual(s.pruneDryRunDone, true);
});

test('writeState persists nested deployedHashes object', () => {
  const project = tmpProject();
  state.writeState(project, { deployedHashes: { 'a.mdc': 'hash1' } });
  const s = state.readState(project);
  assert.deepStrictEqual(s.deployedHashes, { 'a.mdc': 'hash1' });
});
