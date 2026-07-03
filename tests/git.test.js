const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const git = require('../tools/sync/lib/git');

function run(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeRepoWithRemote() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-git-'));
  const bare = path.join(root, 'remote.git');
  const clone = path.join(root, 'clone');
  run(root, ['init', '--bare', '-b', 'main', bare]);
  run(root, ['clone', bare, clone]);
  fs.writeFileSync(path.join(clone, 'file.txt'), 'hello\n');
  run(clone, ['config', 'user.email', 'test@example.com']);
  run(clone, ['config', 'user.name', 'Test']);
  run(clone, ['add', '-A']);
  run(clone, ['commit', '-m', 'init']);
  run(clone, ['push', '-u', 'origin', 'main']);
  return { root, bare, clone };
}

test('isDirty is false on a clean repo and true after an edit', () => {
  const { clone } = makeRepoWithRemote();
  assert.strictEqual(git.isDirty(clone), false);
  fs.writeFileSync(path.join(clone, 'file.txt'), 'changed\n');
  assert.strictEqual(git.isDirty(clone), true);
});

test('revParseHead returns the current commit SHA', () => {
  const { clone } = makeRepoWithRemote();
  const sha = git.revParseHead(clone);
  assert.match(sha, /^[0-9a-f]{40}$/);
});

test('pullFastForward succeeds when the remote has new commits', () => {
  const { bare, clone } = makeRepoWithRemote();
  const other = clone + '-other';
  execFileSync('git', ['clone', bare, other], { stdio: 'ignore' });
  run(other, ['config', 'user.email', 'test@example.com']);
  run(other, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(other, 'file2.txt'), 'more\n');
  run(other, ['add', '-A']);
  run(other, ['commit', '-m', 'second']);
  run(other, ['push']);

  git.pullFastForward(clone);
  assert.ok(fs.existsSync(path.join(clone, 'file2.txt')));
});

test('commitAndPush returns committed:false when there is nothing staged', () => {
  const { clone } = makeRepoWithRemote();
  const result = git.commitAndPush(clone, 'no-op');
  assert.strictEqual(result.committed, false);
});

test('commitAndPush commits and pushes when there are changes', () => {
  const { clone } = makeRepoWithRemote();
  fs.writeFileSync(path.join(clone, 'new.txt'), 'data\n');
  const result = git.commitAndPush(clone, 'add new file');
  assert.strictEqual(result.committed, true);
  assert.strictEqual(git.isDirty(clone), false);
});
