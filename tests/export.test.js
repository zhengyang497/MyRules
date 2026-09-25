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

function fakeOpencodeUserDir(project) {
  return path.join(project, '.fake-opencode-home', 'rules');
}

function fakeDshUserDir(project) {
  return path.join(project, '.fake-dsh-home', 'rules');
}

test('exportProject reports no diffs immediately after a clean deploy', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-export-project-'));
  const claudeUserDir = fakeClaudeUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project), dshUserDir: fakeDshUserDir(project) });

  const report = exportLib.exportProject(cache, project, { claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project), dshUserDir: fakeDshUserDir(project) });
  assert.strictEqual(report.toUpdate.length, 0);
});

test('exportProject detects a hand-edited project rule and maps it to rules/project/<topic>.md', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-export-project-'));
  const claudeUserDir = fakeClaudeUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project), dshUserDir: fakeDshUserDir(project) });

  const deployedFile = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  const original = fs.readFileSync(deployedFile, 'utf8');
  fs.writeFileSync(deployedFile, original.replace('write tests', 'write MORE tests'));

  const report = exportLib.exportProject(cache, project, { claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project), dshUserDir: fakeDshUserDir(project) });
  const match = report.toUpdate.find((u) => u.deployedFile === deployedFile);
  assert.ok(match, 'expected the edited file to be reported');
  assert.strictEqual(match.sourceFile, path.join(cache, 'rules', 'project', 'testing.md'));
  assert.match(match.body, /write MORE tests/);
});

test('exportProject detects a hand-edited user rule and maps it to rules/user/<topic>.md unambiguously', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-export-project-'));
  const claudeUserDir = fakeClaudeUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project), dshUserDir: fakeDshUserDir(project) });

  const deployedFile = path.join(project, '.cursor', 'rules', 'myrules-user-preferences.mdc');
  const original = fs.readFileSync(deployedFile, 'utf8');
  fs.writeFileSync(deployedFile, original.replace('be concise', 'be VERY concise'));

  const report = exportLib.exportProject(cache, project, { claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project), dshUserDir: fakeDshUserDir(project) });
  const match = report.toUpdate.find((u) => u.deployedFile === deployedFile);
  assert.ok(match);
  assert.strictEqual(match.sourceFile, path.join(cache, 'rules', 'user', 'preferences.md'));
});

test('exportProject compares project sources without frontmatter against deployed rules', () => {
  const cache = makeCache();
  fs.writeFileSync(
    path.join(cache, 'rules', 'project', 'testing.md'),
    '---\nagents: [implementer]\n---\n\n# Testing\n\n- write tests'
  );
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-export-frontmatter-'));
  const claudeUserDir = fakeClaudeUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project), dshUserDir: fakeDshUserDir(project) });

  const report = exportLib.exportProject(cache, project, { claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project), dshUserDir: fakeDshUserDir(project) });
  assert.strictEqual(report.toUpdate.length, 0);
});

test('exportProject detects a hand-edited OpenCode rule and maps it to rules/project/<topic>.md', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-oc-export-project-'));
  const claudeUserDir = fakeClaudeUserDir(project);
  const opencodeUserDir = fakeOpencodeUserDir(project);
  const dshUserDir = fakeDshUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir, dshUserDir });

  const deployedFile = path.join(project, '.opencode', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployedFile, fs.readFileSync(deployedFile, 'utf8').replace('write tests', 'write ALL the tests'));

  const report = exportLib.exportProject(cache, project, { claudeUserDir, opencodeUserDir, dshUserDir });
  const match = report.toUpdate.find((u) => u.deployedFile === deployedFile);
  assert.ok(match);
  assert.strictEqual(match.sourceFile, path.join(cache, 'rules', 'project', 'testing.md'));
});

test('exportProject detects a hand-edited dsh rule and maps it to rules/project/<topic>.md', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-dsh-export-project-'));
  const claudeUserDir = fakeClaudeUserDir(project);
  const opencodeUserDir = fakeOpencodeUserDir(project);
  const dshUserDir = fakeDshUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir, dshUserDir });

  const deployedFile = path.join(project, '.dsh', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployedFile, fs.readFileSync(deployedFile, 'utf8').replace('write tests', 'write ALL the tests'));

  const report = exportLib.exportProject(cache, project, { claudeUserDir, opencodeUserDir, dshUserDir });
  const match = report.toUpdate.find((u) => u.deployedFile === deployedFile);
  assert.ok(match);
  assert.strictEqual(match.sourceFile, path.join(cache, 'rules', 'project', 'testing.md'));
});

test('exportProject maps a hand-edited dsh user rule to rules/user/<topic>.md', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-dsh-export-project-'));
  const claudeUserDir = fakeClaudeUserDir(project);
  const opencodeUserDir = fakeOpencodeUserDir(project);
  const dshUserDir = fakeDshUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir, dshUserDir });

  const deployedFile = path.join(dshUserDir, 'myrules-user-preferences.md');
  fs.writeFileSync(deployedFile, '# Preferences\n\n- be LOUD');

  const report = exportLib.exportProject(cache, project, { claudeUserDir, opencodeUserDir, dshUserDir });
  const match = report.toUpdate.find((u) => u.deployedFile === deployedFile);
  assert.ok(match);
  assert.strictEqual(match.sourceFile, path.join(cache, 'rules', 'user', 'preferences.md'));
});

test('exportProject does not report method and hook artifacts as sourceMissing', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-export-artifacts-'));
  const claudeUserDir = fakeClaudeUserDir(project);
  const opencodeUserDir = fakeOpencodeUserDir(project);
  const dshUserDir = fakeDshUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir, dshUserDir });

  // 模拟 method 短规则 / hook 散文落盘（没有 rules/<category>/ 主题源）
  for (const [dir, name] of [
    [path.join(project, '.claude', 'rules'), 'myrules-method-small.md'],
    [path.join(project, '.dsh', 'rules'), 'myrules-method-small.md'],
    [path.join(project, '.dsh', 'rules'), 'myrules-hook-session-log.md'],
  ]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), '# artifact');
  }

  const report = exportLib.exportProject(cache, project, { claudeUserDir, opencodeUserDir, dshUserDir });
  assert.strictEqual(report.sourceMissing.length, 0, JSON.stringify(report.sourceMissing.map((r) => r.deployedFile)));
  assert.strictEqual(report.toUpdate.length, 0);
});
