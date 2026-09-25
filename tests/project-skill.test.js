const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const projectSkill = require('../tools/sync/lib/project-skill');
const { seedCacheContent } = require('./helpers/cache-seed');
const manifest = require('../manifest.js');

const SKILL_FILES = ['SKILL.md', 'REFERENCE.md', 'COMMANDS.md'];

function makeCache() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-skill-cache-'));
  seedCacheContent(cache);
  return cache;
}

function assertSkillBundle(projectRoot, platformDir) {
  const base = path.join(projectRoot, platformDir);
  for (const file of SKILL_FILES) {
    assert.ok(fs.existsSync(path.join(base, file)), `missing ${platformDir}/${file}`);
  }
}

test('ensureProjectSkill installs cursor, claude, and dsh skill bundles when missing', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-skill-project-'));

  const result = projectSkill.ensureProjectSkill(project, cache, manifest);
  const nTargets = projectSkill.destinationSkillDirs(project, manifest).length;

  assert.strictEqual(result.installed.length, SKILL_FILES.length * nTargets);
  assertSkillBundle(project, '.cursor/skills/myrules');
  assertSkillBundle(project, '.claude/skills/myrules');
  assertSkillBundle(project, '.dsh/skills/myrules');
});

test('ensureProjectSkill skips unchanged files', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-skill-project-'));

  projectSkill.ensureProjectSkill(project, cache, manifest);
  const second = projectSkill.ensureProjectSkill(project, cache, manifest);
  const nTargets = projectSkill.destinationSkillDirs(project, manifest).length;

  assert.strictEqual(second.skipped.length, SKILL_FILES.length * nTargets);
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
  const nTargets = projectSkill.destinationSkillDirs(project, manifest).length;

  assert.strictEqual(result.updated.length, nTargets);
  assert.strictEqual(result.skipped.length, (SKILL_FILES.length - 1) * nTargets);
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

  assert.strictEqual(result.installed.length, SKILL_FILES.length);
  assertSkillBundle(project, '.cursor/skills/myrules');
  assert.strictEqual(fs.existsSync(path.join(project, '.claude', 'skills', 'myrules', 'SKILL.md')), false);
});

test('isLegacySkillInstalled detects pre-dsh installs missing only the dsh target', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-skill-project-'));

  // 完全未安装：不是迁移场景
  assert.strictEqual(projectSkill.isLegacySkillInstalled(project, manifest), false);

  // 只装旧平台（模拟 manifest 尚无 dsh 时安装的老项目）
  projectSkill.ensureProjectSkill(project, cache, { ...manifest, platforms: ['cursor', 'claude'] });
  assert.strictEqual(projectSkill.isProjectSkillInstalled(project, manifest), false);
  assert.strictEqual(projectSkill.isLegacySkillInstalled(project, manifest), true);

  // 补齐后全部就位
  projectSkill.ensureProjectSkill(project, cache, manifest);
  assert.strictEqual(projectSkill.isProjectSkillInstalled(project, manifest), true);
});
