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
