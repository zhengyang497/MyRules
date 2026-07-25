const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const oc = require('../tools/sync/lib/opencode-config-deploy');

test('mergeInstructions creates instructions array when none exists', () => {
  const result = oc.mergeInstructions(null, [], ['.opencode/rules/myrules-*.md']);
  assert.deepStrictEqual(result.instructions, ['.opencode/rules/myrules-*.md']);
});

test('mergeInstructions preserves foreign instructions entries', () => {
  const existing = { instructions: ['CONTRIBUTING.md', 'docs/guidelines.md'] };
  const result = oc.mergeInstructions(existing, [], ['.opencode/rules/myrules-*.md']);
  assert.deepStrictEqual(result.instructions, ['CONTRIBUTING.md', 'docs/guidelines.md', '.opencode/rules/myrules-*.md']);
});

test('mergeInstructions removes prior myrules entries via exact match and replaces with current', () => {
  const existing = { instructions: ['CONTRIBUTING.md', '.opencode/rules/myrules-*.md'] };
  const result = oc.mergeInstructions(existing, ['.opencode/rules/myrules-*.md'], ['.opencode/rules/myrules-*.md']);
  assert.deepStrictEqual(result.instructions, ['CONTRIBUTING.md', '.opencode/rules/myrules-*.md']);
});

test('mergeInstructions falls back to substring filter when priorEntries is empty', () => {
  const existing = { instructions: ['keep.md', '.opencode/rules/myrules-*.md'] };
  const result = oc.mergeInstructions(existing, [], ['.opencode/rules/myrules-*.md']);
  assert.deepStrictEqual(result.instructions, ['keep.md', '.opencode/rules/myrules-*.md']);
});

test('mergeInstructions removes instructions key entirely when array becomes empty', () => {
  const existing = { instructions: ['.opencode/rules/myrules-*.md'] };
  const result = oc.mergeInstructions(existing, ['.opencode/rules/myrules-*.md'], []);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'instructions'), false);
});

test('mergeInstructions preserves other top-level config keys', () => {
  const existing = { model: 'anthropic/claude-sonnet-4-5', instructions: ['CONTRIBUTING.md'] };
  const result = oc.mergeInstructions(existing, [], ['.opencode/rules/myrules-*.md']);
  assert.strictEqual(result.model, 'anthropic/claude-sonnet-4-5');
});

// --- deployProjectConfig ---

function makeCache() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-oc-cache-'));
  fs.mkdirSync(path.join(cache, 'rules', 'user'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'rules', 'project'), { recursive: true });
  return cache;
}

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-oc-project-'));
}

const fakeManifest = {
  opencode: {
    projectInstructionsGlob: '.opencode/rules/myrules-*.md',
    userInstructionsGlob: 'rules/myrules-user-*.md',
  },
};

test('deployProjectConfig creates opencode.json with instructions glob when none exists', () => {
  const cache = makeCache();
  const project = makeProject();
  const result = oc.deployProjectConfig(cache, project, { manifest: fakeManifest, priorEntries: [] });

  const config = JSON.parse(fs.readFileSync(path.join(project, 'opencode.json'), 'utf8'));
  assert.deepStrictEqual(config.instructions, ['.opencode/rules/myrules-*.md']);
  assert.strictEqual(result.wrote, true);
});

test('deployProjectConfig preserves foreign config keys and instructions entries', () => {
  const cache = makeCache();
  const project = makeProject();
  fs.writeFileSync(
    path.join(project, 'opencode.json'),
    JSON.stringify({ model: 'anthropic/claude-sonnet-4-5', instructions: ['CONTRIBUTING.md'] }, null, 2)
  );

  oc.deployProjectConfig(cache, project, { manifest: fakeManifest, priorEntries: [] });

  const config = JSON.parse(fs.readFileSync(path.join(project, 'opencode.json'), 'utf8'));
  assert.strictEqual(config.model, 'anthropic/claude-sonnet-4-5');
  assert.deepStrictEqual(config.instructions, ['CONTRIBUTING.md', '.opencode/rules/myrules-*.md']);
});

test('deployProjectConfig is idempotent on a second run', () => {
  const cache = makeCache();
  const project = makeProject();
  oc.deployProjectConfig(cache, project, { manifest: fakeManifest, priorEntries: [] });
  const firstContent = fs.readFileSync(path.join(project, 'opencode.json'), 'utf8');

  const result = oc.deployProjectConfig(cache, project, { manifest: fakeManifest, priorEntries: ['.opencode/rules/myrules-*.md'] });
  const secondContent = fs.readFileSync(path.join(project, 'opencode.json'), 'utf8');

  assert.strictEqual(result.wrote, false);
  assert.strictEqual(firstContent, secondContent);
});

test('deployProjectConfig aborts with a clear error when opencode.json is malformed', () => {
  const cache = makeCache();
  const project = makeProject();
  fs.writeFileSync(path.join(project, 'opencode.json'), '{ not valid json');

  assert.throws(
    () => oc.deployProjectConfig(cache, project, { manifest: fakeManifest, priorEntries: [] }),
    /Failed to parse/
  );
});

// --- deployUserConfig ---

test('deployUserConfig writes to the given homeDir config path', () => {
  const cache = makeCache();
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-oc-home-'));
  const result = oc.deployUserConfig(cache, { manifest: fakeManifest, homeDir, priorEntries: [] });

  const config = JSON.parse(fs.readFileSync(path.join(homeDir, '.config', 'opencode', 'opencode.json'), 'utf8'));
  assert.deepStrictEqual(config.instructions, ['rules/myrules-user-*.md']);
  assert.strictEqual(result.wrote, true);
});
