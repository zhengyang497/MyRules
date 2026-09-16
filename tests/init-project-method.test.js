const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers/cache-seed');
const initCli = require('../tools/sync/init-project-method');

test('init parseArgs requires runtime and accepts agent/project', () => {
  assert.strictEqual(initCli.parseArgs(['--project', 'x']).runtime, null);
  assert.strictEqual(initCli.parseArgs(['--runtime', 'agent']).runtime, 'agent');
  assert.strictEqual(initCli.parseArgs(['--runtime', 'project', '--force']).force, true);
});

test('hosted method scripts and core docs exist in method/', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'core', '项目工作法.md')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'agent', 'scripts', 'myrules-board.mjs')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'agent', 'scripts', 'myrules-board-io.mjs')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'agent', 'scripts', 'myrules-board-server.mjs')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'skills', 'project-method', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'agent', 'runtime.md')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'project', 'coordinator.md')));
  const skill = fs.readFileSync(path.join(REPO_ROOT, 'method', 'skills', 'project-method', 'SKILL.md'), 'utf8');
  assert.match(skill, /标完成/);
  assert.match(skill, /\.myrules-runtime\.json/);
  assert.doesNotMatch(skill, /five execution flows/);
  assert.doesNotMatch(skill, /你若是主会话，就是 coordinator/);
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'core', 'rules', 'myrules-method-small.mdc')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'core', 'rules', 'myrules-method-session.mdc')));
  const coordRule = fs.readFileSync(
    path.join(REPO_ROOT, 'method', 'project', 'rules', 'myrules-method-coordinator.mdc'),
    'utf8'
  );
  assert.match(coordRule, /alwaysApply:\s*false/);
  const small = fs.readFileSync(path.join(REPO_ROOT, 'method', 'core', 'rules', 'myrules-method-small.mdc'), 'utf8');
  assert.match(small, /alwaysApply:\s*true/);
  assert.match(small, /当前主会话直接改/);
  assert.match(skill, /琐碎改动却派了 Task\/子代理或开了卡/);
  assert.match(skill, /publisher 被禁止改文首/);
  const firstMessage = fs.readFileSync(
    path.join(REPO_ROOT, 'method', 'project', 'FIRST-MESSAGE.md'),
    'utf8'
  );
  assert.match(firstMessage, /myrules-implementer/);
  assert.match(firstMessage, /禁止用无名/);
  const charter = fs.readFileSync(path.join(REPO_ROOT, 'method', 'project', 'coordinator.md'), 'utf8');
  assert.match(charter, /禁止用无名/);
  assert.match(charter, /不会走本地 subagentStart/);
});

test('bundled board-server chrome matches wiki fonts, sizes, and frame', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'method', 'agent', 'scripts', 'myrules-board-server.mjs'),
    'utf8'
  );
  assert.ok(src.includes('font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'));
  assert.ok(src.includes('width: 264px'));
  assert.ok(src.includes('.side h1 { margin: 0 0 2px; font-size: 18px; }'));
  assert.ok(src.includes('.stat strong { color: var(--text); font-size: 16px; margin-right: 4px; }'));
  assert.ok(src.includes('background: linear-gradient(135deg, rgba(248, 81, 73, 0.14), rgba(248, 81, 73, 0.05))'));
  assert.ok(src.includes('class="side"'));
  assert.ok(src.includes('class="cockpit"'));
  assert.ok(src.includes('improvements-board-node'));
  assert.ok(src.includes('/health'));
  assert.ok(src.includes('左侧树切换 · 选择会记住'));
});
