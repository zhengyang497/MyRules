const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const skills = require('../tools/sync/lib/skills');

function run(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeFixtureSkillRepo(root) {
  const bare = path.join(root, 'skill.git');
  const seed = path.join(root, 'skill-seed');
  run(root, ['init', '--bare', '-b', 'main', bare]);
  run(root, ['clone', bare, seed]);
  fs.writeFileSync(path.join(seed, 'SKILL.md'), '# Fixture Skill v1');
  run(seed, ['config', 'user.email', 'test@example.com']);
  run(seed, ['config', 'user.name', 'Test']);
  run(seed, ['add', '-A']);
  run(seed, ['commit', '-m', 'v1']);
  run(seed, ['push', '-u', 'origin', 'HEAD:main']);
  return bare;
}

function makeCacheWithManifest(bare) {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-cache-'));
  fs.writeFileSync(
    path.join(cache, 'skills-manifest.js'),
    `module.exports = { skills: [ { name: 'fixture-skill', repo: ${JSON.stringify(bare)}, ref: 'main' }, { name: 'myrules', repo: 'should-be-skipped', ref: 'main' } ] };\n`
  );
  return cache;
}

test('syncSkills clones a missing skill into both target dirs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-skills-'));
  const bare = makeFixtureSkillRepo(root);
  const cache = makeCacheWithManifest(bare);
  const cursorSkillsDir = path.join(root, 'cursor-skills');
  const claudeSkillsDir = path.join(root, 'claude-skills');

  const results = skills.syncSkills(cache, { cursorSkillsDir, claudeSkillsDir });

  assert.ok(fs.existsSync(path.join(cursorSkillsDir, 'fixture-skill', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(claudeSkillsDir, 'fixture-skill', 'SKILL.md')));
  assert.ok(results.every((r) => r.ok));
  assert.ok(!results.some((r) => r.name === 'myrules'));
});

test('syncSkills updates an already-cloned skill to the latest commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-skills-'));
  const bare = makeFixtureSkillRepo(root);
  const cache = makeCacheWithManifest(bare);
  const cursorSkillsDir = path.join(root, 'cursor-skills');
  const claudeSkillsDir = path.join(root, 'claude-skills');

  skills.syncSkills(cache, { cursorSkillsDir, claudeSkillsDir });

  // push a new commit to the fixture repo
  const seed2 = path.join(root, 'skill-seed-2');
  execFileSync('git', ['clone', '-b', 'main', bare, seed2], { stdio: 'ignore' });
  fs.writeFileSync(path.join(seed2, 'SKILL.md'), '# Fixture Skill v2');
  run(seed2, ['config', 'user.email', 'test@example.com']);
  run(seed2, ['config', 'user.name', 'Test']);
  run(seed2, ['add', '-A']);
  run(seed2, ['commit', '-m', 'v2']);
  run(seed2, ['push']);

  skills.syncSkills(cache, { cursorSkillsDir, claudeSkillsDir });
  const content = fs.readFileSync(path.join(cursorSkillsDir, 'fixture-skill', 'SKILL.md'), 'utf8');
  assert.match(content, /v2/);
});
