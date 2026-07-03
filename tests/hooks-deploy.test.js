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

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const hooksDeploy = require('../tools/sync/lib/hooks-deploy');

function makeCache() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-cache-'));
  fs.mkdirSync(path.join(cache, 'hooks', 'project'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'hooks', 'user'), { recursive: true });
  fs.writeFileSync(
    path.join(cache, 'hooks', 'project', 'session-start-context.js'),
    "module.exports.meta = { event: 'sessionStart', description: 'read context' };\n" +
      'module.exports.handle = function handle() { return {}; };\n'
  );
  return cache;
}

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-project-'));
}

const fakeManifest = { claude: { hookInfix: 'hook-' } };

test('deployProjectHooks writes the Cursor script, hooks.json entry, and Claude prose file', () => {
  const cache = makeCache();
  const project = makeProject();
  const result = hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} });

  const scriptFile = path.join(project, '.cursor', 'hooks', 'myrules-session-start-context.js');
  const configFile = path.join(project, '.cursor', 'hooks.json');
  const claudeFile = path.join(project, '.claude', 'rules', 'myrules-hook-session-start-context.md');

  assert.ok(fs.existsSync(scriptFile));
  assert.ok(fs.existsSync(configFile));
  assert.ok(fs.existsSync(claudeFile));

  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.deepStrictEqual(config.hooks.sessionStart, [
    { command: 'node .cursor/hooks/myrules-session-start-context.js' },
  ]);
  assert.match(fs.readFileSync(claudeFile, 'utf8'), /read context/);
  assert.deepStrictEqual(result.deployedHooks, {
    'session-start-context': {
      event: 'sessionStart',
      command: 'node .cursor/hooks/myrules-session-start-context.js',
    },
  });
});

test('deployProjectHooks preserves foreign hooks.json entries', () => {
  const cache = makeCache();
  const project = makeProject();
  fs.mkdirSync(path.join(project, '.cursor'), { recursive: true });
  fs.writeFileSync(
    path.join(project, '.cursor', 'hooks.json'),
    JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: './format.sh' }] } }, null, 2)
  );

  hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} });

  const config = JSON.parse(fs.readFileSync(path.join(project, '.cursor', 'hooks.json'), 'utf8'));
  assert.deepStrictEqual(config.hooks.afterFileEdit, [{ command: './format.sh' }]);
});

test('deployProjectHooks removes a stale hook script, prose file, and hooks.json entry when removed from source', () => {
  const cache = makeCache();
  const project = makeProject();
  const first = hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} });

  fs.rmSync(path.join(cache, 'hooks', 'project', 'session-start-context.js'));
  const second = hooksDeploy.deployProjectHooks(cache, project, {
    manifest: fakeManifest,
    priorState: { deployedHooks: first.deployedHooks, deployedHashes: first.deployedHashes },
  });

  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'hooks', 'myrules-session-start-context.js')), false);
  assert.strictEqual(
    fs.existsSync(path.join(project, '.claude', 'rules', 'myrules-hook-session-start-context.md')),
    false
  );
  const config = JSON.parse(fs.readFileSync(path.join(project, '.cursor', 'hooks.json'), 'utf8'));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(config.hooks, 'sessionStart'), false);
  assert.deepStrictEqual(second.deployedHooks, {});
});

test('deployProjectHooks skips a hand-edited script and reports it as drifted', () => {
  const cache = makeCache();
  const project = makeProject();
  const first = hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} });

  const scriptFile = path.join(project, '.cursor', 'hooks', 'myrules-session-start-context.js');
  fs.writeFileSync(scriptFile, '// hand-edited');

  const second = hooksDeploy.deployProjectHooks(cache, project, {
    manifest: fakeManifest,
    priorState: { deployedHooks: first.deployedHooks, deployedHashes: first.deployedHashes },
  });

  assert.ok(second.drifted.includes(scriptFile));
  assert.strictEqual(fs.readFileSync(scriptFile, 'utf8'), '// hand-edited');
});

test('deployProjectHooks skips a hand-edited Claude prose file and reports it as drifted', () => {
  const cache = makeCache();
  const project = makeProject();
  const first = hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} });

  const claudeFile = path.join(project, '.claude', 'rules', 'myrules-hook-session-start-context.md');
  fs.writeFileSync(claudeFile, 'hand-edited prose');

  const second = hooksDeploy.deployProjectHooks(cache, project, {
    manifest: fakeManifest,
    priorState: { deployedHooks: first.deployedHooks, deployedHashes: first.deployedHashes },
  });

  assert.ok(second.drifted.includes(claudeFile));
  assert.strictEqual(fs.readFileSync(claudeFile, 'utf8'), 'hand-edited prose');
});

test('deployProjectHooks does nothing when no hooks are defined in source', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-empty-cache-'));
  const project = makeProject();
  const result = hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} });

  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'hooks.json')), false);
  assert.deepStrictEqual(result.deployedHooks, {});
});

test('deployProjectHooks aborts with a clear error when hooks.json is malformed', () => {
  const cache = makeCache();
  const project = makeProject();
  fs.mkdirSync(path.join(project, '.cursor'), { recursive: true });
  fs.writeFileSync(path.join(project, '.cursor', 'hooks.json'), '{ not valid json');

  const scriptFile = path.join(project, '.cursor', 'hooks', 'myrules-session-start-context.js');

  assert.throws(
    () => hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} }),
    /Failed to parse/
  );
  assert.strictEqual(fs.existsSync(scriptFile), false);
});

test('deployUserHooks writes to the given homeDir-relative Cursor and Claude locations', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-user-cache-'));
  fs.mkdirSync(path.join(cache, 'hooks', 'user'), { recursive: true });
  fs.writeFileSync(
    path.join(cache, 'hooks', 'user', 'session-log.js'),
    "module.exports.meta = { event: 'sessionEnd', description: 'log it' };\n" +
      'module.exports.handle = function handle() { return {}; };\n'
  );
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-home-'));

  const result = hooksDeploy.deployUserHooks(cache, { manifest: fakeManifest, homeDir, priorState: {} });

  const scriptFile = path.join(homeDir, '.cursor', 'hooks', 'myrules-session-log.js');
  const configFile = path.join(homeDir, '.cursor', 'hooks.json');
  const claudeFile = path.join(homeDir, '.claude', 'rules', 'myrules-hook-session-log.md');
  assert.ok(fs.existsSync(scriptFile));
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.deepStrictEqual(config.hooks.sessionEnd, [{ command: 'node hooks/myrules-session-log.js' }]);
  assert.ok(fs.existsSync(claudeFile));
  assert.deepStrictEqual(result.deployedHooks, {
    'session-log': { event: 'sessionEnd', command: 'node hooks/myrules-session-log.js' },
  });
});
