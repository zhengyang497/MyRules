const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const hooksState = require('../tools/sync/lib/hooks-state');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-state-home-'));
}

test('readUserHooksState returns defaults when no state file exists', () => {
  const home = tmpHome();
  const s = hooksState.readUserHooksState(home);
  assert.strictEqual(s.schemaVersion, 1);
  assert.deepStrictEqual(s.deployedHooks, {});
  assert.deepStrictEqual(s.deployedHashes, {});
});

test('writeUserHooksState creates the file and readUserHooksState reflects it', () => {
  const home = tmpHome();
  hooksState.writeUserHooksState(home, {
    deployedHooks: { 'session-log': { event: 'sessionEnd', command: 'node hooks/myrules-session-log.js' } },
  });
  const file = path.join(home, '.myrules', '.user-hooks-state.json');
  assert.ok(fs.existsSync(file));
  const s = hooksState.readUserHooksState(home);
  assert.deepStrictEqual(s.deployedHooks, {
    'session-log': { event: 'sessionEnd', command: 'node hooks/myrules-session-log.js' },
  });
});

test('writeUserHooksState merges with existing state instead of replacing it', () => {
  const home = tmpHome();
  hooksState.writeUserHooksState(home, { deployedHashes: { 'script:a': 'hash1' } });
  hooksState.writeUserHooksState(home, {
    deployedHooks: { b: { event: 'sessionEnd', command: 'node hooks/myrules-b.js' } },
  });
  const s = hooksState.readUserHooksState(home);
  assert.deepStrictEqual(s.deployedHashes, { 'script:a': 'hash1' });
  assert.deepStrictEqual(s.deployedHooks, { b: { event: 'sessionEnd', command: 'node hooks/myrules-b.js' } });
});
