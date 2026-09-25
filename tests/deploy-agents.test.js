const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const deployAgents = require('../tools/sync/lib/deploy-agents');
const loadManifest = require('../tools/sync/lib/load-manifest');
const { seedCacheContent } = require('./helpers/cache-seed');

function makeCache() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-agents-cache-'));
  seedCacheContent(cache);
  fs.writeFileSync(path.join(cache, 'rules', 'user', 'preferences.md'), '# Preferences\n\n- be concise');
  fs.writeFileSync(
    path.join(cache, 'rules', 'project', 'coding-standards.md'),
    '---\nagents: [implementer]\n---\n\n# Coding\n\n- match style'
  );
  fs.writeFileSync(
    path.join(cache, 'rules', 'project', 'testing.md'),
    '---\nagents: [implementer, reviewer]\n---\n\n# Testing\n\n- write tests'
  );
  fs.writeFileSync(
    path.join(cache, 'rules', 'project', 'planning.md'),
    '---\nagents: [planner]\n---\n\n# Planning\n\n- clarify first'
  );
  return cache;
}

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-agents-project-'));
}

test('deployAgents writes three role bundles for Cursor and Claude', () => {
  const cache = makeCache();
  const project = makeProject();
  const manifest = loadManifest.loadManifest(cache);
  const result = deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: {}, manifest });

  for (const role of ['planner', 'implementer', 'reviewer']) {
    const cursorFile = path.join(project, '.cursor', 'agents', `myrules-${role}.md`);
    const claudeFile = path.join(project, '.claude', 'agents', `myrules-${role}.md`);
    assert.ok(fs.existsSync(cursorFile), `missing ${cursorFile}`);
    assert.ok(fs.existsSync(claudeFile), `missing ${claudeFile}`);
  }

  const planner = fs.readFileSync(path.join(project, '.cursor', 'agents', 'myrules-planner.md'), 'utf8');
  assert.match(planner, /readonly: true/);
  assert.match(planner, /## user: preferences/);
  assert.match(planner, /## project: planning/);
  assert.doesNotMatch(planner, /## project: coding-standards/);

  const implementer = fs.readFileSync(path.join(project, '.cursor', 'agents', 'myrules-implementer.md'), 'utf8');
  assert.match(implementer, /readonly: false/);
  assert.match(implementer, /## project: coding-standards/);
  assert.match(implementer, /## project: testing/);
  assert.doesNotMatch(implementer, /## project: planning/);

  const reviewer = fs.readFileSync(path.join(project, '.cursor', 'agents', 'myrules-reviewer.md'), 'utf8');
  assert.match(reviewer, /## project: testing/);
  assert.doesNotMatch(reviewer, /## project: coding-standards/);

  assert.strictEqual(result.drifted.length, 0);
  assert.strictEqual(result.missingAgents.length, 0);
});

test('deployAgents skips project rules without agents frontmatter and warns via missingAgents', () => {
  const cache = makeCache();
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'untagged.md'), '# Untagged\n\n- no agents');
  const project = makeProject();
  const result = deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: {} });
  assert.ok(result.missingAgents.includes('untagged.md'));
});

test('deployAgents respects drift unless force is true', () => {
  const cache = makeCache();
  const project = makeProject();
  const first = deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: {} });
  const agentFile = path.join(project, '.cursor', 'agents', 'myrules-planner.md');
  fs.writeFileSync(agentFile, 'hand-edited agent');

  const second = deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: first.hashes });
  assert.ok(second.drifted.includes(agentFile));
  assert.strictEqual(fs.readFileSync(agentFile, 'utf8'), 'hand-edited agent');

  deployAgents.deployAgents(cache, project, { force: true, priorAgentHashes: first.hashes });
  assert.match(fs.readFileSync(agentFile, 'utf8'), /## project: planning/);
});

test('deployAgents removes stale agent files from prior deploys', () => {
  const cache = makeCache();
  const project = makeProject();
  const cursorDir = path.join(project, '.cursor', 'agents');
  fs.mkdirSync(cursorDir, { recursive: true });
  const staleFile = path.join(cursorDir, 'myrules-obsolete.md');
  fs.writeFileSync(staleFile, 'old role');

  deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: {} });
  assert.strictEqual(fs.existsSync(staleFile), false);
});

test('deployAgents writes dsh role files with role-file frontmatter', () => {
  const cache = makeCache();
  const project = makeProject();
  const manifest = loadManifest.loadManifest(cache);
  deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: {}, manifest });

  for (const role of ['planner', 'implementer', 'reviewer']) {
    const dshFile = path.join(project, '.dsh', 'agents', `myrules-${role}.md`);
    assert.ok(fs.existsSync(dshFile), `missing ${dshFile}`);
  }

  const reviewer = fs.readFileSync(path.join(project, '.dsh', 'agents', 'myrules-reviewer.md'), 'utf8');
  assert.match(reviewer, /^---\n/);
  assert.match(reviewer, /name: "myrules-reviewer"/);
  assert.match(reviewer, /description: /);
  assert.match(reviewer, /readonly: true/);
  assert.match(reviewer, /## user: preferences/);
  assert.match(reviewer, /## project: testing/);
  assert.doesNotMatch(reviewer, /permissionMode:/);
  assert.doesNotMatch(reviewer, /^\s*mode:/m);
  assert.doesNotMatch(reviewer, /model:/);
});

test('deployAgents dsh role files get worker footers under project runtime', () => {
  const cache = makeCache();
  const project = makeProject();
  const manifest = loadManifest.loadManifest(cache);
  deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: {}, manifest, runtime: 'project' });

  const implementer = path.join(project, '.dsh', 'agents', 'myrules-implementer.md');
  assert.ok(fs.existsSync(implementer), `missing ${implementer}`);
  assert.match(fs.readFileSync(implementer, 'utf8'), /工人纪律/);
});

test('deployAgents removes stale dsh role files', () => {
  const cache = makeCache();
  const project = makeProject();
  const manifest = loadManifest.loadManifest(cache);
  const dshDir = path.join(project, '.dsh', 'agents');
  fs.mkdirSync(dshDir, { recursive: true });
  const stale = path.join(dshDir, 'myrules-obsolete.md');
  fs.writeFileSync(stale, 'old role');

  deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: {}, manifest });
  assert.strictEqual(fs.existsSync(stale), false);
});

test('deployAgents cursor and claude outputs stay byte-identical after dsh addition', () => {
  const cache = makeCache();
  const project = makeProject();
  const manifest = loadManifest.loadManifest(cache);
  deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: {}, manifest });

  const planner = fs.readFileSync(path.join(project, '.cursor', 'agents', 'myrules-planner.md'), 'utf8');
  assert.ok(planner.startsWith('---\nname: "myrules-planner"\ndescription: "Plans work: clarify requirements, decompose tasks, define scope. Use before implementation."\nmodel: "inherit"\nreadonly: true\n---\n'), planner.slice(0, 120));
  const claude = fs.readFileSync(path.join(project, '.claude', 'agents', 'myrules-reviewer.md'), 'utf8');
  assert.match(claude, /^---\nname: "myrules-reviewer"\ndescription: "Skeptical reviewer: verify claims, run tests, report pass\/fail\. Read-only\."\nmodel: "inherit"\npermissionMode: "plan"\n---\n/);
});

test('deployAgents cursor and claude outputs are byte-identical to pre-opencode baseline', () => {
  // Self-contained cache: do NOT use seedCacheContent - the snapshot must be
  // deterministic and not depend on the real repo's rules/ directory.
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-snap-agents-'));
  fs.mkdirSync(path.join(cache, 'rules', 'user'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'rules', 'project'), { recursive: true });
  fs.writeFileSync(path.join(cache, 'rules', 'user', 'preferences.md'), '# Preferences\n\n- be concise');
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'planning.md'), '---\nagents: [planner]\n---\n\n# Planning\n\n- clarify first');
  fs.writeFileSync(path.join(cache, 'manifest.js'),
    'module.exports = ' + JSON.stringify({
      managedPrefix: 'myrules-',
      agents: {
        roles: { planner: { description: 'Plans work.', readonly: true, model: 'inherit' } },
        prefix: 'myrules-',
        cursorDir: '.cursor/agents',
        claudeDir: '.claude/agents',
      },
    }) + ';\n'
  );

  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-snap-agents-proj-'));
  deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: {} });

  // Cursor planner agent
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.cursor', 'agents', 'myrules-planner.md'), 'utf8'),
    '---\nname: "myrules-planner"\ndescription: "Plans work."\nmodel: "inherit"\nreadonly: true\n---\n\n## user: preferences\n\n# Preferences\n\n- be concise\n\n## project: planning\n\n# Planning\n\n- clarify first'
  );
  // Claude planner agent
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.claude', 'agents', 'myrules-planner.md'), 'utf8'),
    '---\nname: "myrules-planner"\ndescription: "Plans work."\nmodel: "inherit"\npermissionMode: "plan"\n---\n\n## user: preferences\n\n# Preferences\n\n- be concise\n\n## project: planning\n\n# Planning\n\n- clarify first'
  );
});

test('deployAgents writes OpenCode agent files with mode: subagent and no name field', () => {
  const cache = makeCache();
  const project = makeProject();
  const result = deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: {} });

  for (const role of ['planner', 'implementer', 'reviewer']) {
    const ocFile = path.join(project, '.opencode', 'agents', `myrules-${role}.md`);
    assert.ok(fs.existsSync(ocFile), `missing ${ocFile}`);
  }

  const planner = fs.readFileSync(path.join(project, '.opencode', 'agents', 'myrules-planner.md'), 'utf8');
  assert.match(planner, /mode: subagent/);
  assert.match(planner, /edit: deny/);
  assert.doesNotMatch(planner, /^\s*name:/m);
  assert.doesNotMatch(planner, /model:/);

  const implementer = fs.readFileSync(path.join(project, '.opencode', 'agents', 'myrules-implementer.md'), 'utf8');
  assert.match(implementer, /mode: subagent/);
  assert.doesNotMatch(implementer, /permission:/);
});

test('project runtime worker footers differ by role', () => {
  const cache = makeCache();
  const project = makeProject();
  deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: {}, runtime: 'project' });

  const implementer = fs.readFileSync(path.join(project, '.cursor', 'agents', 'myrules-implementer.md'), 'utf8');
  assert.match(implementer, /禁止改现行目标册|禁止改目标册/);
  assert.doesNotMatch(implementer, /docs\/能力/);
  assert.match(implementer, /忽略 session 开场/);

  const publisher = fs.readFileSync(path.join(project, '.cursor', 'agents', 'myrules-publisher.md'), 'utf8');
  assert.match(publisher, /点头/);
  assert.doesNotMatch(publisher, /禁止改目标册/);

  const researcher = fs.readFileSync(path.join(project, '.cursor', 'agents', 'myrules-researcher.md'), 'utf8');
  assert.match(researcher, /只读/);
  assert.doesNotMatch(researcher, /禁止改目标册/);
});

test('deployAgents removes stale OpenCode agent files', () => {
  const cache = makeCache();
  const project = makeProject();
  const ocDir = path.join(project, '.opencode', 'agents');
  fs.mkdirSync(ocDir, { recursive: true });
  const staleFile = path.join(ocDir, 'myrules-obsolete.md');
  fs.writeFileSync(staleFile, 'old role');

  deployAgents.deployAgents(cache, project, { force: false, priorAgentHashes: {} });
  assert.strictEqual(fs.existsSync(staleFile), false);
});
