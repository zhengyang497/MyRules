const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { seedCacheContent, REPO_ROOT, writeRuntime } = require('./helpers/cache-seed');
const initCli = require('../tools/sync/init-project-method');
const syncCli = require('../tools/sync/sync');
const installSkillCli = require('../tools/sync/install-skill');
const registry = require('../tools/sync/lib/registry');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function runGit(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeCacheRepo() {
  const cache = tmp('myrules-rt-cache-');
  seedCacheContent(cache);
  runGit(cache, ['init']);
  runGit(cache, ['config', 'user.email', 'test@example.com']);
  runGit(cache, ['config', 'user.name', 'Test']);
  runGit(cache, ['add', '-A']);
  runGit(cache, ['commit', '-m', 'init']);
  return cache;
}

function installSkill(project) {
  installSkillCli.run({ project, sourceDir: installSkillCli.getBundledRepoRoot() });
}

function syncOpts(project, cache) {
  return {
    project,
    cacheDir: cache,
    skipPull: true,
    skipSkills: true,
    skipUserConfig: true,
    skipEnsureCache: true,
    claudeUserDir: path.join(project, '.fake-claude-home', 'rules'),
    opencodeUserDir: path.join(project, '.fake-opencode-home', 'rules'),
    homeDir: path.join(project, '.fake-home'),
  };
}

function arrange(project, cache, runtime, extra = {}) {
  installSkill(project);
  return initCli.run({ ...syncOpts(project, cache), runtime, quiet: true, ...extra });
}

test('sync without runtime marker exits non-zero', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-none-');
  installSkill(project);
  assert.throws(() => syncCli.run(syncOpts(project, cache)), /Arrange the repo first|runtime/);
});

function methodMdc(project, name) {
  return fs.readFileSync(path.join(project, '.cursor', 'rules', name), 'utf8');
}

function alwaysApplyTrue(mdc) {
  const m = mdc.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? /^alwaysApply:\s*true\s*$/m.test(m[1]) : false;
}

function alwaysApplyMethodText(project) {
  const dir = path.join(project, '.cursor', 'rules');
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('myrules-method-') && f.endsWith('.mdc'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .filter(alwaysApplyTrue)
    .join('\n');
}

test('arrange agent writes runtime, empty ledger-less instance, agent rule, no coordinator ban', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-agent-');
  arrange(project, cache, 'agent');

  const marker = JSON.parse(fs.readFileSync(path.join(project, '.myrules-runtime.json'), 'utf8'));
  assert.strictEqual(marker.runtime, 'agent');
  assert.ok(fs.existsSync(path.join(project, 'docs', '方法', 'myrules-项目工作法.md')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-agent.mdc')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-small.mdc')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-session.mdc')));
  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-coordinator.mdc')), false);
  const agentRule = methodMdc(project, 'myrules-method-agent.mdc');
  assert.match(agentRule, /npm run board/);
  assert.doesNotMatch(agentRule, /禁止写业务代码/);
  assert.match(methodMdc(project, 'myrules-method-session.mdc'), /可以写业务代码/);
  assert.match(methodMdc(project, 'myrules-method-small.mdc'), /alwaysApply:\s*true/);
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'agents', 'myrules-planner.md')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'agents', 'myrules-implementer.md')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'agents', 'myrules-reviewer.md')));
  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'agents', 'myrules-researcher.md')), false);
  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'agents', 'myrules-publisher.md')), false);
  const pkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.scripts.board, 'node scripts/myrules-board.mjs');
  assert.ok(fs.existsSync(path.join(project, 'scripts', 'myrules-board.mjs')));
});

test('arrange project writes ledger, charter, coordinator rule, and small-edit alwaysApply', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-project-');
  arrange(project, cache, 'project');

  const marker = JSON.parse(fs.readFileSync(path.join(project, '.myrules-runtime.json'), 'utf8'));
  assert.strictEqual(marker.runtime, 'project');
  assert.match(fs.readFileSync(path.join(project, 'ledger', 'STATUS.md'), 'utf8'), /探路/);
  assert.ok(fs.existsSync(path.join(project, 'docs', '方法', 'myrules-coordinator.md')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-coordinator.mdc')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-small.mdc')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-session.mdc')));
  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-agent.mdc')), false);
  const coord = methodMdc(project, 'myrules-method-coordinator.mdc');
  assert.match(coord, /alwaysApply:\s*false/);
  assert.match(coord, /禁止写业务代码/);
  const small = methodMdc(project, 'myrules-method-small.mdc');
  assert.match(small, /alwaysApply:\s*true/);
  assert.match(small, /当前主会话直接改/);
  const session = methodMdc(project, 'myrules-method-session.mdc');
  assert.match(session, /alwaysApply:\s*true/);
  assert.match(session, /可以写业务代码/);
  assert.match(session, /产品/);
  assert.match(session, /first-message/);
  const alwaysApplyText = alwaysApplyMethodText(project);
  assert.doesNotMatch(alwaysApplyText, /禁止写业务代码/);
  assert.doesNotMatch(alwaysApplyText, /你是普通 Agent 主会话/);
  assert.match(coord, /STATUS/);
  assert.match(fs.readFileSync(path.join(project, 'docs', '方法', 'myrules-first-message.md'), 'utf8'), /琐碎改动/);
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'agents', 'myrules-researcher.md')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'agents', 'myrules-publisher.md')));
  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'agents', 'myrules-planner.md')), false);
  const env = JSON.parse(fs.readFileSync(path.join(project, '.cursor', 'environment.json'), 'utf8'));
  assert.match(env.install, /sync\.js.*--project/);
  assert.ok(fs.existsSync(path.join(project, 'docs', '方法', 'myrules-first-message.md')));
  const gitignore = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
  assert.doesNotMatch(gitignore, /^\.cursor\/agents\/myrules-\*$/m);
  assert.match(gitignore, /!\.cursor\/rules\/myrules-method-\*/);
});

test('arrange does not overwrite existing context, design goals, or board cards', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-keep-');
  write(path.join(project, '.myrules-context.md'), '当前目的：已有目的\n');
  write(path.join(project, 'docs', '能力', 'Foo', 'Foo设计目标.md'), '# keep goal\n');
  write(path.join(project, 'docs', '看板', 'items', 'item-1.md'), '---\nid: item-1\nstatus: todo\ntitle: keep\n---\n');
  write(path.join(project, 'docs', '设计目标检查清单.md'), '# keep checklist body\n');
  arrange(project, cache, 'agent');
  assert.strictEqual(fs.readFileSync(path.join(project, '.myrules-context.md'), 'utf8'), '当前目的：已有目的\n');
  assert.strictEqual(fs.readFileSync(path.join(project, 'docs', '能力', 'Foo', 'Foo设计目标.md'), 'utf8'), '# keep goal\n');
  assert.match(fs.readFileSync(path.join(project, 'docs', '看板', 'items', 'item-1.md'), 'utf8'), /keep/);
  assert.strictEqual(fs.readFileSync(path.join(project, 'docs', '设计目标检查清单.md'), 'utf8'), '# keep checklist body\n');
});

test('sync updates hosted method doc after cache edit and leaves context alone', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-sync-method-');
  arrange(project, cache, 'agent');
  write(path.join(project, '.myrules-context.md'), '当前目的：不动\n');
  const methodSrc = path.join(cache, 'method', 'core', '项目工作法.md');
  fs.appendFileSync(methodSrc, '\nSYNC_MARKER_LINE\n');
  runGit(cache, ['add', '-A']);
  runGit(cache, ['commit', '-m', 'tweak method']);
  syncCli.run(syncOpts(project, cache));
  assert.match(fs.readFileSync(path.join(project, 'docs', '方法', 'myrules-项目工作法.md'), 'utf8'), /SYNC_MARKER_LINE/);
  assert.strictEqual(fs.readFileSync(path.join(project, '.myrules-context.md'), 'utf8'), '当前目的：不动\n');
});

test('switching runtime stale-cleans hosted files and keeps ledger', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-switch-');
  arrange(project, cache, 'agent');
  write(path.join(project, 'docs', '看板', 'items', 'item-1.md'), '---\nid: item-1\nstatus: todo\ntitle: stay\n---\n');
  arrange(project, cache, 'project');
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-coordinator.mdc')));
  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-agent.mdc')), false);
  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'agents', 'myrules-planner.md')), false);
  assert.match(fs.readFileSync(path.join(project, 'docs', '看板', 'items', 'item-1.md'), 'utf8'), /stay/);
  write(path.join(project, 'ledger', 'ops', 'notes.md'), 'hand written ops\n');
  arrange(project, cache, 'agent');
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-agent.mdc')));
  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-coordinator.mdc')), false);
  assert.strictEqual(fs.readFileSync(path.join(project, 'ledger', 'ops', 'notes.md'), 'utf8'), 'hand written ops\n');
});

test('sync --all deploys matching role packs per registered runtime', () => {
  const cache = makeCacheRepo();
  const homeDir = tmp('myrules-rt-all-home-');
  const agentProj = tmp('myrules-rt-all-agent-');
  const projectProj = tmp('myrules-rt-all-project-');
  arrange(agentProj, cache, 'agent', { homeDir });
  arrange(projectProj, cache, 'project', { homeDir });
  syncCli.run({ ...syncOpts(agentProj, cache), homeDir, all: true });
  assert.ok(fs.existsSync(path.join(agentProj, '.cursor', 'agents', 'myrules-planner.md')));
  assert.strictEqual(fs.existsSync(path.join(agentProj, '.cursor', 'agents', 'myrules-publisher.md')), false);
  assert.ok(fs.existsSync(path.join(projectProj, '.cursor', 'agents', 'myrules-publisher.md')));
  assert.strictEqual(fs.existsSync(path.join(projectProj, '.cursor', 'agents', 'myrules-planner.md')), false);
});

test('force arrange still does not overwrite instance files', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-force-');
  arrange(project, cache, 'agent');
  write(path.join(project, '.myrules-context.md'), 'keep purpose\n');
  write(path.join(project, 'docs', '能力', 'Foo', 'Foo设计目标.md'), 'keep goal\n');
  arrange(project, cache, 'agent', { force: true });
  assert.strictEqual(fs.readFileSync(path.join(project, '.myrules-context.md'), 'utf8'), 'keep purpose\n');
  assert.strictEqual(fs.readFileSync(path.join(project, 'docs', '能力', 'Foo', 'Foo设计目标.md'), 'utf8'), 'keep goal\n');
});

test('unprefixed legacy 项目工作法.md is not overwritten', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-legacy-method-');
  write(path.join(project, 'docs', '方法', '项目工作法.md'), '# old copy once\n');
  arrange(project, cache, 'agent');
  assert.strictEqual(fs.readFileSync(path.join(project, 'docs', '方法', '项目工作法.md'), 'utf8'), '# old copy once\n');
  assert.ok(fs.existsSync(path.join(project, 'docs', '方法', 'myrules-项目工作法.md')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'skills', 'project-method', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-agent.mdc')));
});

test('init without --runtime fails', () => {
  const project = tmp('myrules-rt-noruntime-');
  assert.throws(() => initCli.run({ project, quiet: true }), /--runtime/);
});

test('legacy unprefixed method repo syncs as agent and writes runtime file', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-legacy-sync-');
  installSkill(project);
  write(path.join(project, 'docs', '方法', '项目工作法.md'), '# old\n');
  syncCli.run(syncOpts(project, cache));
  const marker = JSON.parse(fs.readFileSync(path.join(project, '.myrules-runtime.json'), 'utf8'));
  assert.strictEqual(marker.runtime, 'agent');
  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-coordinator.mdc')), false);
});

test('old registry string entries are treated as agent', () => {
  const home = tmp('myrules-rt-reg-');
  const project = tmp('myrules-rt-reg-proj-');
  fs.mkdirSync(project, { recursive: true });
  const file = path.join(home, '.myrules', '.registry.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ projects: [project] }, null, 2) + '\n');
  const entries = registry.listRegisteredProjectEntries(home);
  assert.strictEqual(entries[0].runtime, 'agent');
  assert.strictEqual(entries[0].path, project);
});

test('project file runtime wins over registry and is written back', () => {
  const cache = makeCacheRepo();
  const homeDir = tmp('myrules-rt-conflict-home-');
  const project = tmp('myrules-rt-conflict-');
  arrange(project, cache, 'agent', { homeDir });
  writeRuntime(project, 'project');
  syncCli.run({ ...syncOpts(project, cache), homeDir });
  const reg = registry.readRegistry(homeDir);
  const entry = reg.projects.find((p) => p.path === project);
  assert.strictEqual(entry.runtime, 'project');
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-coordinator.mdc')));
});

test('sync project coordinator after cache edit updates charter and leaves ledger notes', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-coord-sync-');
  arrange(project, cache, 'project');
  write(path.join(project, 'ledger', 'board', 'card.md'), 'in progress card\n');
  fs.appendFileSync(path.join(cache, 'method', 'project', 'coordinator.md'), '\nCOORD_MARKER\n');
  runGit(cache, ['add', '-A']);
  runGit(cache, ['commit', '-m', 'tweak coordinator']);
  syncCli.run(syncOpts(project, cache));
  assert.match(fs.readFileSync(path.join(project, 'docs', '方法', 'myrules-coordinator.md'), 'utf8'), /COORD_MARKER/);
  assert.strictEqual(fs.readFileSync(path.join(project, 'ledger', 'board', 'card.md'), 'utf8'), 'in progress card\n');
});

test('ambiguous 布置仓库 is not documented as defaulting to agent', () => {
  const skill = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'myrules', 'SKILL.md'), 'utf8');
  assert.match(skill, /普通 Agent 还是 Project|ask.*runtime|问.*runtime|问：普通/i);
  assert.doesNotMatch(skill, /布置仓库.*默认.*agent/i);
  assert.match(skill, /布置普通仓库/);
  assert.match(skill, /布置 Project 仓库/);
});

test('same runtime arrange without force refuses', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-again-');
  arrange(project, cache, 'agent');
  assert.throws(() => arrange(project, cache, 'agent'), /Already arranged|Use sync/);
});

test('empty project arrange stays 探路 and does not hint construction', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-empty-hint-');
  installSkill(project);
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const result = initCli.run({ ...syncOpts(project, cache), runtime: 'project', quiet: false });
    assert.strictEqual(result.alreadyHadGoals, false);
  } finally {
    console.log = orig;
  }
  assert.doesNotMatch(logs.join('\n'), /已有目标册/);
  assert.match(fs.readFileSync(path.join(project, 'ledger', 'STATUS.md'), 'utf8'), /探路/);
  assert.doesNotMatch(fs.readFileSync(path.join(project, 'ledger', 'STATUS.md'), 'utf8'), /可施工/);
});

test('overlay method file prints STATUS hint and leaves 探路', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-overlay-hint-');
  installSkill(project);
  write(path.join(project, 'docs', '方法', '项目工作法.md'), '# overlay\n');
  const logs = [];
  const orig = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const result = initCli.run({ ...syncOpts(project, cache), runtime: 'project', quiet: false });
    assert.strictEqual(result.alreadyHadGoals, true);
  } finally {
    console.log = orig;
  }
  assert.match(logs.join('\n'), /已有目标册/);
  assert.match(logs.join('\n'), /可施工/);
  const status = fs.readFileSync(path.join(project, 'ledger', 'STATUS.md'), 'utf8');
  assert.match(status, /探路/);
  assert.doesNotMatch(status, /闸门：可施工/);
  assert.strictEqual(fs.readFileSync(path.join(project, 'docs', '方法', '项目工作法.md'), 'utf8'), '# overlay\n');
});

test('non-empty standard checklist prints STATUS hint', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-goals-hint-');
  installSkill(project);
  write(
    path.join(project, 'docs', '设计目标检查清单.md'),
    '# 设计目标检查清单\n\n| ID | 功能 | 目标 | 状态 | 对比时看什么 | 验证方式 | 项目 | 出处 |\n|---|---|---|---|---|---|---|---|\n| G1 | Foo | 人能断定 | 口号 | 无 | 人抽查 |  |  |\n'
  );
  const result = initCli.run({ ...syncOpts(project, cache), runtime: 'project', quiet: true });
  assert.strictEqual(result.alreadyHadGoals, true);
  assert.match(fs.readFileSync(path.join(project, 'ledger', 'STATUS.md'), 'utf8'), /探路/);
});

test('writeRuntimeFile keeps instanceLanding and unknown fields', () => {
  const project = tmp('myrules-rt-json-keep-');
  write(
    path.join(project, '.myrules-runtime.json'),
    `${JSON.stringify({ runtime: 'agent', instanceLanding: true, note: 'keep' }, null, 2)}\n`
  );
  const runtimeLib = require('../tools/sync/lib/runtime');
  assert.strictEqual(runtimeLib.hasInstanceLanding(project), true);
  runtimeLib.writeRuntimeFile(project, 'project');
  const json = JSON.parse(fs.readFileSync(path.join(project, '.myrules-runtime.json'), 'utf8'));
  assert.strictEqual(json.runtime, 'project');
  assert.strictEqual(json.instanceLanding, true);
  assert.strictEqual(json.note, 'keep');
});

test('instanceLanding preserves custom skill, drops board command artifacts, still syncs principles', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-landing-');
  installSkill(project);
  write(
    path.join(project, '.myrules-runtime.json'),
    `${JSON.stringify({ runtime: 'agent', instanceLanding: true }, null, 2)}\n`
  );
  write(path.join(project, 'docs', '方法', '项目工作法.md'), '# overlay landing\n');
  write(path.join(project, '.cursor', 'skills', 'project-method', 'SKILL.md'), '# CUSTOM_SKILL\n');
  write(path.join(project, '.claude', 'skills', 'project-method', 'SKILL.md'), '# CUSTOM_CLAUDE_SKILL\n');
  write(path.join(project, '.cursor', 'rules', 'myrules-method-agent.mdc'), 'DROP_ME_AGENT\n');
  write(path.join(project, '.claude', 'rules', 'myrules-method-agent.md'), 'DROP_ME_CLAUDE\n');
  write(path.join(project, 'docs', '方法', 'myrules-runtime.md'), 'DROP_ME_RUNTIME\n');
  write(path.join(project, 'scripts', 'myrules-board.mjs'), '// drop board\n');
  write(path.join(project, 'scripts', 'myrules-goal-ledger.mjs'), '// drop ledger\n');

  syncCli.run(syncOpts(project, cache));

  assert.strictEqual(
    fs.readFileSync(path.join(project, '.cursor', 'skills', 'project-method', 'SKILL.md'), 'utf8'),
    '# CUSTOM_SKILL\n'
  );
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.claude', 'skills', 'project-method', 'SKILL.md'), 'utf8'),
    '# CUSTOM_CLAUDE_SKILL\n'
  );
  assert.strictEqual(fs.readFileSync(path.join(project, 'docs', '方法', '项目工作法.md'), 'utf8'), '# overlay landing\n');
  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-agent.mdc')), false);
  assert.strictEqual(fs.existsSync(path.join(project, '.claude', 'rules', 'myrules-method-agent.md')), false);
  assert.strictEqual(fs.existsSync(path.join(project, 'docs', '方法', 'myrules-runtime.md')), false);
  assert.strictEqual(fs.existsSync(path.join(project, 'scripts', 'myrules-board.mjs')), false);
  assert.strictEqual(fs.existsSync(path.join(project, 'scripts', 'myrules-goal-ledger.mjs')), false);
  assert.ok(fs.existsSync(path.join(project, 'docs', '方法', 'myrules-项目工作法.md')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-session.mdc')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', 'myrules-method-small.mdc')));

  fs.appendFileSync(path.join(cache, 'method', 'core', '项目工作法.md'), '\nPRINCIPLE_MARKER\n');
  runGit(cache, ['add', '-A']);
  runGit(cache, ['commit', '-m', 'tweak principle']);
  syncCli.run(syncOpts(project, cache));
  assert.match(fs.readFileSync(path.join(project, 'docs', '方法', 'myrules-项目工作法.md'), 'utf8'), /PRINCIPLE_MARKER/);
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.cursor', 'skills', 'project-method', 'SKILL.md'), 'utf8'),
    '# CUSTOM_SKILL\n'
  );
});

test('instanceLanding --force still does not overwrite the skill', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-landing-force-');
  installSkill(project);
  write(
    path.join(project, '.myrules-runtime.json'),
    `${JSON.stringify({ runtime: 'agent', instanceLanding: true }, null, 2)}\n`
  );
  write(path.join(project, '.cursor', 'skills', 'project-method', 'SKILL.md'), '# KEEP_FORCE\n');
  syncCli.run({ ...syncOpts(project, cache), force: true });
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.cursor', 'skills', 'project-method', 'SKILL.md'), 'utf8'),
    '# KEEP_FORCE\n'
  );
});

test('instanceLanding gap-fills a missing platform copy from the instance sibling', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-landing-gapfill-');
  installSkill(project);
  write(
    path.join(project, '.myrules-runtime.json'),
    `${JSON.stringify({ runtime: 'agent', instanceLanding: true }, null, 2)}\n`
  );
  write(path.join(project, '.cursor', 'skills', 'project-method', 'SKILL.md'), '# CUSTOM_SKILL\n');
  write(path.join(project, '.cursor', 'skills', 'project-method', 'templates', '设计目标.md'), '# CUSTOM_TEMPLATE\n');

  syncCli.run(syncOpts(project, cache));

  // dsh 缺失 → 镜像实例自己的 cursor 拷贝（内容=实例版，不是缓存版）
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.dsh', 'skills', 'project-method', 'SKILL.md'), 'utf8'),
    '# CUSTOM_SKILL\n'
  );
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.dsh', 'skills', 'project-method', 'templates', '设计目标.md'), 'utf8'),
    '# CUSTOM_TEMPLATE\n'
  );
  // 已存在的永不覆盖
  fs.writeFileSync(path.join(project, '.dsh', 'skills', 'project-method', 'SKILL.md'), '# EDITED_DSH\n');
  syncCli.run(syncOpts(project, cache));
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.dsh', 'skills', 'project-method', 'SKILL.md'), 'utf8'),
    '# EDITED_DSH\n'
  );
});

test('instanceLanding respects deletion when every platform copy is gone', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-landing-deleted-');
  installSkill(project);
  write(
    path.join(project, '.myrules-runtime.json'),
    `${JSON.stringify({ runtime: 'agent', instanceLanding: true }, null, 2)}\n`
  );

  syncCli.run(syncOpts(project, cache));

  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'skills', 'project-method')), false);
  assert.strictEqual(fs.existsSync(path.join(project, '.claude', 'skills', 'project-method')), false);
  assert.strictEqual(fs.existsSync(path.join(project, '.dsh', 'skills', 'project-method')), false);
});

test('instanceLanding force arrange leaves custom board scripts in package.json', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-landing-pkg-');
  installSkill(project);
  write(
    path.join(project, '.myrules-runtime.json'),
    `${JSON.stringify({ runtime: 'agent', instanceLanding: true }, null, 2)}\n`
  );
  write(
    path.join(project, 'package.json'),
    `${JSON.stringify(
      {
        private: true,
        scripts: {
          board: 'node scripts/query-improvements.mjs',
          improvements: 'node scripts/query-improvements.mjs',
          'improvements:add': 'node scripts/add-improvement.mjs',
        },
      },
      null,
      2
    )}\n`
  );
  initCli.run({ ...syncOpts(project, cache), runtime: 'agent', force: true, quiet: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.scripts.board, 'node scripts/query-improvements.mjs');
  assert.strictEqual(pkg.scripts['improvements:add'], 'node scripts/add-improvement.mjs');
  const marker = JSON.parse(fs.readFileSync(path.join(project, '.myrules-runtime.json'), 'utf8'));
  assert.strictEqual(marker.instanceLanding, true);
});

test('hand-edited project-method skill is skipped on later sync', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-rt-skill-drift-');
  arrange(project, cache, 'project');
  const skillFile = path.join(project, '.cursor', 'skills', 'project-method', 'SKILL.md');
  const original = fs.readFileSync(skillFile, 'utf8');
  fs.writeFileSync(skillFile, `${original}\nHAND_EDIT_SKILL\n`);
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  try {
    syncCli.run(syncOpts(project, cache));
  } finally {
    console.warn = origWarn;
  }
  assert.match(fs.readFileSync(skillFile, 'utf8'), /HAND_EDIT_SKILL/);
  assert.match(warns.join('\n'), /method file/);
});

