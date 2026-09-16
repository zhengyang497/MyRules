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

test('handle allows the subagent and does not emit unofficial fields', () => {
  const out = hook.handle({ subagent_type: 'myrules-publisher' });
  assert.deepStrictEqual(out, { permission: 'allow' });
  assert.strictEqual(out.additional_context, undefined);
  assert.strictEqual(out.user_message, undefined);
  assert.strictEqual(typeof hook.detectRole, 'undefined');
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

test('stdin malformed JSON still prints permission allow', () => {
  const output = execFileSync('node', [HOOK_PATH], {
    input: 'not valid json',
    encoding: 'utf8',
  });
  assert.deepStrictEqual(JSON.parse(output.trim()), { permission: 'allow' });
});
