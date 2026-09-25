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
  assert.match(out, /^---\nname: myrules-planner/);
  assert.match(out, /description: Plans work\./);
  assert.match(out, /readonly: true/);
  assert.match(out, /model: inherit/);
  assert.match(out, /## user: preferences/);
  assert.match(out, /## project: planning/);
  assert.doesNotMatch(out, /permissionMode/);
});

test('cursor agent plain output folds ": " to " - " so the unquoted scalar stays valid YAML', () => {
  const out = transform.transformForAgent({
    roleMeta: { description: 'Plans work: clarify requirements, decompose tasks. Do not: skip tests.', readonly: true, model: 'inherit' },
    roleId: 'planner',
    agentName: 'myrules-planner',
    userBodies: [],
    projectBodies: [],
    platform: 'cursor',
  });
  assert.match(out, /description: Plans work - clarify requirements, decompose tasks. Do not - skip tests\./);
  assert.doesNotMatch(out, /description:.*: /);

  // claude/dsh 带引号，原样保留冒号
  for (const platform of ['claude', 'dsh']) {
    const quoted = transform.transformForAgent({
      roleMeta: { description: 'Plans work: clarify', readonly: true, model: 'inherit' },
      roleId: 'planner',
      agentName: 'myrules-planner',
      userBodies: [],
      projectBodies: [],
      platform,
    });
    assert.match(quoted, /description: "Plans work: clarify"/, platform);
  }
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

test('transformForOpencode returns the body unchanged', () => {
  const out = transform.transformForOpencode('# Hello\n\n- one');
  assert.strictEqual(out, '# Hello\n\n- one');
});

test('transformForAgent with platform opencode emits description, mode subagent, and permission deny for readonly role', () => {
  const out = transform.transformForAgent({
    roleMeta: { description: 'Reviews code', readonly: true, model: 'inherit' },
    roleId: 'reviewer',
    agentName: 'myrules-reviewer',
    userBodies: [{ topic: 'preferences', body: '- be concise' }],
    projectBodies: [{ topic: 'testing', body: '- write tests' }],
    platform: 'opencode',
  });
  assert.match(out, /description: "Reviews code"/);
  assert.match(out, /mode: subagent/);
  assert.match(out, /edit: deny/);
  assert.match(out, /bash: deny/);
  assert.doesNotMatch(out, /^\s*name:/m);
  assert.doesNotMatch(out, /model:/);
  assert.match(out, /## user: preferences/);
  assert.match(out, /## project: testing/);
});

test('transformForAgent with platform opencode omits permission for non-readonly role', () => {
  const out = transform.transformForAgent({
    roleMeta: { description: 'Implements code', readonly: false, model: 'inherit' },
    roleId: 'implementer',
    agentName: 'myrules-implementer',
    userBodies: [],
    projectBodies: [],
    platform: 'opencode',
  });
  assert.match(out, /mode: subagent/);
  assert.doesNotMatch(out, /permission:/);
  assert.doesNotMatch(out, /model:/);
});

test('transformForAgent cursor and claude outputs retain name and model fields after opencode refactor', () => {
  for (const platform of ['cursor', 'claude']) {
    const out = transform.transformForAgent({
      roleMeta: { description: 'Does work.', readonly: true, model: 'inherit' },
      roleId: 'reviewer',
      agentName: 'myrules-reviewer',
      userBodies: [],
      projectBodies: [],
      platform,
    });
    // cursor 的加载器把引号当值的一部分，头栏出裸值；claude 照旧带引号
    const nameLine = platform === 'cursor' ? 'name: myrules-reviewer' : 'name: "myrules-reviewer"';
    const modelLine = platform === 'cursor' ? 'model: inherit' : 'model: "inherit"';
    assert.match(out, new RegExp(nameLine), `${platform} missing name field`);
    assert.match(out, new RegExp(modelLine), `${platform} missing model field`);
  }
});

test('transformForDsh returns the body unchanged', () => {
  const out = transform.transformForDsh('# Hello\n\n- one');
  assert.strictEqual(out, '# Hello\n\n- one');
});

test('transformForAgent with platform dsh emits a role file with name, description, and readonly frontmatter', () => {
  const out = transform.transformForAgent({
    roleMeta: { description: 'Reviews code', readonly: true, model: 'inherit' },
    roleId: 'reviewer',
    agentName: 'myrules-reviewer',
    userBodies: [{ topic: 'preferences', body: '- be concise' }],
    projectBodies: [{ topic: 'testing', body: '- write tests' }],
    platform: 'dsh',
  });
  assert.match(out, /^---\n/);
  assert.match(out, /name: "myrules-reviewer"/);
  assert.match(out, /description: "Reviews code"/);
  assert.match(out, /readonly: true/);
  assert.doesNotMatch(out, /model:/);
  assert.doesNotMatch(out, /permissionMode:/);
  assert.doesNotMatch(out, /mode:/);
  assert.match(out, /## user: preferences/);
  assert.match(out, /## project: testing/);
});

test('transformForAgent with platform dsh marks non-readonly roles readonly: false', () => {
  const out = transform.transformForAgent({
    roleMeta: { description: 'Implements code', readonly: false, model: 'inherit' },
    roleId: 'implementer',
    agentName: 'myrules-implementer',
    userBodies: [],
    projectBodies: [],
    platform: 'dsh',
  });
  assert.match(out, /readonly: false/);
});

test('transformForAgent cursor, claude, and opencode outputs are unchanged by the dsh branch', () => {
  const base = {
    roleMeta: { description: 'Plans work.', readonly: true, model: 'inherit' },
    roleId: 'planner',
    agentName: 'myrules-planner',
    userBodies: [{ topic: 'preferences', body: '- be concise' }],
    projectBodies: [],
  };
  const cursor = transform.transformForAgent({ ...base, platform: 'cursor' });
  assert.strictEqual(
    cursor,
    '---\nname: myrules-planner\ndescription: Plans work.\nmodel: inherit\nreadonly: true\n---\n\n## user: preferences\n\n- be concise'
  );
  const claude = transform.transformForAgent({ ...base, platform: 'claude' });
  assert.strictEqual(
    claude,
    '---\nname: "myrules-planner"\ndescription: "Plans work."\nmodel: "inherit"\npermissionMode: "plan"\n---\n\n## user: preferences\n\n- be concise'
  );
  const opencode = transform.transformForAgent({ ...base, platform: 'opencode' });
  assert.match(opencode, /^---\ndescription: "Plans work."\nmode: subagent\n/);
});
