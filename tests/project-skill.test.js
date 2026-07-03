const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const projectSkill = require('../tools/sync/lib/project-skill');
const { seedCacheContent } = require('./helpers/cache-seed');
const manifest = require('../manifest.js');

function makeCache() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-skill-cache-'));
  seedCacheContent(cache);
  return cache;
}

test('ensureProjectSkill installs cursor and claude skill files when missing', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-skill-project-'));

  const result = projectSkill.ensureProjectSkill(project, cache, manifest);

  assert.strictEqual(result.installed.length, 2);
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'skills', 'myrules', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(project, '.claude', 'skills', 'myrules', 'SKILL.md')));
});

test('ensureProjectSkill skips unchanged files', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-skill-project-'));

  projectSkill.ensureProjectSkill(project, cache, manifest);
  const second = projectSkill.ensureProjectSkill(project, cache, manifest);

  assert.strictEqual(second.skipped.length, 2);
  assert.strictEqual(second.installed.length, 0);
  assert.strictEqual(second.updated.length, 0);
});

test('ensureProjectSkill updates when cache skill content changes', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-skill-project-'));

  projectSkill.ensureProjectSkill(project, cache, manifest);
  const skillPath = path.join(cache, 'skills', 'myrules', 'SKILL.md');
  fs.appendFileSync(skillPath, '\n<!-- updated -->\n');
  const result = projectSkill.ensureProjectSkill(project, cache, manifest);

  assert.strictEqual(result.updated.length, 2);
  assert.match(
    fs.readFileSync(path.join(project, '.cursor', 'skills', 'myrules', 'SKILL.md'), 'utf8'),
    /updated/
  );
});

test('isProjectSkillInstalled is false before install and true after', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-skill-project-'));

  assert.strictEqual(projectSkill.isProjectSkillInstalled(project, manifest), false);
  projectSkill.ensureProjectSkill(project, cache, manifest);
  assert.strictEqual(projectSkill.isProjectSkillInstalled(project, manifest), true);
});

test('ensureProjectSkill respects cursor-only platforms', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-skill-project-'));
  const cursorOnly = { ...manifest, platforms: ['cursor'] };

  const result = projectSkill.ensureProjectSkill(project, cache, cursorOnly);

  assert.strictEqual(result.installed.length, 1);
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'skills', 'myrules', 'SKILL.md')));
  assert.strictEqual(fs.existsSync(path.join(project, '.claude', 'skills', 'myrules', 'SKILL.md')), false);
});
