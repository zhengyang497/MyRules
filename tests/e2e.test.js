const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const initCli = require('../tools/sync/init');
const syncCli = require('../tools/sync/sync');
const exportLib = require('../tools/sync/lib/export');
const { seedCacheContent } = require('./helpers/cache-seed');

function run(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeCacheRepo() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-e2e-cache-'));
  seedCacheContent(cache);
  fs.writeFileSync(path.join(cache, 'rules', 'user', 'preferences.md'), '# Preferences\n\n- be concise');
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '# Testing\n\n- write tests');
  run(cache, ['init']);
  run(cache, ['config', 'user.email', 'test@example.com']);
  run(cache, ['config', 'user.name', 'Test']);
  run(cache, ['add', '-A']);
  run(cache, ['commit', '-m', 'init']);
  return cache;
}

function makeLegacyProject() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-e2e-project-'));
  fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Project context — do not touch');
  fs.writeFileSync(path.join(project, 'AGENTS.md'), '# Agent notes — do not touch');
  fs.mkdirSync(path.join(project, '.cursor', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(project, '.cursor', 'rules', 'old-style.mdc'), 'legacy cursor rule');
  fs.mkdirSync(path.join(project, '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(project, '.claude', 'rules', 'old-style.md'), 'legacy claude rule');
  fs.writeFileSync(path.join(project, '.cursorrules'), 'legacy single-file rule');
  return project;
}

test('end-to-end: init, sync, protect, dry-run prune, prune, export', () => {
  const cache = makeCacheRepo();
  const project = makeLegacyProject();
  // Test-only overrides so this never touches the real ~/.claude/rules/,
  // ~/.myrules/.registry.json, or needs a real git remote — production
  // init/sync omit these and hit the real targets.
  const opts = {
    project,
    cacheDir: cache,
    skipPull: true,
    skipSkills: true,
    claudeUserDir: path.join(project, '.fake-claude-home', 'rules'),
    homeDir: path.join(project, '.fake-home'),
  };

  initCli.run(opts);

  assert.ok(fs.existsSync(path.join(project, '.cursor', 'skills', 'myrules', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc')));
  assert.strictEqual(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8'), '# Project context — do not touch');
  assert.strictEqual(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8'), '# Agent notes — do not touch');

  const gitignoreContent = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
  assert.match(gitignoreContent, /myrules-backup/);

  syncCli.run({ ...opts, dryRun: true, prune: true });
  syncCli.run({ ...opts, prune: true });

  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'rules', 'old-style.mdc')), false);
  assert.strictEqual(fs.existsSync(path.join(project, '.claude', 'rules', 'old-style.md')), false);
  assert.strictEqual(fs.existsSync(path.join(project, '.cursorrules')), false);
  assert.ok(fs.existsSync(path.join(project, '.myrules-backup')));

  assert.strictEqual(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8'), '# Project context — do not touch');
  assert.strictEqual(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8'), '# Agent notes — do not touch');
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc')));

  const editedFile = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  fs.writeFileSync(editedFile, fs.readFileSync(editedFile, 'utf8').replace('write tests', 'write ALL the tests'));
  const report = exportLib.exportProject(cache, project, { claudeUserDir: opts.claudeUserDir });
  assert.ok(report.toUpdate.some((u) => u.deployedFile === editedFile));
});
