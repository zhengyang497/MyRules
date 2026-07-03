const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const deploy = require('../tools/sync/lib/deploy');
const exportLib = require('../tools/sync/lib/export');

function makeCache() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-cache-'));
  fs.mkdirSync(path.join(cache, 'rules', 'user'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'rules', 'project'), { recursive: true });
  fs.writeFileSync(path.join(cache, 'rules', 'user', 'preferences.md'), '# Preferences\n\n- be concise');
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '# Testing\n\n- write tests');
  return cache;
}

function fakeClaudeUserDir(project) {
  return path.join(project, '.fake-claude-home', 'rules');
}

test('exportProject reports no diffs immediately after a clean deploy', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-export-project-'));
  const claudeUserDir = fakeClaudeUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir });

  const report = exportLib.exportProject(cache, project, { claudeUserDir });
  assert.strictEqual(report.toUpdate.length, 0);
});

test('exportProject detects a hand-edited project rule and maps it to rules/project/<topic>.md', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-export-project-'));
  const claudeUserDir = fakeClaudeUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir });

  const deployedFile = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  const original = fs.readFileSync(deployedFile, 'utf8');
  fs.writeFileSync(deployedFile, original.replace('write tests', 'write MORE tests'));

  const report = exportLib.exportProject(cache, project, { claudeUserDir });
  const match = report.toUpdate.find((u) => u.deployedFile === deployedFile);
  assert.ok(match, 'expected the edited file to be reported');
  assert.strictEqual(match.sourceFile, path.join(cache, 'rules', 'project', 'testing.md'));
  assert.match(match.body, /write MORE tests/);
});

test('exportProject detects a hand-edited user rule and maps it to rules/user/<topic>.md unambiguously', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-export-project-'));
  const claudeUserDir = fakeClaudeUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir });

  const deployedFile = path.join(project, '.cursor', 'rules', 'myrules-user-preferences.mdc');
  const original = fs.readFileSync(deployedFile, 'utf8');
  fs.writeFileSync(deployedFile, original.replace('be concise', 'be VERY concise'));

  const report = exportLib.exportProject(cache, project, { claudeUserDir });
  const match = report.toUpdate.find((u) => u.deployedFile === deployedFile);
  assert.ok(match);
  assert.strictEqual(match.sourceFile, path.join(cache, 'rules', 'user', 'preferences.md'));
});
