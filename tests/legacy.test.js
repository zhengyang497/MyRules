const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const legacy = require('../tools/sync/lib/legacy');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-legacy-'));
}

function write(p, content = 'x') {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

test('scanLegacy finds non-managed cursor/claude rules, .cursorrules, and imported/**', () => {
  const project = tmpProject();
  write(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc'));
  write(path.join(project, '.cursor', 'rules', 'old-style.mdc'));
  write(path.join(project, '.cursor', 'rules', 'imported', 'team.mdc'));
  write(path.join(project, '.claude', 'rules', 'myrules-testing.md'));
  write(path.join(project, '.claude', 'rules', 'legacy.md'));
  write(path.join(project, '.cursorrules'));
  write(path.join(project, 'CLAUDE.md'));

  const found = legacy.scanLegacy(project, 'myrules-');
  const relative = found.map((f) => path.relative(project, f).replace(/\\/g, '/')).sort();

  assert.deepStrictEqual(relative, [
    '.cursor/rules/imported/team.mdc',
    '.cursor/rules/old-style.mdc',
    '.claude/rules/legacy.md',
    '.cursorrules',
  ].sort());
});

test('scanLegacy returns an empty array when there is nothing legacy', () => {
  const project = tmpProject();
  write(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc'));
  assert.deepStrictEqual(legacy.scanLegacy(project, 'myrules-'), []);
});

test('fingerprint is stable for the same set and changes when the set changes', () => {
  const a = ['/p/x.mdc', '/p/y.mdc'];
  const b = ['/p/y.mdc', '/p/x.mdc']; // same set, different order
  const c = ['/p/x.mdc', '/p/y.mdc', '/p/z.mdc'];
  assert.strictEqual(legacy.fingerprint(a), legacy.fingerprint(b));
  assert.notStrictEqual(legacy.fingerprint(a), legacy.fingerprint(c));
});

test('pruneLegacy moves files into a timestamped backup dir, preserving relative paths', () => {
  const project = tmpProject();
  const target = path.join(project, '.cursor', 'rules', 'old-style.mdc');
  write(target, 'legacy content');

  const backupRoot = legacy.pruneLegacy(project, [target], '.myrules-backup');

  assert.strictEqual(fs.existsSync(target), false);
  const archived = path.join(backupRoot, '.cursor', 'rules', 'old-style.mdc');
  assert.strictEqual(fs.readFileSync(archived, 'utf8'), 'legacy content');
  assert.ok(backupRoot.startsWith(path.join(project, '.myrules-backup')));
});
