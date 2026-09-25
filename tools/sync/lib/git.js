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
  const committed = Boolean(staged);
  if (committed) run(cwd, ['commit', '-m', message]);
  // 工作区干净但本地领先（例如手工 commit 后）也必须推 —— 否则 push.js 会
  // 报 "Nothing to commit" 却把提交留在本地，造成缓存多机分叉。
  // 无 remote 的本地仓库（测试夹具、纯本地缓存）跳过 push。
  if (run(cwd, ['remote'])) run(cwd, ['push']);
  return { committed };
}

module.exports = { isDirty, pullFastForward, revParseHead, commitAndPush };
