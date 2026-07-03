const { test } = require('node:test');
const assert = require('node:assert');
const { mergeHooksJson } = require('../tools/sync/lib/hooks-deploy');

test('mergeHooksJson creates a fresh doc when none exists', () => {
  const result = mergeHooksJson(null, {}, [{ event: 'sessionStart', command: 'node .cursor/hooks/myrules-a.js' }]);
  assert.strictEqual(result.version, 1);
  assert.deepStrictEqual(result.hooks.sessionStart, [{ command: 'node .cursor/hooks/myrules-a.js' }]);
});

test('mergeHooksJson preserves foreign entries on events MyRules does not manage', () => {
  const existing = { version: 1, hooks: { afterFileEdit: [{ command: './format.sh' }] } };
  const result = mergeHooksJson(existing, {}, [{ event: 'sessionStart', command: 'node .cursor/hooks/myrules-a.js' }]);
  assert.deepStrictEqual(result.hooks.afterFileEdit, [{ command: './format.sh' }]);
  assert.deepStrictEqual(result.hooks.sessionStart, [{ command: 'node .cursor/hooks/myrules-a.js' }]);
});

test('mergeHooksJson preserves a foreign entry on a MyRules-managed event via exact-match removal', () => {
  const existing = {
    version: 1,
    hooks: {
      sessionStart: [{ command: './my-own-script.sh' }, { command: 'node .cursor/hooks/myrules-old.js' }],
    },
  };
  const previous = { sessionStart: ['node .cursor/hooks/myrules-old.js'] };
  const result = mergeHooksJson(existing, previous, [
    { event: 'sessionStart', command: 'node .cursor/hooks/myrules-a.js' },
  ]);
  assert.deepStrictEqual(result.hooks.sessionStart, [
    { command: './my-own-script.sh' },
    { command: 'node .cursor/hooks/myrules-a.js' },
  ]);
});

test('mergeHooksJson falls back to a myrules- substring filter when no prior record exists for that event', () => {
  const existing = {
    version: 1,
    hooks: { sessionStart: [{ command: 'node .cursor/hooks/myrules-leftover.js' }, { command: './keep-me.sh' }] },
  };
  const result = mergeHooksJson(existing, {}, [{ event: 'sessionStart', command: 'node .cursor/hooks/myrules-a.js' }]);
  assert.deepStrictEqual(result.hooks.sessionStart, [
    { command: './keep-me.sh' },
    { command: 'node .cursor/hooks/myrules-a.js' },
  ]);
});

test('mergeHooksJson removes an event key entirely when its array becomes empty', () => {
  const existing = { version: 1, hooks: { sessionEnd: [{ command: 'node .cursor/hooks/myrules-old.js' }] } };
  const previous = { sessionEnd: ['node .cursor/hooks/myrules-old.js'] };
  const result = mergeHooksJson(existing, previous, []);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result.hooks, 'sessionEnd'), false);
});

test('mergeHooksJson preserves an existing non-default version number', () => {
  const existing = { version: 2, hooks: {} };
  const result = mergeHooksJson(existing, {}, []);
  assert.strictEqual(result.version, 2);
});

test('mergeHooksJson includes optional matcher/timeout/failClosed only when set', () => {
  const result = mergeHooksJson(null, {}, [
    { event: 'beforeShellExecution', command: 'node .cursor/hooks/myrules-a.js', matcher: 'curl' },
  ]);
  assert.deepStrictEqual(result.hooks.beforeShellExecution, [
    { command: 'node .cursor/hooks/myrules-a.js', matcher: 'curl' },
  ]);
});

test('mergeHooksJson appends multiple currentHooks for the same event', () => {
  const result = mergeHooksJson(null, {}, [
    { event: 'sessionStart', command: 'node .cursor/hooks/myrules-a.js' },
    { event: 'sessionStart', command: 'node .cursor/hooks/myrules-b.js' },
  ]);
  assert.deepStrictEqual(result.hooks.sessionStart, [
    { command: 'node .cursor/hooks/myrules-a.js' },
    { command: 'node .cursor/hooks/myrules-b.js' },
  ]);
});
