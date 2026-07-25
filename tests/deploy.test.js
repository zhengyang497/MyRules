const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const deploy = require('../tools/sync/lib/deploy');

function makeCache() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-cache-'));
  fs.mkdirSync(path.join(cache, 'rules', 'user'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'rules', 'project'), { recursive: true });
  fs.writeFileSync(path.join(cache, 'rules', 'user', 'preferences.md'), '# Preferences\n\n- be concise');
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '# Testing\n\n- write tests');
  return cache;
}

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-deploy-project-'));
}

function fakeClaudeUserDir(project) {
  return path.join(project, '.fake-claude-home', 'rules');
}

function fakeOpencodeUserDir(project) {
  return path.join(project, '.fake-opencode-home', 'rules');
}

test('deployRules writes Cursor and Claude files for user and project rules', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  const result = deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project) });

  const cursorUser = path.join(project, '.cursor', 'rules', 'myrules-user-preferences.mdc');
  const cursorProject = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  const claudeUser = path.join(claudeUserDir, 'myrules-user-preferences.md');
  const claudeProject = path.join(project, '.claude', 'rules', 'myrules-testing.md');

  assert.ok(fs.existsSync(cursorUser));
  assert.ok(fs.existsSync(cursorProject));
  assert.ok(fs.existsSync(claudeUser));
  assert.ok(fs.existsSync(claudeProject));
  assert.match(fs.readFileSync(cursorUser, 'utf8'), /alwaysApply: true/);
  assert.match(fs.readFileSync(claudeProject, 'utf8'), /write tests/);
  assert.strictEqual(result.drifted.length, 0);
  assert.ok(Object.keys(result.hashes).length >= 2);
});

test('deployRules skips a target whose current content does not match the last recorded hash', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  const first = deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project) });

  const cursorProjectFile = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  fs.writeFileSync(cursorProjectFile, 'hand-edited content');

  const second = deploy.deployRules(cache, project, { force: false, priorHashes: first.hashes, claudeUserDir });
  assert.ok(second.drifted.some((f) => f === cursorProjectFile));
  assert.strictEqual(fs.readFileSync(cursorProjectFile, 'utf8'), 'hand-edited content');
});

test('deployRules with force:true overwrites drifted files', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  const first = deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project) });

  const cursorProjectFile = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  fs.writeFileSync(cursorProjectFile, 'hand-edited content');

  const second = deploy.deployRules(cache, project, { force: true, priorHashes: first.hashes, claudeUserDir });
  assert.strictEqual(second.drifted.length, 0);
  assert.match(fs.readFileSync(cursorProjectFile, 'utf8'), /write tests/);
});

test('deployRules strips project frontmatter from rules artifacts', () => {
  const cache = makeCache();
  fs.writeFileSync(
    path.join(cache, 'rules', 'project', 'testing.md'),
    '---\nagents: [implementer]\n---\n\n# Testing\n\n- write tests'
  );
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project) });

  const cursorProject = fs.readFileSync(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc'), 'utf8');
  const claudeProject = fs.readFileSync(path.join(project, '.claude', 'rules', 'myrules-testing.md'), 'utf8');
  assert.doesNotMatch(cursorProject, /agents:/);
  assert.doesNotMatch(claudeProject, /agents:/);
  assert.match(cursorProject, /write tests/);
});

test('deployRules removes stale rule artifacts after ai-behavior migration to user/', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  fs.mkdirSync(path.join(project, '.cursor', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(project, '.claude', 'rules'), { recursive: true });
  fs.mkdirSync(claudeUserDir, { recursive: true });

  const staleCursor = path.join(project, '.cursor', 'rules', 'myrules-ai-behavior.mdc');
  const staleClaudeProj = path.join(project, '.claude', 'rules', 'myrules-ai-behavior.md');
  const staleClaudeUser = path.join(claudeUserDir, 'myrules-ai-behavior.md');
  fs.writeFileSync(staleCursor, 'old project-level ai-behavior');
  fs.writeFileSync(staleClaudeProj, 'old project-level ai-behavior');
  fs.writeFileSync(staleClaudeUser, 'old wrong user path');

  fs.writeFileSync(path.join(cache, 'rules', 'user', 'ai-behavior.md'), '# AI Behavior\n\n- read first');
  const priorHashes = {
    '.cursor/rules/myrules-ai-behavior.mdc': 'old',
    '.claude/rules/myrules-ai-behavior.md': 'old',
    '~claude-user~/myrules-ai-behavior.md': 'old',
  };

  deploy.deployRules(cache, project, { force: false, priorHashes, claudeUserDir, opencodeUserDir: fakeOpencodeUserDir(project) });

  assert.strictEqual(fs.existsSync(staleCursor), false);
  assert.strictEqual(fs.existsSync(staleClaudeProj), false);
  assert.strictEqual(fs.existsSync(staleClaudeUser), false);
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-user-ai-behavior.mdc')));
  assert.ok(fs.existsSync(path.join(claudeUserDir, 'myrules-user-ai-behavior.md')));
});

test('deployRules cursor and claude outputs are byte-identical to pre-opencode baseline', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  const opencodeUserDir = fakeOpencodeUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir });

  // Cursor project rule
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc'), 'utf8'),
    '---\ndescription: "MyRules: testing"\nalwaysApply: true\n---\n\n# Testing\n\n- write tests'
  );
  // Claude project rule
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.claude', 'rules', 'myrules-testing.md'), 'utf8'),
    '# Testing\n\n- write tests'
  );
  // Cursor user rule
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.cursor', 'rules', 'myrules-user-preferences.mdc'), 'utf8'),
    '---\ndescription: "MyRules: preferences"\nalwaysApply: true\n---\n\n# Preferences\n\n- be concise'
  );
  // Claude user rule
  assert.strictEqual(
    fs.readFileSync(path.join(claudeUserDir, 'myrules-user-preferences.md'), 'utf8'),
    '# Preferences\n\n- be concise'
  );
});

test('deployRules writes OpenCode project and user rule files', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  const opencodeUserDir = fakeOpencodeUserDir(project);
  const result = deploy.deployRules(cache, project, {
    force: false,
    priorHashes: {},
    claudeUserDir,
    opencodeUserDir,
  });

  const opencodeProject = path.join(project, '.opencode', 'rules', 'myrules-testing.md');
  const opencodeUser = path.join(opencodeUserDir, 'myrules-user-preferences.md');

  assert.ok(fs.existsSync(opencodeProject), 'missing opencode project rule');
  assert.ok(fs.existsSync(opencodeUser), 'missing opencode user rule');
  assert.strictEqual(
    fs.readFileSync(opencodeProject, 'utf8'),
    fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8')
  );
  assert.strictEqual(result.drifted.length, 0);
  assert.ok(Object.keys(result.hashes).some((k) => k.startsWith('.opencode/rules/')));
});

test('deployRules skips a hand-edited OpenCode rule file and reports it as drifted', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  const opencodeUserDir = fakeOpencodeUserDir(project);
  const first = deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir });

  const target = path.join(project, '.opencode', 'rules', 'myrules-testing.md');
  fs.writeFileSync(target, 'hand-edited');

  const second = deploy.deployRules(cache, project, { force: false, priorHashes: first.hashes, claudeUserDir, opencodeUserDir });
  assert.ok(second.drifted.includes(target));
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'hand-edited');
});
