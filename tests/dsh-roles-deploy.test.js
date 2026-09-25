const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const roles = require('../tools/sync/lib/dsh-roles-deploy');

const fakeRoles = {
  planner: { description: 'Plans work.', readonly: true, model: 'inherit' },
  implementer: { description: 'Implements code.', readonly: false, model: 'inherit' },
  reviewer: { description: 'Reviews code.', readonly: true, model: 'inherit' },
};

const fakeManifest = {
  managedPrefix: 'myrules-',
  dsh: { rolesRowsFile: '.dsh/roles-tool-rows.yml' },
  agents: {
    prefix: 'myrules-',
    roles: fakeRoles,
    byRuntime: { agent: ['planner', 'implementer', 'reviewer'], project: ['implementer'] },
  },
};

test('toolNameForRole uses snake case like dsh tool names', () => {
  assert.strictEqual(roles.toolNameForRole('myrules-', 'planner'), 'subagent_planner');
  assert.strictEqual(roles.toolNameForRole('myrules-', 'co-pilot'), 'subagent_co_pilot');
});

test('buildRoleToolRowsYaml emits one dsh-tool-subagent row per role with lean persona', () => {
  const yaml = roles.buildRoleToolRowsYaml({ agentPrefix: 'myrules-', roles: fakeRoles });

  assert.strictEqual((yaml.match(/- name: '@deepseek-ai\/dsh-tool-subagent'/g) || []).length, 3);
  assert.match(yaml, /toolName: subagent_planner/);
  assert.match(yaml, /toolName: subagent_implementer/);
  assert.match(yaml, /provider: spawn/);
  assert.match(yaml, /maxDepth: 1/);
  assert.match(yaml, /persona: \|-\n      你是 myrules-planner。/);
  assert.match(yaml, /MyRules never edits profiles automatically/);
});

test('buildRoleToolRowsYaml comments out toolFilter for readonly roles and never emits it live', () => {
  const yaml = roles.buildRoleToolRowsYaml({ agentPrefix: 'myrules-', roles: fakeRoles });

  assert.match(yaml, /# toolFilter:/);
  assert.doesNotMatch(yaml, /^\s+toolFilter:/m);
  // readonly 角色有 toolFilter 提示，非 readonly 没有
  const implementerBlock = yaml.slice(yaml.indexOf('toolName: subagent_implementer'));
  assert.doesNotMatch(implementerBlock.split('- name:')[0], /toolFilter/);
});

test('buildExtraSections returns roles table and team rules referencing role files', () => {
  const sections = roles.buildExtraSections({ agentPrefix: 'myrules-', roles: fakeRoles });

  assert.strictEqual(sections.length, 2);
  const [table, team] = sections;
  assert.match(table.topic, /角色工具表/);
  assert.match(table.body, /subagent_reviewer/);
  assert.match(table.body, /`myrules-reviewer`/);
  assert.match(table.body, /read.*\.dsh\/agents\//);
  assert.match(team.topic, /组队规则/);
  assert.match(team.body, /spawn_teammate/);
  assert.match(team.body, /read/);
  assert.match(team.body, /\.dsh\/agents\//);
  assert.match(team.body, /writeScopes/);
});

test('buildExtraSections returns empty when there are no roles', () => {
  assert.deepStrictEqual(roles.buildExtraSections({ agentPrefix: 'myrules-', roles: {} }), []);
});

test('deployRoleToolRows writes the scaffold and is idempotent', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-roles-proj-'));
  const first = roles.deployRoleToolRows(project, { manifest: fakeManifest, runtime: 'agent' });
  assert.strictEqual(first.wrote, true);
  assert.ok(fs.existsSync(path.join(project, '.dsh', 'roles-tool-rows.yml')));

  const second = roles.deployRoleToolRows(project, { manifest: fakeManifest, runtime: 'agent' });
  assert.strictEqual(second.wrote, false);
});

test('deployRoleToolRows filters roles by runtime', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-roles-proj-'));
  roles.deployRoleToolRows(project, { manifest: fakeManifest, runtime: 'project' });

  const text = fs.readFileSync(path.join(project, '.dsh', 'roles-tool-rows.yml'), 'utf8');
  assert.match(text, /subagent_implementer/);
  assert.doesNotMatch(text, /subagent_planner/);
});
