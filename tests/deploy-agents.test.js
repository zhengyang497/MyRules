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
