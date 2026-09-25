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
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'agent', 'rules', 'myrules-method-small.mdc')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'agent', 'rules', 'myrules-method-session.mdc')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'project', 'rules', 'myrules-method-small.mdc')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'method', 'project', 'rules', 'myrules-method-session.mdc')));
  const coordRule = fs.readFileSync(
    path.join(REPO_ROOT, 'method', 'project', 'rules', 'myrules-method-coordinator.mdc'),
    'utf8'
  );
  assert.match(coordRule, /alwaysApply:\s*false/);
  const small = fs.readFileSync(path.join(REPO_ROOT, 'method', 'project', 'rules', 'myrules-method-small.mdc'), 'utf8');
  assert.match(small, /alwaysApply:\s*true/);
  assert.match(small, /当前主会话直接改/);
  assert.match(skill, /琐碎改动却派了 Task\/子代理或开了卡/);
  assert.match(skill, /publisher 被禁止改文首/);
  const methodDoc = fs.readFileSync(path.join(REPO_ROOT, 'method', 'core', '项目工作法.md'), 'utf8');
  assert.match(methodDoc, /琐碎改动却派了 Task\/子代理或开了卡/);
  assert.doesNotMatch(methodDoc, /琐碎改动却派了 Task[^\n]*仅 Project/);
  assert.match(methodDoc, /publisher 被禁止改文首[^\n]*仅 Project/);
  const firstMessage = fs.readFileSync(
    path.join(REPO_ROOT, 'method', 'project', 'FIRST-MESSAGE.md'),
    'utf8'
  );
  assert.match(firstMessage, /myrules-implementer/);
  assert.match(firstMessage, /任务正文/);
  assert.match(firstMessage, /角色纪律/);
  assert.doesNotMatch(firstMessage, /禁止用无名/);
  const charter = fs.readFileSync(path.join(REPO_ROOT, 'method', 'project', 'coordinator.md'), 'utf8');
  assert.match(charter, /任务正文/);
  assert.match(charter, /角色纪律/);
  assert.doesNotMatch(charter, /禁止用无名/);
  assert.match(charter, /不会走本地 subagentStart/);
  assert.match(charter, /闸门只认/);
  assert.match(charter, /STATUS/);
  const session = fs.readFileSync(
    path.join(REPO_ROOT, 'method', 'project', 'rules', 'myrules-method-session.mdc'),
    'utf8'
  );
  assert.match(session, /产品/);
  assert.match(session, /first-message/);
  assert.doesNotMatch(session, /禁止写业务代码/);
  assert.match(skill, /未加前缀/);
  assert.match(skill, /项目工作法\.md/);
  assert.match(skill, /本地主会话.*写文首|自己写文首/);
  const runtime = fs.readFileSync(path.join(REPO_ROOT, 'method', 'project', 'runtime.md'), 'utf8');
  assert.match(runtime, /本地主会话/);
  assert.match(runtime, /publisher/);
  assert.doesNotMatch(runtime, /已有\*\*已出版\*\*口号/);
  const overlayNote = fs.readFileSync(
    path.join(REPO_ROOT, 'method', 'core', '项目工作法.md'),
    'utf8'
  );
  assert.match(overlayNote, /STATUS 探路却派了 implementer/);
  assert.match(overlayNote, /角色纪律/);
});

test('project-method reference branches board paths and close-out by runtime', () => {
  const ref = fs.readFileSync(
    path.join(REPO_ROOT, 'method', 'skills', 'project-method', 'reference.md'),
    'utf8'
  );
  assert.match(ref, /### project[\s\S]*ledger\/board/);
  const projectClose = ref.match(/### project 收工\r?\n([\s\S]*?)(?=\r?\n## |\r?\n### |\s*$)/);
  assert.ok(projectClose, 'missing ### project 收工');
  assert.doesNotMatch(projectClose[1], /npm run board -- patch/);
  const agentClose = ref.match(/### agent 收工\r?\n([\s\S]*?)(?=\r?\n## |\r?\n### )/);
  assert.ok(agentClose, 'missing ### agent 收工');
  assert.match(agentClose[1], /npm run board -- patch/);
  const flow2 = ref.match(/## 流程二：借鉴现成系统\r?\n([\s\S]*?)(?=\r?\n## )/);
  assert.ok(flow2, 'missing ## 流程二');
  const projectPublish = flow2[1].match(/\*\*project[：:]\*\*([^\n]+)/);
  assert.ok(projectPublish, 'missing **project：** in 流程二');
  assert.match(projectPublish[1], /myrules-publisher/);
  assert.match(projectPublish[1], /本地主会话/);
  assert.doesNotMatch(projectPublish[1], /npm run board/);
  assert.doesNotMatch(ref, /coordinator 和本地主会话不要自己改文首/);
  assert.match(ref, /未加前缀/);
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

test('seat arbitration is project-only and agent variants stay a line-subset of project', () => {
  const read = (runtime, name) =>
    fs.readFileSync(path.join(REPO_ROOT, 'method', runtime, 'rules', name), 'utf8');
  const agentSession = read('agent', 'myrules-method-session.mdc');
  const projectSession = read('project', 'myrules-method-session.mdc');
  const agentSmall = read('agent', 'myrules-method-small.mdc');
  const projectSmall = read('project', 'myrules-method-small.mdc');

  assert.doesNotMatch(agentSession, /coordinator|first-message|经理/);
  assert.doesNotMatch(agentSmall, /coordinator|first-message|经理/);
  assert.match(projectSession, /默认你不是 coordinator/);
  assert.match(projectSession, /若你是 coordinator：按章程派工/);
  assert.match(projectSmall, /例外：若你是/);

  // 共享正文防漂移：agent 版每一行都必须原样出现在 project 版里
  for (const [agent, project, name] of [
    [agentSession, projectSession, 'session'],
    [agentSmall, projectSmall, 'small'],
  ]) {
    for (const line of agent.split(/\r?\n/)) {
      if (!line.trim()) continue;
      assert.ok(project.includes(line), `project ${name} variant drifted from agent variant: ${line}`);
    }
  }
});
