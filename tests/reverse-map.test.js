// tests/reverse-map.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { seedCacheContent } = require('./helpers/cache-seed');
const reverseMap = require('../tools/sync/lib/reverse-map');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeCache() {
  const cache = tmp('myrules-rmap-cache-');
  seedCacheContent(cache);
  return cache;
}

function mapOpts(project) {
  return {
    runtime: 'agent',
    instanceLanding: false,
    claudeUserDir: path.join(project, '.fake-claude-home', 'rules'),
    opencodeUserDir: path.join(project, '.fake-opencode-home', 'rules'),
    dshUserDir: path.join(project, '.fake-dsh-home', 'rules'),
  };
}

test('buildReverseMap covers rules and method files with exact state keys', () => {
  const cache = makeCache();
  const project = tmp('myrules-rmap-proj-');
  const members = reverseMap.buildReverseMap(cache, project, mapOpts(project));
  const byKey = new Map(members.map((m) => [m.stateKey, m]));

  const rule = byKey.get('.cursor/rules/myrules-testing.mdc');
  assert.ok(rule);
  assert.strictEqual(rule.surface, 'rule');
  assert.strictEqual(rule.emit, 'cursor');
  assert.strictEqual(rule.backfill, 'body');

  const method = byKey.get('method:.cursor/rules/myrules-method-small.mdc');
  assert.ok(method, [...byKey.keys()].filter((k) => k.includes('method')).join());
  assert.strictEqual(method.backfill, 'body');
  assert.strictEqual(method.methodKind, 'cursor-rule');

  const skill = members.find((m) => m.stateKey.startsWith('method:.cursor/skills/project-method/'));
  assert.ok(skill, 'skillPack/project-method entries expected');
  assert.strictEqual(skill.surface, 'skill');
  assert.strictEqual(skill.backfill, 'bytes');
});

test('emittedSource and backfillSource round-trip: backfill(S, emitted(S)) === S', () => {
  const cache = makeCache();
  const project = tmp('myrules-rmap-round-');
  const members = reverseMap.buildReverseMap(cache, project, mapOpts(project));
  for (const m of members) {
    const S = fs.readFileSync(m.sourceAbs, 'utf8');
    const E = reverseMap.emittedSource(m, S);
    const r = reverseMap.backfillSource(m, S, E);
    assert.strictEqual(r.ok, true, m.stateKey);
    assert.strictEqual(r.source, S, `round-trip mismatch for ${m.stateKey}`);
  }
});

// F3 性质：对任何通过前缀检查的 D（含以空白开头的 D），emitted(backfill(S, D)) === D。
// 这是「捕获后 state 与磁盘对齐 + 幂等」的字节级根基（生成头后插入空行的编辑必须可往返）。
test('property: emitted(backfill(S, D)) === D for whitespace-leading D (blank line after header, LF/CRLF)', () => {
  const cache = makeCache();
  const project = tmp('myrules-rmap-ws-');
  const members = reverseMap.buildReverseMap(cache, project, mapOpts(project));
  const cursor = members.find((m) => m.stateKey === '.cursor/rules/myrules-testing.mdc');
  const body = members.find((m) => m.stateKey === '.claude/rules/myrules-testing.md');
  assert.ok(cursor && body);

  const variants = [
    fs.readFileSync(cursor.sourceAbs, 'utf8'), // 无 frontmatter 源
    '---\nagents: [implementer]\n---\n\n# Testing\n\n- v1', // LF frontmatter 源
    '---\r\nagents: [implementer]\r\n---\r\n\r\n# Testing\r\n\r\n- v1', // CRLF frontmatter 源
  ];
  for (const S of variants) {
    fs.writeFileSync(cursor.sourceAbs, S);
    for (const m of [cursor, body]) {
      const E = reverseMap.emittedSource(m, S);
      // cursor 拷贝：生成头后插入空行；body 拷贝：正文顶部插入空行（D 以空白开头）
      const D = m.emit === 'cursor' ? E.replace('---\n\n', '---\n\n\n') : `\n${E}`;
      assert.notStrictEqual(D, E, 'fixture D must actually differ from E');
      const r = reverseMap.backfillSource(m, S, D);
      assert.strictEqual(r.ok, true, `backfill refused for ${m.stateKey}: ${JSON.stringify(S)}`);
      assert.strictEqual(reverseMap.emittedSource(m, r.source), D, `emitted(backfill) !== D for ${m.stateKey}: ${JSON.stringify(S)}`);
    }
  }
});

test('backfillSource preserves rule source frontmatter and replaces body only', () => {
  const cache = makeCache();
  const project = tmp('myrules-rmap-fm-');
  const members = reverseMap.buildReverseMap(cache, project, mapOpts(project));
  const member = members.find((m) => m.stateKey === '.claude/rules/myrules-testing.md');
  const sourceFile = member.sourceAbs;
  fs.writeFileSync(sourceFile, '---\nagents: [implementer]\n---\n\n# Testing\n\n- v1');
  const S = fs.readFileSync(sourceFile, 'utf8');

  const edited = '# Testing\n\n- v2 edited';
  const r = reverseMap.backfillSource(member, S, edited);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.source, '---\nagents: [implementer]\n---\n\n# Testing\n\n- v2 edited');
});

test('backfillSource refuses header edits (header-edit) on cursor rule copies', () => {
  const cache = makeCache();
  const project = tmp('myrules-rmap-head-');
  const members = reverseMap.buildReverseMap(cache, project, mapOpts(project));
  const member = members.find((m) => m.stateKey === '.cursor/rules/myrules-testing.mdc');
  const S = fs.readFileSync(member.sourceAbs, 'utf8');
  const E = reverseMap.emittedSource(member, S);
  const tampered = E.replace('alwaysApply: true', 'alwaysApply: false');
  const r = reverseMap.backfillSource(member, S, tampered);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'header-edit');
});

test('backfillSource for skill files is byte-exact (frontmatter is content)', () => {
  const cache = makeCache();
  const project = tmp('myrules-rmap-skill-');
  const members = reverseMap.buildReverseMap(cache, project, mapOpts(project));
  const member = members.find((m) => m.surface === 'skill');
  const S = fs.readFileSync(member.sourceAbs, 'utf8');
  const r = reverseMap.backfillSource(member, S, `${S}\nEDITED\n`);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.source, `${S}\nEDITED\n`);
});

test('backfillSource round-trips method .md copies whose strip leaves the source header in place (CRLF sources)', () => {
  const cache = makeCache();
  const project = tmp('myrules-rmap-crlf-');
  const members = reverseMap.buildReverseMap(cache, project, mapOpts(project));
  const member = members.find((m) => m.methodKind === 'claude-rule');
  const S = fs.readFileSync(member.sourceAbs, 'utf8'); // seedCacheContent 原样拷贝 method 源
  const E = reverseMap.emittedSource(member, S);
  // 不管 strip 是否命中，round-trip 必须无损
  const r = reverseMap.backfillSource(member, S, E);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.source, S);
  // 正文编辑后写回 = 头保留 + 新正文
  const edited = E.replace(/^# .*$/m, '# NEW HEADING');
  const r2 = reverseMap.backfillSource(member, S, edited);
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(reverseMap.emittedSource(member, r2.source), edited);
});

test('skillSourceFor: convention path and manifest explicit template mapping', () => {
  const cache = makeCache();
  const manifest = require(path.join(cache, 'manifest.js'));
  assert.strictEqual(
    reverseMap.skillSourceFor('.cursor/skills/writing-for-the-reader/SKILL.md', manifest),
    'method/skills/writing-for-the-reader/SKILL.md'
  );
  assert.strictEqual(
    reverseMap.skillSourceFor('.dsh/skills/project-method/templates/设计目标.md', manifest),
    'method/core/templates/设计目标.md'
  );
  assert.strictEqual(reverseMap.skillSourceFor('.cursor/rules/myrules-testing.mdc', manifest), null);
});

test('buildReverseMap excludes instanceOwned entries when instanceLanding', () => {
  const cache = makeCache();
  const project = tmp('myrules-rmap-il-');
  const members = reverseMap.buildReverseMap(cache, project, { ...mapOpts(project), instanceLanding: true });
  assert.ok(!members.some((m) => m.stateKey.includes('project-method')));
  assert.ok(!members.some((m) => m.stateKey.includes('myrules-board')));
  const normal = reverseMap.buildReverseMap(cache, project, mapOpts(project));
  assert.ok(normal.some((m) => m.stateKey.includes('project-method')));
});
