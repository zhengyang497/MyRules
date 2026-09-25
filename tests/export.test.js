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

// ---- skill 反查：.{cursor,claude,dsh}/skills/<name>/ ↔ 缓存 method/skills/<name>/ ----

function makeSkillCache() {
  const cache = makeCache();
  fs.mkdirSync(path.join(cache, 'method', 'skills', 'demo-skill'), { recursive: true });
  fs.writeFileSync(path.join(cache, 'method', 'skills', 'demo-skill', 'SKILL.md'), '# Demo\n\n- v1');
  fs.writeFileSync(path.join(cache, 'method', 'skills', 'demo-skill', 'examples.md'), '- example');
  return cache;
}

function deployDemoSkill(cache, project, platform = '.cursor') {
  for (const rel of ['SKILL.md', 'examples.md']) {
    const dest = path.join(project, platform, 'skills', 'demo-skill', rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(cache, 'method', 'skills', 'demo-skill', rel), dest);
  }
}

function skillExportOpts(project) {
  return {
    claudeUserDir: fakeClaudeUserDir(project),
    opencodeUserDir: fakeOpencodeUserDir(project),
    dshUserDir: fakeDshUserDir(project),
  };
}

function tmpProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('exportProject reports no diffs for freshly deployed skills', () => {
  const cache = makeSkillCache();
  const project = tmpProject('myrules-export-skill-clean-');
  deployDemoSkill(cache, project);
  deployDemoSkill(cache, project, '.claude');

  const report = exportLib.exportProject(cache, project, skillExportOpts(project));
  assert.strictEqual(report.toUpdate.length, 0, JSON.stringify(report.toUpdate));
  assert.strictEqual(report.sourceMissing.length, 0, JSON.stringify(report.sourceMissing));
});

test('exportProject maps a hand-edited skill file back to method/skills/<name>/', () => {
  const cache = makeSkillCache();
  const project = tmpProject('myrules-export-skill-edit-');
  deployDemoSkill(cache, project);
  deployDemoSkill(cache, project, '.claude');

  const deployedFile = path.join(project, '.cursor', 'skills', 'demo-skill', 'SKILL.md');
  fs.writeFileSync(deployedFile, fs.readFileSync(deployedFile, 'utf8').replace('- v1', '- v2 edited'));

  const report = exportLib.exportProject(cache, project, skillExportOpts(project));
  const match = report.toUpdate.find((u) => u.deployedFile === deployedFile);
  assert.ok(match, 'expected the edited skill file to be reported');
  assert.strictEqual(match.kind, 'skill');
  assert.strictEqual(match.sourceFile, path.join(cache, 'method', 'skills', 'demo-skill', 'SKILL.md'));
  assert.match(match.body, /v2 edited/);
  // 未改动的 .claude 拷贝与其他文件不重复报告
  assert.strictEqual(report.toUpdate.length, 1);
  assert.strictEqual(report.sourceMissing.length, 0);
});

test('exportProject reports extra files inside a managed skill dir as sourceMissing', () => {
  const cache = makeSkillCache();
  const project = tmpProject('myrules-export-skill-extra-');
  deployDemoSkill(cache, project);

  const extra = path.join(project, '.cursor', 'skills', 'demo-skill', 'notes.md');
  fs.writeFileSync(extra, '- local notes\n');

  const report = exportLib.exportProject(cache, project, skillExportOpts(project));
  const match = report.sourceMissing.find((s) => s.deployedFile === extra);
  assert.ok(match, 'expected the extra skill file to be reported');
  assert.strictEqual(match.kind, 'skill');
  assert.strictEqual(match.sourceFile, path.join(cache, 'method', 'skills', 'demo-skill', 'notes.md'));
  assert.match(match.body, /local notes/);
  assert.strictEqual(report.toUpdate.length, 0);
});

test('exportProject ignores skills that are not in the cache method pack', () => {
  const cache = makeSkillCache();
  const project = tmpProject('myrules-export-skill-foreign-');

  const foreign = path.join(project, '.cursor', 'skills', 'foreign-skill', 'SKILL.md');
  fs.mkdirSync(path.dirname(foreign), { recursive: true });
  fs.writeFileSync(foreign, '# hand-made, not a myrules artifact\n');

  const report = exportLib.exportProject(cache, project, skillExportOpts(project));
  assert.strictEqual(report.toUpdate.length, 0);
  assert.strictEqual(report.sourceMissing.length, 0);
});

test('exportProject maps skill template files to their manifest source', () => {
  const cache = makeCache();
  fs.mkdirSync(path.join(cache, 'method', 'skills', 'project-method'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'method', 'core', 'templates'), { recursive: true });
  fs.writeFileSync(path.join(cache, 'method', 'core', 'templates', '设计目标.md'), '# 设计目标\n\n- v1');
  const project = tmpProject('myrules-export-skill-template-');

  const deployed = path.join(project, '.cursor', 'skills', 'project-method', 'templates', '设计目标.md');
  fs.mkdirSync(path.dirname(deployed), { recursive: true });
  fs.writeFileSync(deployed, '# 设计目标\n\n- v2 edited');

  const report = exportLib.exportProject(cache, project, skillExportOpts(project));
  const match = report.toUpdate.find((u) => u.deployedFile === deployed);
  assert.ok(match, 'expected the edited template to be reported');
  assert.strictEqual(match.kind, 'skill');
  assert.strictEqual(match.sourceFile, path.join(cache, 'method', 'core', 'templates', '设计目标.md'));
});

test('exportProject does not reverse instance-owned project-method when instanceLanding', () => {
  const cache = makeCache();
  fs.mkdirSync(path.join(cache, 'method', 'skills', 'project-method'), { recursive: true });
  fs.writeFileSync(path.join(cache, 'method', 'skills', 'project-method', 'SKILL.md'), '# cached version');
  const project = tmpProject('myrules-export-skill-instance-');
  fs.writeFileSync(path.join(project, '.myrules-runtime.json'), `${JSON.stringify({ runtime: 'agent', instanceLanding: true }, null, 2)}\n`);

  const deployed = path.join(project, '.cursor', 'skills', 'project-method', 'SKILL.md');
  fs.mkdirSync(path.dirname(deployed), { recursive: true });
  fs.writeFileSync(deployed, '# instance custom version\n');

  const report = exportLib.exportProject(cache, project, skillExportOpts(project));
  const skillEntries = [...report.toUpdate, ...report.sourceMissing].filter((r) => r.kind === 'skill');
  assert.strictEqual(skillEntries.length, 0, JSON.stringify(skillEntries));
});

test('applyReport writes skill diffs back to the cache and never touches rules', () => {
  const cache = makeSkillCache();
  const project = tmpProject('myrules-export-skill-apply-');
  deployDemoSkill(cache, project);

  const deployedFile = path.join(project, '.cursor', 'skills', 'demo-skill', 'SKILL.md');
  fs.writeFileSync(deployedFile, '# Demo\n\n- v2 edited\n');

  const report = exportLib.exportProject(cache, project, skillExportOpts(project));
  // 混入一条规则差异：--apply 不碰规则源（frontmatter 需人工保留语义）
  report.toUpdate.push({
    deployedFile: path.join(project, '.cursor', 'rules', 'myrules-testing.mdc'),
    sourceFile: path.join(cache, 'rules', 'project', 'testing.md'),
    body: 'RULE BODY',
    kind: 'rule',
  });

  const applied = exportLib.applyReport(report);
  assert.strictEqual(applied.length, 1);
  assert.strictEqual(
    fs.readFileSync(path.join(cache, 'method', 'skills', 'demo-skill', 'SKILL.md'), 'utf8'),
    '# Demo\n\n- v2 edited\n'
  );
  assert.strictEqual(fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8'), '# Testing\n\n- write tests');
});

test('reverseKind classifies drift targets for sync warnings', () => {
  const p = (...parts) => path.join('C:', 'proj', ...parts);
  assert.strictEqual(exportLib.reverseKind(p('.cursor', 'skills', 'demo-skill', 'SKILL.md')), 'skill');
  assert.strictEqual(exportLib.reverseKind(p('.dsh', 'skills', 'demo-skill', 'examples.md')), 'skill');
  assert.strictEqual(exportLib.reverseKind(p('.cursor', 'rules', 'myrules-testing.mdc')), 'rule');
  assert.strictEqual(exportLib.reverseKind(p('.cursor', 'rules', 'myrules-user-preferences.mdc')), 'rule');
  assert.strictEqual(exportLib.reverseKind(p('.cursor', 'rules', 'myrules-method-small.mdc')), null);
  assert.strictEqual(exportLib.reverseKind(p('.claude', 'rules', 'myrules-hook-session-log.md')), null);
  assert.strictEqual(exportLib.reverseKind(p('.cursor', 'agents', 'myrules-planner.md')), null);
  assert.strictEqual(exportLib.reverseKind(p('.cursor', 'hooks', 'myrules-session-log.js')), null);
  assert.strictEqual(exportLib.reverseKind(p('docs', '方法', 'myrules-runtime.md')), null);
});
