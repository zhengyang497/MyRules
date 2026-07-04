// tests/session-log-hook.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const hook = require('../hooks/user/session-log');

test('meta declares the sessionEnd event and a description', () => {
  assert.strictEqual(hook.meta.event, 'sessionEnd');
  assert.ok(hook.meta.description.length > 0);
});

test('handle appends a summary line to <homeDir>/myrules-activity-log.md', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hook-home-'));
  const result = hook.handle(
    { workspace_roots: ['/some/project-name'], duration_ms: 1234, reason: 'completed' },
    { homeDir: fakeHome }
  );
  assert.deepStrictEqual(result, {});
  const logContent = fs.readFileSync(path.join(fakeHome, 'myrules-activity-log.md'), 'utf8');
  assert.match(logContent, /project-name/);
  assert.match(logContent, /1234ms/);
  assert.match(logContent, /completed/);
});

test('handle appends a second line without overwriting the first', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hook-home-'));
  hook.handle({ workspace_roots: ['/a'], duration_ms: 1, reason: 'completed' }, { homeDir: fakeHome });
  hook.handle({ workspace_roots: ['/b'], duration_ms: 2, reason: 'aborted' }, { homeDir: fakeHome });
  const lines = fs
    .readFileSync(path.join(fakeHome, 'myrules-activity-log.md'), 'utf8')
    .trim()
    .split('\n');
  assert.strictEqual(lines.length, 2);
});

test('handle falls back to os.homedir() when no homeDir override is given', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hook-home-'));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
  try {
    const result = hook.handle({ workspace_roots: ['/x'], duration_ms: 1, reason: 'completed' });
    assert.deepStrictEqual(result, {});
    const logContent = fs.readFileSync(path.join(fakeHome, 'myrules-activity-log.md'), 'utf8');
    assert.match(logContent, /completed/);
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
  }
});

test('running the file directly via stdin/stdout accepts UTF-8 BOM-prefixed JSON from Cursor', () => {
  const { execFileSync } = require('node:child_process');
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hook-home-'));
  const hookPath = path.join(__dirname, '..', 'hooks', 'user', 'session-log.js');
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
  try {
    execFileSync('node', [hookPath], {
      input: '\uFEFF' + JSON.stringify({
        workspace_roots: ['C:\\Users\\test\\empty-window'],
        duration_ms: 5678,
        reason: 'completed',
      }),
      encoding: 'utf8',
    });
    const logContent = fs.readFileSync(path.join(fakeHome, 'myrules-activity-log.md'), 'utf8');
    assert.match(logContent, /empty-window/);
    assert.match(logContent, /5678ms/);
    assert.match(logContent, /completed/);
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
  }
});
