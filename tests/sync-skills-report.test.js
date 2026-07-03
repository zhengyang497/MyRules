const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const syncCli = require('../tools/sync/sync');

function run(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function copyManifest(cache) {
  const src = path.join(__dirname, '..', 'manifest.js');
  fs.copyFileSync(src, path.join(cache, 'manifest.js'));
}

function makeCacheRepo() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-cache-'));
  fs.mkdirSync(path.join(cache, 'rules', 'user'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'rules', 'project'), { recursive: true });
  fs.writeFileSync(path.join(cache, 'rules', 'user', 'preferences.md'), '# Preferences\n\n- be concise');
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '# Testing\n\n- write tests');
  copyManifest(cache);
  fs.writeFileSync(
    path.join(cache, 'skills-manifest.js'),
    "module.exports = { skills: [ { name: 'broken-skill', repo: 'https://invalid.invalid/norepo.git', ref: 'main' } ] };\n"
  );
  run(cache, ['init']);
  run(cache, ['config', 'user.email', 'test@example.com']);
  run(cache, ['config', 'user.name', 'Test']);
  run(cache, ['add', '-A']);
  run(cache, ['commit', '-m', 'init']);
  return cache;
}

test('sync.run warns when skill sync fails but still deploys rules', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-sync-project-'));
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  try {
    syncCli.run({
      project,
      cacheDir: cache,
      dryRun: false,
      prune: false,
      force: false,
      skipPull: true,
      skipSkills: false,
      claudeUserDir: path.join(project, '.fake-claude-home', 'rules'),
      homeDir: path.join(project, '.fake-home'),
    });
  } finally {
    console.warn = originalWarn;
  }

  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc')));
  assert.ok(warnings.some((w) => w.includes('Skill sync failed')));
  assert.ok(warnings.some((w) => w.includes('broken-skill')));
});

test('sync.run missing cache error includes manifest.repo URL', () => {
  const missing = path.join(os.tmpdir(), `myrules-missing-${Date.now()}`);
  assert.throws(
    () =>
      syncCli.run({
        project: process.cwd(),
        cacheDir: missing,
        skipPull: true,
        skipSkills: true,
      }),
    (err) => err.message.includes('https://github.com/zhengyang497/MyRules.git')
  );
});
