const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const gitignore = require('../tools/sync/lib/gitignore');
const manifest = require('../manifest.js');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-gitignore-'));
}

test('ensureGitignore creates .gitignore with the MyRules block when missing', () => {
  const project = tmpProject();
  const wrote = gitignore.ensureGitignore(project, manifest);
  assert.strictEqual(wrote, true);
  const content = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
  assert.match(content, /\.cursor\/rules\/myrules-\*/);
  assert.match(content, /!\.cursor\/rules\/myrules-method-\*/);
  assert.match(content, /\.myrules-backup\//);
  assert.match(content, /\.myrules-sync-state\.json/);
});

test('ensureGitignore preserves existing content and appends the block', () => {
  const project = tmpProject();
  fs.writeFileSync(path.join(project, '.gitignore'), 'node_modules/\n');
  gitignore.ensureGitignore(project, manifest);
  const content = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
  assert.match(content, /node_modules\//);
  assert.match(content, /\.myrules-backup\//);
});

test('ensureGitignore is idempotent — second call does not duplicate the block', () => {
  const project = tmpProject();
  gitignore.ensureGitignore(project, manifest);
  const second = gitignore.ensureGitignore(project, manifest);
  assert.strictEqual(second, false);
  const content = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
  const occurrences = content.split('MyRules deploy artifacts').length - 1;
  assert.strictEqual(occurrences, 1);
});

test('ensureGitignore includes the MyRules-managed hook scripts pattern', () => {
  const project = tmpProject();
  gitignore.ensureGitignore(project, manifest);
  const content = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
  assert.match(content, /\.cursor\/hooks\/myrules-\*/);
});

test('ensureGitignore includes sub-agent artifact paths', () => {
  const project = tmpProject();
  gitignore.ensureGitignore(project, manifest);
  const content = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
  assert.match(content, /\.cursor\/agents\/myrules-\*/);
  assert.match(content, /\.claude\/agents\/myrules-\*/);
});

test('buildBlock for project runtime commits agents and method rules', () => {
  const block = gitignore.buildBlock(manifest, 'project');
  assert.match(block, /!\.cursor\/rules\/myrules-method-\*/);
  assert.doesNotMatch(block, /^\.cursor\/agents\/myrules-\*$/m);
});

test('buildBlock includes opencode rules and agents', () => {
  const localManifest = {
    managedPrefix: 'myrules-',
    prune: { backupDir: '.myrules-backup' },
    agents: { prefix: 'myrules-' },
  };
  const block = gitignore.buildBlock(localManifest);
  assert.match(block, /\.opencode\/rules\/myrules-\*/);
  assert.match(block, /\.opencode\/agents\/myrules-\*/);
});

test('buildBlock includes dsh rules, agents, and the roles scaffold', () => {
  const block = gitignore.buildBlock(manifest);
  assert.match(block, /\.dsh\/rules\/myrules-\*/);
  assert.match(block, /!\.dsh\/rules\/myrules-method-\*/);
  assert.match(block, /\.dsh\/agents\/myrules-\*/);
  assert.match(block, /\.dsh\/roles-tool-rows\.yml/);
});

test('buildBlock omits dsh agent patterns for project runtime', () => {
  const block = gitignore.buildBlock(manifest, 'project');
  assert.doesNotMatch(block, /^\.dsh\/agents\/myrules-\*$/m);
  assert.match(block, /\.dsh\/rules\/myrules-\*/);
});

test('ensureGitignore refreshes a stale block that is missing opencode patterns', () => {
  const project = tmpProject();
  const stale = [
    gitignore.MARKER,
    '.cursor/rules/myrules-*',
    '.claude/rules/myrules-*',
    '.cursor/agents/myrules-*',
    '.claude/agents/myrules-*',
    '.cursor/hooks/myrules-*',
    '.myrules-backup/',
    '.myrules-sync-state.json',
    '',
    '# keep me',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(project, '.gitignore'), stale);
  const wrote = gitignore.ensureGitignore(project, manifest);
  assert.strictEqual(wrote, true);
  const content = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
  assert.match(content, /\.opencode\/rules\/myrules-\*/);
  assert.match(content, /\.opencode\/agents\/myrules-\*/);
  assert.match(content, /# keep me/);
  const occurrences = content.split('MyRules deploy artifacts').length - 1;
  assert.strictEqual(occurrences, 1);
});
