const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const hook = require('../hooks/project/subagent-start-worker');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'project', 'subagent-start-worker.js');

test('meta declares the subagentStart event', () => {
  assert.strictEqual(hook.meta.event, 'subagentStart');
  assert.ok(hook.meta.description.length > 0);
});

test('publisher is not told to never edit goals', () => {
  const out = hook.handle({ subagent_type: 'myrules-publisher' });
  assert.match(out.additional_context, /publisher/);
  assert.doesNotMatch(out.additional_context, /禁止改目标册/);
  assert.match(out.additional_context, /点头/);
});

test('implementer is told not to edit goals and to ignore session purpose', () => {
  const out = hook.handle({ agent_type: 'myrules-implementer' });
  assert.match(out.additional_context, /implementer/);
  assert.match(out.additional_context, /禁止改/);
  assert.match(out.additional_context, /忽略 session 开场/);
});

test('named subagent_type myrules-implementer is implementer, not publisher', () => {
  const out = hook.handle({ subagent_type: 'myrules-implementer' });
  assert.match(out.additional_context, /implementer/);
  assert.match(out.additional_context, /禁止改/);
  assert.doesNotMatch(out.additional_context, /改文首/);
});

test('researcher and reviewer stay read-only', () => {
  assert.match(hook.handle({ name: 'myrules-researcher' }).additional_context, /只读/);
  assert.match(hook.handle({ agent: 'myrules-reviewer' }).additional_context, /只读/);
  assert.doesNotMatch(hook.handle({ name: 'myrules-researcher' }).additional_context, /禁止改目标册/);
});

test('generalPurpose task naming one worker is not misread as publisher', () => {
  const mixed = hook.handle({
    subagent_type: 'generalPurpose',
    task: '按章程派 myrules-implementer 改代码，不要用 myrules-publisher',
  });
  assert.doesNotMatch(mixed.additional_context, /仅在人已点头后改文首/);
  assert.match(mixed.additional_context, /implementer|按角色文件做/);

  const single = hook.handle({
    subagent_type: 'generalPurpose',
    task: '用 myrules-implementer 改代码',
  });
  assert.match(single.additional_context, /implementer/);
  assert.match(single.additional_context, /禁止改/);
});

test('charter listing many roles in task is unknown, not publisher', () => {
  const out = hook.handle({
    subagent_type: 'generalPurpose',
    task: '读章程：researcher、implementer、reviewer、publisher 都有',
  });
  assert.match(out.additional_context, /按角色文件做/);
  assert.doesNotMatch(out.additional_context, /仅在人已点头后改文首/);
});

test('planner hook tells it not to expand one-line fixes', () => {
  const out = hook.handle({ subagent_type: 'myrules-planner' });
  assert.match(out.additional_context, /改一行|明显 bug/);
  assert.match(out.additional_context, /主会话/);
});

test('unknown role does not use the old one-size-fits-all goal ban', () => {
  const out = hook.handle({});
  assert.match(out.additional_context, /publisher/);
  assert.doesNotMatch(out.additional_context, /禁止改目标册/);
});

test('stdin JSON selects the matching role message', () => {
  const output = execFileSync('node', [HOOK_PATH], {
    input: JSON.stringify({ subagent_type: 'myrules-publisher' }),
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output);
  assert.strictEqual(parsed.permission, 'allow');
  assert.match(parsed.additional_context, /publisher/);
  assert.doesNotMatch(parsed.additional_context, /禁止改目标册/);
});

test('handle always allows the subagent while injecting context', () => {
  const out = hook.handle({ subagent_type: 'myrules-publisher' });
  assert.strictEqual(out.permission, 'allow');
  assert.match(out.additional_context, /点头/);
});
