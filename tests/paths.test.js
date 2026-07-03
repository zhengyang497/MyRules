const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const paths = require('../tools/sync/lib/paths');

test('getCacheDir joins homeDir and .myrules', () => {
  const result = paths.getCacheDir('/home/alice');
  assert.strictEqual(result, path.join('/home/alice', '.myrules'));
});

test('getProjectRoot resolves a relative path against cwd', () => {
  const result = paths.getProjectRoot('.');
  assert.strictEqual(result, path.resolve('.'));
});

test('getCursorRulesDir joins project root and .cursor/rules', () => {
  const result = paths.getCursorRulesDir('/tmp/myproject');
  assert.strictEqual(result, path.join('/tmp/myproject', '.cursor', 'rules'));
});

test('getClaudeProjectRulesDir joins project root and .claude/rules', () => {
  const result = paths.getClaudeProjectRulesDir('/tmp/myproject');
  assert.strictEqual(result, path.join('/tmp/myproject', '.claude', 'rules'));
});

test('getClaudeUserRulesDir joins homeDir and .claude/rules', () => {
  const result = paths.getClaudeUserRulesDir('/home/alice');
  assert.strictEqual(result, path.join('/home/alice', '.claude', 'rules'));
});

test('getStateFilePath joins project root and state filename', () => {
  const result = paths.getStateFilePath('/tmp/myproject');
  assert.strictEqual(result, path.join('/tmp/myproject', '.myrules-sync-state.json'));
});

test('getRegistryFilePath joins homeDir, .myrules, and registry filename', () => {
  const result = paths.getRegistryFilePath('/home/alice');
  assert.strictEqual(result, path.join('/home/alice', '.myrules', '.registry.json'));
});

test('getCursorProjectHooksDir joins project root and .cursor/hooks', () => {
  const result = paths.getCursorProjectHooksDir('/tmp/myproject');
  assert.strictEqual(result, path.join('/tmp/myproject', '.cursor', 'hooks'));
});

test('getCursorProjectHooksConfig joins project root and .cursor/hooks.json', () => {
  const result = paths.getCursorProjectHooksConfig('/tmp/myproject');
  assert.strictEqual(result, path.join('/tmp/myproject', '.cursor', 'hooks.json'));
});

test('getCursorUserHooksDir joins homeDir and .cursor/hooks', () => {
  const result = paths.getCursorUserHooksDir('/home/alice');
  assert.strictEqual(result, path.join('/home/alice', '.cursor', 'hooks'));
});

test('getCursorUserHooksConfig joins homeDir and .cursor/hooks.json', () => {
  const result = paths.getCursorUserHooksConfig('/home/alice');
  assert.strictEqual(result, path.join('/home/alice', '.cursor', 'hooks.json'));
});

test('getUserHooksStateFilePath joins homeDir, .myrules, and the state filename', () => {
  const result = paths.getUserHooksStateFilePath('/home/alice');
  assert.strictEqual(result, path.join('/home/alice', '.myrules', '.user-hooks-state.json'));
});
