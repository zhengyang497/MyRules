const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { seedCacheContent } = require('./helpers/cache-seed');
const ruleTargets = require('../tools/sync/lib/rule-targets');
const transform = require('../tools/sync/lib/transform');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeCache() {
  const cache = tmp('myrules-rtargets-cache-');
  seedCacheContent(cache);
  return cache;
}

function optsFor(project) {
  return {
    claudeUserDir: path.join(project, '.fake-claude-home', 'rules'),
    opencodeUserDir: path.join(project, '.fake-opencode-home', 'rules'),
    dshUserDir: path.join(project, '.fake-dsh-home', 'rules'),
  };
}

test('ruleTargets enumerates 5 targets for a user rule and 4 for a project rule', () => {
  const cache = makeCache();
  const project = tmp('myrules-rtargets-proj-');
  const targets = ruleTargets.ruleTargets(cache, project, optsFor(project));
  const user = targets.filter((t) => t.stateKey.includes('myrules-user-behavior'));
  const proj = targets.filter((t) => t.stateKey.includes('myrules-testing'));
  assert.strictEqual(user.length, 5, JSON.stringify(user.map((t) => t.stateKey)));
  assert.strictEqual(proj.length, 4, JSON.stringify(proj.map((t) => t.stateKey)));
});

test('ruleTargets state keys match deploy convention exactly', () => {
  const cache = makeCache();
  const project = tmp('myrules-rtargets-keys-');
  const o = optsFor(project);
  const targets = ruleTargets.ruleTargets(cache, project, o);
  const keys = targets.map((t) => t.stateKey).sort();
  for (const expect of [
    '.cursor/rules/myrules-testing.mdc',
    '.claude/rules/myrules-testing.md',
    '.opencode/rules/myrules-testing.md',
    '.dsh/rules/myrules-testing.md',
    '.cursor/rules/myrules-user-behavior.mdc',
    '~claude-user~/myrules-user-behavior.md',
    '~opencode-user~/myrules-user-behavior.md',
    '~dsh-user~/myrules-user-behavior.md',
    '.opencode/rules/myrules-user-behavior.md',
  ]) {
    assert.ok(keys.includes(expect), `missing ${expect} in ${JSON.stringify(keys)}`);
  }
  // user 规则的 claude/opencode/dsh 目标落在 fake 用户目录里
  const claudeUser = targets.find((t) => t.stateKey === '~claude-user~/myrules-user-behavior.md');
  assert.strictEqual(claudeUser.abs, path.join(o.claudeUserDir, 'myrules-user-behavior.md'));
});

test('ruleTargets skips rules with runtimes frontmatter (sub-agent only)', () => {
  const cache = makeCache();
  fs.writeFileSync(
    path.join(cache, 'rules', 'project', 'agent-only.md'),
    '---\nruntimes: [agent]\n---\n\n# Only for agents'
  );
  const project = tmp('myrules-rtargets-runtime-');
  const targets = ruleTargets.ruleTargets(cache, project, optsFor(project));
  assert.ok(!targets.some((t) => t.sourceAbs.endsWith('agent-only.md')));
});

test('emittedRuleContent: cursor targets get generated frontmatter, .md targets are bare body', () => {
  const cache = makeCache();
  const project = tmp('myrules-rtargets-emit-');
  const targets = ruleTargets.ruleTargets(cache, project, optsFor(project));
  const cursor = targets.find((t) => t.stateKey === '.cursor/rules/myrules-testing.mdc');
  const claude = targets.find((t) => t.stateKey === '.claude/rules/myrules-testing.md');
  const raw = fs.readFileSync(cursor.sourceAbs, 'utf8');
  const body = transform.parseRuleFrontmatter(raw).body;
  assert.strictEqual(ruleTargets.emittedRuleContent(cursor, raw), transform.transformForCursor(body, 'testing'));
  assert.strictEqual(ruleTargets.emittedRuleContent(claude, raw), body);
});
