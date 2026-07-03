const { execFileSync } = require('node:child_process');

function run(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function isDirty(cwd) {
  return run(cwd, ['status', '--porcelain']).length > 0;
}

function pullFastForward(cwd) {
  return run(cwd, ['pull', '--ff-only']);
}

function revParseHead(cwd) {
  return run(cwd, ['rev-parse', 'HEAD']);
}

function commitAndPush(cwd, message) {
  run(cwd, ['add', '-A']);
  const staged = run(cwd, ['status', '--porcelain']);
  if (!staged) return { committed: false };
  run(cwd, ['commit', '-m', message]);
  run(cwd, ['push']);
  return { committed: true };
}

module.exports = { isDirty, pullFastForward, revParseHead, commitAndPush };
