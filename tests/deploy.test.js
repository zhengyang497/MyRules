const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const deploy = require('../tools/sync/lib/deploy');

function makeCache() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-cache-'));
  fs.mkdirSync(path.join(cache, 'rules', 'user'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'rules', 'project'), { recursive: true });
  fs.writeFileSync(path.join(cache, 'rules', 'user', 'preferences.md'), '# Preferences\n\n- be concise');
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '# Testing\n\n- write tests');
  return cache;
}

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-deploy-project-'));
}

function fakeClaudeUserDir(project) {
  return path.join(project, '.fake-claude-home', 'rules');
}

test('deployRules writes Cursor and Claude files for user and project rules', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  const result = deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir });

  const cursorUser = path.join(project, '.cursor', 'rules', 'myrules-user-preferences.mdc');
  const cursorProject = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  const claudeUser = path.join(claudeUserDir, 'myrules-user-preferences.md');
  const claudeProject = path.join(project, '.claude', 'rules', 'myrules-testing.md');

  assert.ok(fs.existsSync(cursorUser));
  assert.ok(fs.existsSync(cursorProject));
  assert.ok(fs.existsSync(claudeUser));
  assert.ok(fs.existsSync(claudeProject));
  assert.match(fs.readFileSync(cursorUser, 'utf8'), /alwaysApply: true/);
  assert.match(fs.readFileSync(claudeProject, 'utf8'), /write tests/);
  assert.strictEqual(result.drifted.length, 0);
  assert.ok(Object.keys(result.hashes).length >= 2);
});

test('deployRules skips a target whose current content does not match the last recorded hash', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  const first = deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir });

  const cursorProjectFile = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  fs.writeFileSync(cursorProjectFile, 'hand-edited content');

  const second = deploy.deployRules(cache, project, { force: false, priorHashes: first.hashes, claudeUserDir });
  assert.ok(second.drifted.some((f) => f === cursorProjectFile));
  assert.strictEqual(fs.readFileSync(cursorProjectFile, 'utf8'), 'hand-edited content');
});

test('deployRules with force:true overwrites drifted files', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  const first = deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir });

  const cursorProjectFile = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  fs.writeFileSync(cursorProjectFile, 'hand-edited content');

  const second = deploy.deployRules(cache, project, { force: true, priorHashes: first.hashes, claudeUserDir });
  assert.strictEqual(second.drifted.length, 0);
  assert.match(fs.readFileSync(cursorProjectFile, 'utf8'), /write tests/);
});
