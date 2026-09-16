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

test('detectRole uses named seat fields, not charter text', () => {
  assert.strictEqual(hook.detectRole({ subagent_type: 'myrules-publisher' }), 'publisher');
  assert.strictEqual(hook.detectRole({ subagent_type: 'myrules-implementer' }), 'implementer');
  assert.strictEqual(hook.detectRole({ agent_type: 'myrules-implementer' }), 'implementer');
  assert.strictEqual(hook.detectRole({ name: 'myrules-researcher' }), 'researcher');
  assert.strictEqual(hook.detectRole({ agent: 'myrules-reviewer' }), 'reviewer');
  assert.strictEqual(hook.detectRole({ subagent_type: 'myrules-planner' }), 'planner');
});

test('detectRole does not treat generalPurpose charter lists as publisher', () => {
  assert.notStrictEqual(
    hook.detectRole({
      subagent_type: 'generalPurpose',
      task: '按章程派 myrules-implementer 改代码，不要用 myrules-publisher',
    }),
    'publisher'
  );
  assert.strictEqual(
    hook.detectRole({
      subagent_type: 'generalPurpose',
      task: '用 myrules-implementer 改代码',
    }),
    'implementer'
  );
  assert.strictEqual(
    hook.detectRole({
      subagent_type: 'generalPurpose',
      task: '读章程：researcher、implementer、reviewer、publisher 都有',
    }),
    'unknown'
  );
});

test('handle allows the subagent and does not emit unofficial fields', () => {
  const out = hook.handle({ subagent_type: 'myrules-publisher' });
  assert.deepStrictEqual(out, { permission: 'allow' });
  assert.strictEqual(out.additional_context, undefined);
  assert.strictEqual(out.user_message, undefined);
});

test('stdin JSON is only permission allow', () => {
  const output = execFileSync('node', [HOOK_PATH], {
    input: JSON.stringify({ subagent_type: 'myrules-publisher' }),
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output);
  assert.strictEqual(parsed.permission, 'allow');
  assert.strictEqual(parsed.additional_context, undefined);
  assert.deepStrictEqual(Object.keys(parsed).sort(), ['permission']);
});
