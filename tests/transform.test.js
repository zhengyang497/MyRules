const { test } = require('node:test');
const assert = require('node:assert');
const transform = require('../tools/sync/lib/transform');

test('transformForCursor adds alwaysApply frontmatter and keeps body', () => {
  const out = transform.transformForCursor('# Hello\n\n- one\n- two', 'greeting');
  assert.match(out, /alwaysApply: true/);
  assert.match(out, /description: "MyRules: greeting"/);
  assert.match(out, /# Hello/);
  assert.match(out, /- one/);
});

test('transformForClaude returns the body unchanged, no frontmatter added', () => {
  const out = transform.transformForClaude('# Hello\n\n- one');
  assert.strictEqual(out, '# Hello\n\n- one');
  assert.doesNotMatch(out, /alwaysApply/);
});

test('stripCursorFrontmatter removes the frontmatter block and keeps the body', () => {
  const mdc = '---\ndescription: "MyRules: greeting"\nalwaysApply: true\n---\n\n# Hello\n\n- one';
  const body = transform.stripCursorFrontmatter(mdc);
  assert.strictEqual(body, '# Hello\n\n- one');
});

test('stripCursorFrontmatter returns content unchanged if there is no frontmatter', () => {
  const plain = '# Hello\n\n- one';
  assert.strictEqual(transform.stripCursorFrontmatter(plain), plain);
});

test('transformHookForClaude renders event, description, and a no-automation note', () => {
  const out = transform.transformHookForClaude(
    { event: 'sessionStart', description: 'Read the status file.' },
    'session-start-context'
  );
  assert.match(out, /## Hook: session-start-context/);
  assert.match(out, /sessionStart/);
  assert.match(out, /Read the status file\./);
  assert.match(out, /no automatic trigger/);
});

test('parseRuleFrontmatter extracts agents list and body', () => {
  const content = '---\nagents: [implementer, reviewer]\n---\n\n# Testing\n\n- run tests';
  const parsed = transform.parseRuleFrontmatter(content);
  assert.deepStrictEqual(parsed.agents, ['implementer', 'reviewer']);
  assert.strictEqual(parsed.body, '# Testing\n\n- run tests');
});

test('parseRuleFrontmatter treats missing frontmatter as agents null', () => {
  const content = '# Plain\n\n- no frontmatter';
  const parsed = transform.parseRuleFrontmatter(content);
  assert.strictEqual(parsed.agents, null);
  assert.strictEqual(parsed.body, content);
});

test('parseRuleFrontmatter supports agents: all', () => {
  const content = '---\nagents: all\n---\n\n# Body';
  const parsed = transform.parseRuleFrontmatter(content);
  assert.strictEqual(parsed.agents, 'all');
});

test('stripRuleFrontmatter removes YAML block', () => {
  const content = '---\nagents: [planner]\n---\n\n# Plan';
  assert.strictEqual(transform.stripRuleFrontmatter(content), '# Plan');
});

test('roleMatchesAgents matches explicit roles and all', () => {
  assert.strictEqual(transform.roleMatchesAgents(['implementer'], 'implementer'), true);
  assert.strictEqual(transform.roleMatchesAgents(['implementer'], 'planner'), false);
  assert.strictEqual(transform.roleMatchesAgents('all', 'reviewer'), true);
  assert.strictEqual(transform.roleMatchesAgents(null, 'implementer'), false);
});

test('transformForAgent builds Cursor agent with readonly and composed sections', () => {
  const out = transform.transformForAgent({
    roleMeta: { description: 'Plans work.', readonly: true, model: 'inherit' },
    roleId: 'planner',
    agentName: 'myrules-planner',
    userBodies: [{ topic: 'preferences', body: '# Preferences\n\n- concise' }],
    projectBodies: [{ topic: 'planning', body: '# Planning\n\n- clarify' }],
    platform: 'cursor',
  });
  assert.match(out, /^---\nname: "myrules-planner"/);
  assert.match(out, /description: "Plans work\."/);
  assert.match(out, /readonly: true/);
  assert.match(out, /model: "inherit"/);
  assert.match(out, /## user: preferences/);
  assert.match(out, /## project: planning/);
  assert.doesNotMatch(out, /permissionMode/);
});

test('transformForAgent builds Claude agent with permissionMode plan for readonly roles', () => {
  const planner = transform.transformForAgent({
    roleMeta: { description: 'Plans work.', readonly: true, model: 'inherit' },
    roleId: 'planner',
    agentName: 'myrules-planner',
    userBodies: [],
    projectBodies: [],
    platform: 'claude',
  });
  assert.match(planner, /permissionMode: "plan"/);
  assert.doesNotMatch(planner, /readonly/);

  const implementer = transform.transformForAgent({
    roleMeta: { description: 'Implements.', readonly: false, model: 'inherit' },
    roleId: 'implementer',
    agentName: 'myrules-implementer',
    userBodies: [],
    projectBodies: [],
    platform: 'claude',
  });
  assert.match(implementer, /permissionMode: "default"/);
});
