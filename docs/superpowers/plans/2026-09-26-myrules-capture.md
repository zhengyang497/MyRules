# MyRules capture-on-sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手改的可反查产物（rules、method 短规则、技能包等）在下一次 sync 时自动写回 `~/.myrules` 缓存源，发布（push.js）成为唯一人工动作且被闸门强制。

**Architecture:** 部署前新增「捕获 pass」：以 manifest 驱动的反查映射（dest ↔ src）找出被手改的部署产物，仅当「项目基线哈希 = 缓存现产出哈希」且各平台改法一致时，把正文写回缓存源（frontmatter 保留），随后正常部署收敛；任何不确定情形拒绝捕获并告警，永不覆盖。捕获使缓存 dirty，现有 pull 闸门迫使用户先 push.js。

**Tech Stack:** Node.js ≥ 18，零 npm 依赖（node:test、node:fs、node:path、node:child_process）。

**Spec:** `docs/superpowers/specs/2026-09-26-myrules-capture-design.md`

## Global Constraints

- 零新增 npm 依赖；只用 node 内置模块。
- 捕获**永不覆盖**项目文件；**永不写回**基线不匹配的缓存源（乐观并发，spec §4）。
- 规则源 frontmatter（`agents:` / `runtimes:`）永远保留原字节，只替换正文；frontmatter 层面的改动一律拒绝捕获（reason `header-edit`）。
- `instanceLanding` 项目的 `instanceOwned` 条目（preserve/drop）不进映射：不部署、不回流。
- method 短规则的部署 transform 必须与 `deploy-method.js` 的 `contentForText` 逐字节一致；规则的部署 transform 必须与 `transform.js` 一致——由共享枚举/共享函数保证，不允许两份实现。
- Windows 开发机（PowerShell 5.1），源文件可能是 CRLF：任何前缀/分割逻辑必须 CRLF 兼容（`(?:\r?\n)`）。
- 测试全部走 `npm test`（`node --test tests/*.test.js`）；本计划开始前基线 282 条全绿。
- 代码注释与输出文案用中文（仓库惯例）；用户可见告警避免 em dash（PowerShell 5.1 会渲染成 `�?`）。
- 提交信息用中文或英文均可，格式 `feat/fix/docs: ...`。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `tools/sync/lib/rule-targets.js` | Create | 规则部署目标枚举 + 规则内容 transform（deploy.js 与 reverse-map.js 共用，单一事实源） |
| `tools/sync/lib/deploy.js` | Modify | 消费 `rule-targets`（行为不变，tests/deploy.test.js 守护） |
| `tools/sync/lib/deploy-method.js` | Modify | 导出 `contentForText(raw, kind)`（内容 transform 单一事实源） |
| `tools/sync/lib/reverse-map.js` | Create | 反查映射：buildReverseMap / emittedSource / backfillSource / skillSourceFor |
| `tools/sync/lib/capture.js` | Create | 捕获决策引擎：分组、基线判定、平台一致性、写回 |
| `tools/sync/sync.js` | Modify | 捕获 pass 接线、`--no-capture`、闸门文案、捕获/冲突打印 |
| `tools/sync/lib/export.js` | Modify | skill 源解析改用 `reverseMap.skillSourceFor`（行为不变） |
| `tests/rule-targets.test.js` | Create | Task 1 测试 |
| `tests/reverse-map.test.js` | Create | Task 2 测试 |
| `tests/capture.test.js` | Create | Task 3 测试 |
| `tests/capture-sync.test.js` | Create | Task 4 集成测试 |
| `skills/myrules/REFERENCE.md`、`COMMANDS.md` | Modify | Task 6 文档 |
| `docs/superpowers/specs/2026-09-26-myrules-capture-design.md` | Modify | Task 6 补 `--force` 决策行 |

---

### Task 1: 规则目标枚举单一事实源（rule-targets.js + deploy.js 重构）

**Files:**
- Create: `tools/sync/lib/rule-targets.js`
- Modify: `tools/sync/lib/deploy.js`（`deployRules` 主循环替换为消费 rule-targets）
- Test: `tests/rule-targets.test.js`（既有 `tests/deploy.test.js` 是回归守护，必须保持全绿）

**Interfaces:**
- Consumes: `transform.parseRuleFrontmatter` / `transform.transformForCursor`（`tools/sync/lib/transform.js`）、`paths.get*RulesDir*`（`tools/sync/lib/paths.js`）
- Produces（后续任务依赖，签名精确）:
  - `ruleTargets(cacheDir, projectRoot, opts) -> Array<{abs: string, stateKey: string, sourceAbs: string, topic: string, emit: 'cursor'|'body'}>`
    opts: `{ manifest?, claudeUserDir?, opencodeUserDir?, dshUserDir? }`，缺省目录语义与 `deployRules` 现状一致（HOME 目录）。
  - `emittedRuleContent(target, rawSourceText) -> string`（部署写入目标文件的精确字节）

- [ ] **Step 1: 写失败测试 `tests/rule-targets.test.js`**

```js
// tests/rule-targets.test.js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/rule-targets.test.js`
Expected: FAIL（`Cannot find module .../rule-targets`）

- [ ] **Step 3: 实现 `tools/sync/lib/rule-targets.js`**

```js
// tools/sync/lib/rule-targets.js
//
// 规则部署目标枚举 + 内容 transform：deploy.js（部署）与 reverse-map.js（捕获/反查）
// 共用这一份清单，保证「部署写哪里、产出什么」与「捕获查哪里」永不漂移。
const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const transform = require('./transform');
const loadManifest = require('./load-manifest');

function listMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
}

/**
 * 返回全部规则部署目标：
 * { abs: 目标绝对路径, stateKey: state.deployedHashes 的 key, sourceAbs: 缓存源,
 *   topic: 规则主题, emit: 'cursor' | 'body' }
 * user 规则 5 个目标（项目 cursor + 三个用户目录 + 项目 opencode），project 规则 4 个。
 * 带 `runtimes:` frontmatter 的规则只进 sub-agent 包，不部署、不枚举。
 */
function ruleTargets(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const prefix = manifest.managedPrefix;
  const userPrefix = `${prefix}user-`;
  const claudeUserDir = opts.claudeUserDir || paths.getClaudeUserRulesDir();
  const opencodeUserDir = opts.opencodeUserDir || paths.getOpencodeUserRulesDir();
  const dshUserDir = opts.dshUserDir || paths.getDshUserRulesDir();
  const cursorDir = paths.getCursorRulesDir(projectRoot);
  const claudeProjDir = paths.getClaudeProjectRulesDir(projectRoot);
  const opencodeProjDir = paths.getOpencodeProjectRulesDir(projectRoot);
  const dshProjDir = paths.getDshProjectRulesDir(projectRoot);

  const targets = [];
  for (const category of ['user', 'project']) {
    const srcDir = path.join(cacheDir, 'rules', category);
    for (const f of listMdFiles(srcDir)) {
      const topic = path.basename(f, '.md');
      const sourceAbs = path.join(srcDir, f);
      const raw = fs.readFileSync(sourceAbs, 'utf8');
      if (transform.parseRuleFrontmatter(raw).runtimes !== null) continue;

      const cursorName = category === 'user' ? `${userPrefix}${topic}.mdc` : `${prefix}${topic}.mdc`;
      targets.push({
        abs: path.join(cursorDir, cursorName),
        stateKey: path.posix.join('.cursor/rules', cursorName),
        sourceAbs,
        topic,
        emit: 'cursor',
      });

      const mdName = category === 'user' ? `${userPrefix}${topic}.md` : `${prefix}${topic}.md`;
      if (category === 'user') {
        targets.push({ abs: path.join(claudeUserDir, mdName), stateKey: `~claude-user~/${mdName}`, sourceAbs, topic, emit: 'body' });
        targets.push({ abs: path.join(opencodeUserDir, mdName), stateKey: `~opencode-user~/${mdName}`, sourceAbs, topic, emit: 'body' });
        targets.push({ abs: path.join(opencodeProjDir, mdName), stateKey: path.posix.join('.opencode/rules', mdName), sourceAbs, topic, emit: 'body' });
        targets.push({ abs: path.join(dshUserDir, mdName), stateKey: `~dsh-user~/${mdName}`, sourceAbs, topic, emit: 'body' });
      } else {
        targets.push({ abs: path.join(claudeProjDir, mdName), stateKey: path.posix.join('.claude/rules', mdName), sourceAbs, topic, emit: 'body' });
        targets.push({ abs: path.join(opencodeProjDir, mdName), stateKey: path.posix.join('.opencode/rules', mdName), sourceAbs, topic, emit: 'body' });
        targets.push({ abs: path.join(dshProjDir, mdName), stateKey: path.posix.join('.dsh/rules', mdName), sourceAbs, topic, emit: 'body' });
      }
    }
  }
  return targets;
}

// 部署写入目标文件的精确字节：cursor 目标带生成头，其余为正文
function emittedRuleContent(target, rawSourceText) {
  const body = transform.parseRuleFrontmatter(rawSourceText).body;
  return target.emit === 'cursor' ? transform.transformForCursor(body, target.topic) : body;
}

module.exports = { ruleTargets, emittedRuleContent };
```

- [ ] **Step 4: 重构 `deploy.js` 消费 rule-targets**

`deploy.js` 删除 `listMdFiles`、`isRuleStateKey` 保留不动；`deployRules` 的双层循环（第 69-128 行区域）替换为：

```js
  const tracker = drift.createTracker({ force, priorHashes });

  for (const t of ruleTargets(cacheDir, projectRoot, {
    manifest,
    claudeUserDir,
    opencodeUserDir,
    dshUserDir,
  })) {
    tracker.writeTracked(t.abs, emittedRuleContent(t, fs.readFileSync(t.sourceAbs, 'utf8')), t.stateKey);
  }
```

顶部 require 追加 `const ruleTargetsLib = require('./rule-targets');`，循环里用 `ruleTargetsLib.ruleTargets(...)` 与 `ruleTargetsLib.emittedRuleContent(...)`（或解构引入）。七个目录的 `fs.mkdirSync(..., { recursive: true })` 开头块**保留**（stale 清理与空目录行为依赖它）。`module.exports` 保持 `{ deployRules, staleRuleCleanup, isRuleStateKey }` 不变。注意：原实现逐目标写入前未对目标父目录单独 mkdir（靠开头七个 mkdir），重构后行为一致，不要额外加。

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test tests/rule-targets.test.js tests/deploy.test.js`
Expected: 全 PASS（deploy.test.js 是行为回归守护：drift 跳过、force 覆盖、user 规则落点、stale 清理都必须原样通过）

- [ ] **Step 6: Commit**

```powershell
git add tools/sync/lib/rule-targets.js tools/sync/lib/deploy.js tests/rule-targets.test.js
git commit -m "refactor: 规则部署目标枚举抽出 rule-targets（deploy 与反查共用）"
```

---

### Task 2: 反查映射层（reverse-map.js + deploy-method contentForText）

**Files:**
- Create: `tools/sync/lib/reverse-map.js`
- Modify: `tools/sync/lib/deploy-method.js`（`contentForEntry` 拆出 `contentForText` 并导出）
- Test: `tests/reverse-map.test.js`

**Interfaces:**
- Consumes: `ruleTargets` / `emittedRuleContent`（Task 1）、`deployMethod.entriesForRuntime`（既有导出）、`transform.*`
- Produces:
  - `deployMethod.contentForText(raw: string, kind?: string) -> string`（kind: `'cursor-rule'|'claude-rule'|'dsh-rule'|undefined`）
  - `buildReverseMap(cacheDir, projectRoot, opts) -> Member[]`
    Member: `{ abs, stateKey, sourceAbs, surface: 'rule'|'method'|'skill', backfill: 'body'|'bytes', emit?: 'cursor'|'body', topic?: string, methodKind?: string }`
  - `emittedSource(member, sourceText) -> string`
  - `backfillSource(member, sourceText, deployedText) -> { ok: true, source: string } | { ok: false, reason: 'header-edit' }`
  - `skillSourceFor(destRel, manifest) -> string|null`（`'method/skills/<name>/<rel>'` 约定或 manifest 显式单文件映射）
  - `skillNameOfTarget(target) -> string|null`、`isSkillsRoot(rel) -> boolean`、`splitFrontmatter(text) -> {header, body}`

- [ ] **Step 1: deploy-method.js 拆出 contentForText**

将现有 `contentForEntry`（`tools/sync/lib/deploy-method.js:33-40`）改为：

```js
function contentForText(raw, kind) {
  if (kind === 'claude-rule') return transform.stripCursorFrontmatter(raw);
  // dsh-rule：剥掉 Cursor frontmatter。用 CRLF 兼容的 stripRuleFrontmatter
  // （stripCursorFrontmatter 的正则只认 \n；method 源文件是 CRLF）。
  if (kind === 'dsh-rule') return transform.stripRuleFrontmatter(raw);
  return raw;
}

function contentForEntry(srcPath, kind) {
  return contentForText(fs.readFileSync(srcPath, 'utf8'), kind);
}
```

`module.exports` 追加 `contentForText`。

- [ ] **Step 2: 写失败测试 `tests/reverse-map.test.js`**

```js
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
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test tests/reverse-map.test.js`
Expected: FAIL（`Cannot find module .../reverse-map`）

- [ ] **Step 4: 实现 `tools/sync/lib/reverse-map.js`**

```js
// tools/sync/lib/reverse-map.js
//
// 反查映射：部署产物 ↔ 缓存源。capture（自动回流）与 export（报告/手动回填）
// 共用这一份映射，保证「部署写哪里、反查回哪里」只有一处定义。
//
// 核心不变式（prefixesFor 保证，reverse-map.test.js 逐成员验证）：
//   emittedSource(m, S) === dstPrefix + S.slice(srcPrefix.length)
//   backfillSource(m, S, D) === S.slice(0, srcPrefix.length) + D.slice(dstPrefix.length)
//   且 backfillSource(m, S, emittedSource(m, S)).source === S（round-trip 无损）
const fs = require('node:fs');
const path = require('node:path');
const transform = require('./transform');
const deployMethod = require('./deploy-method');
const ruleTargetsLib = require('./rule-targets');

function posix(p) {
  return String(p).replace(/\\/g, '/');
}

const SKILL_ROOT_RE = /^\.(?:cursor|claude|dsh)\/skills(\/|$)/;

function isSkillsRoot(rel) {
  return SKILL_ROOT_RE.test(posix(rel));
}

function skillNameOfTarget(target) {
  const m = posix(target).match(/^\.(?:cursor|claude|dsh)\/skills\/([^/]+)/);
  return m ? m[1] : null;
}

function splitFrontmatter(text) {
  const m = text.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/);
  return m ? { header: m[1], body: m[2] } : { header: '', body: text };
}

function walkFiles(root) {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) out.push(abs);
    }
  };
  walk(root);
  return out;
}

/**
 * 部署 transform 的字节前缀关系：emitted = dstPrefix + sourceText.slice(srcPrefix.length)
 * - rules cursor：剥源头+空行、加生成头
 * - rules .md：剥源头+空行，正文原样
 * - method cursor-rule / claude-rule(CRLF 未剥中)：整文拷贝，源头随行 → 改头即冲突
 * - method claude-rule(剥中) / dsh-rule：剥源头+空行，正文原样
 */
function prefixesFor(entry, sourceText) {
  if (entry.surface === 'rule') {
    const body = transform.parseRuleFrontmatter(sourceText).body;
    const src = sourceText.slice(0, sourceText.length - body.length);
    const dst = entry.emit === 'cursor' ? transform.transformForCursor('', entry.topic) : '';
    return { src, dst };
  }
  if (entry.backfill === 'bytes') return { src: '', dst: '' };
  if (entry.methodKind === 'claude-rule') {
    const stripped = transform.stripCursorFrontmatter(sourceText);
    if (stripped !== sourceText) {
      return { src: sourceText.slice(0, sourceText.length - stripped.length), dst: '' };
    }
    const h = splitFrontmatter(sourceText).header;
    return { src: h, dst: h };
  }
  if (entry.methodKind === 'dsh-rule') {
    const stripped = transform.stripRuleFrontmatter(sourceText);
    return { src: sourceText.slice(0, sourceText.length - stripped.length), dst: '' };
  }
  const h = splitFrontmatter(sourceText).header;
  return { src: h, dst: h };
}

function emittedSource(entry, sourceText) {
  if (entry.surface === 'rule') {
    return ruleTargetsLib.emittedRuleContent(entry, sourceText);
  }
  return deployMethod.contentForText(sourceText, entry.methodKind);
}

function backfillSource(entry, sourceText, deployedText) {
  if (entry.backfill === 'bytes') return { ok: true, source: deployedText };
  const { src, dst } = prefixesFor(entry, sourceText);
  if (!deployedText.startsWith(dst)) return { ok: false, reason: 'header-edit' };
  return { ok: true, source: sourceText.slice(0, src.length) + deployedText.slice(dst.length) };
}

function methodMembers(cacheDir, projectRoot, opts) {
  const manifest = opts.manifest;
  const runtime = opts.runtime || 'agent';
  const instanceLanding = Boolean(opts.instanceLanding);
  const out = [];
  for (const entry of deployMethod.entriesForRuntime(manifest, runtime)) {
    if (instanceLanding && entry.instanceOwned) continue;
    const surfaceOf = (rel) => (isSkillsRoot(rel) ? 'skill' : 'method');
    if (entry.srcDir && entry.destDir) {
      const srcDir = path.join(cacheDir, entry.srcDir);
      if (!fs.existsSync(srcDir)) continue;
      for (const abs of walkFiles(srcDir)) {
        const relInside = posix(path.relative(srcDir, abs));
        const destRel = posix(path.posix.join(entry.destDir.replace(/\\/g, '/'), relInside));
        out.push({
          abs: path.join(projectRoot, destRel),
          stateKey: `method:${destRel}`,
          sourceAbs: abs,
          surface: surfaceOf(destRel),
          backfill: 'bytes',
        });
      }
      continue;
    }
    if (!entry.src || !entry.dest) continue;
    const destRel = posix(entry.dest);
    out.push({
      abs: path.join(projectRoot, destRel),
      stateKey: `method:${destRel}`,
      sourceAbs: path.join(cacheDir, entry.src),
      surface: surfaceOf(destRel),
      backfill: entry.kind ? 'body' : 'bytes',
      methodKind: entry.kind,
    });
  }
  return out;
}

function buildReverseMap(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || require('./load-manifest').loadManifest(cacheDir);
  const members = [];
  for (const t of ruleTargetsLib.ruleTargets(cacheDir, projectRoot, {
    manifest,
    ...(opts.claudeUserDir ? { claudeUserDir: opts.claudeUserDir } : {}),
    ...(opts.opencodeUserDir ? { opencodeUserDir: opts.opencodeUserDir } : {}),
    ...(opts.dshUserDir ? { dshUserDir: opts.dshUserDir } : {}),
  })) {
    members.push({ ...t, surface: 'rule', backfill: 'body' });
  }
  members.push(...methodMembers(cacheDir, projectRoot, { ...opts, manifest }));
  return members;
}

// 技能部署文件 → 缓存源：manifest 显式单文件映射优先，其次 method/skills/<name>/<rel> 约定
function skillSourceFor(destRel, manifest) {
  const norm = posix(destRel);
  for (const entry of (manifest.method && manifest.method.files) || []) {
    if (entry.src && entry.dest && isSkillsRoot(entry.dest) && posix(entry.dest) === norm) {
      return posix(entry.src);
    }
  }
  const m = norm.match(/^\.(?:cursor|claude|dsh)\/skills\/([^/]+)\/(.+)$/);
  return m ? `method/skills/${m[1]}/${m[2]}` : null;
}

module.exports = {
  buildReverseMap,
  emittedSource,
  backfillSource,
  splitFrontmatter,
  isSkillsRoot,
  skillNameOfTarget,
  skillSourceFor,
};
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test tests/reverse-map.test.js tests/deploy.test.js tests/export.test.js`
Expected: 全 PASS（export.test.js 仍未改动，必须不受影响）

- [ ] **Step 6: Commit**

```powershell
git add tools/sync/lib/reverse-map.js tools/sync/lib/deploy-method.js tests/reverse-map.test.js
git commit -m "feat: 反查映射层 reverse-map（emitted/backfill 前缀不变式）"
```

---

### Task 3: 捕获决策引擎（capture.js）

**Files:**
- Create: `tools/sync/lib/capture.js`
- Test: `tests/capture.test.js`

**Interfaces:**
- Consumes: `reverseMap.buildReverseMap` / `emittedSource` / `backfillSource`（Task 2）、`fsutil.hashContent(content) -> string`（既有）
- Produces:
  - `captureHandEdits(cacheDir, projectRoot, opts) -> { captured: Array<{abs, sourceAbs, stateKey}>, conflicts: Array<{abs, sourceAbs, stateKey, reason}> }`
  - `opts`: `{ manifest?, runtime?, instanceLanding?, priorHashes?: Record<stateKey, hash>, claudeUserDir?, opencodeUserDir?, dshUserDir? }`
  - `reason` 取值：`'no-baseline' | 'cache-moved' | 'header-edit' | 'disagree' | 'new-file'`
  - **语义**（spec §4）：只捕获 `priorHashes[stateKey] === hash(emittedSource(member, S))` 的手改成员；各平台候选正文必须一致；`new-file` 是托管技能目录里的**新文件**（映射里没有源），只报告不写入。

- [ ] **Step 1: 写失败测试 `tests/capture.test.js`**

```js
// tests/capture.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { seedCacheContent, writeRuntime } = require('./helpers/cache-seed');
const capture = require('../tools/sync/lib/capture');
const syncCli = require('../tools/sync/sync');
const installSkillCli = require('../tools/sync/install-skill');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeCache() {
  const cache = tmp('myrules-cap-cache-');
  seedCacheContent(cache);
  return cache;
}

function optsFor(project, cache) {
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
    dshUserDir: path.join(project, '.fake-home', '.dsh', 'rules'),
  };
}

function arrange(project, cache) {
  installSkillCli.run({ project, sourceDir: installSkillCli.getBundledRepoRoot() });
  writeRuntime(project, 'agent');
  syncCli.run(optsFor(project, cache)); // 首次部署，建立 state 基线
}

function readState(project) {
  return JSON.parse(fs.readFileSync(path.join(project, '.myrules-sync-state.json'), 'utf8'));
}

test('a body-edited rule copy is captured back into the cache source', () => {
  const cache = makeCache();
  const project = tmp('myrules-cap-basic-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write MORE tests'));

  const result = capture.captureHandEdits(cache, project, {
    priorHashes: readState(project).deployedHashes,
    claudeUserDir: optsFor(project, cache).claudeUserDir,
    opencodeUserDir: optsFor(project, cache).opencodeUserDir,
    dshUserDir: optsFor(project, cache).dshUserDir,
    runtime: 'agent',
    instanceLanding: false,
  });

  assert.strictEqual(result.conflicts.length, 0, JSON.stringify(result.conflicts));
  assert.strictEqual(result.captured.length, 1);
  const source = fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8');
  assert.match(source, /write MORE tests/);
});

test('capture refuses when the cache source moved on since the edit (cache-moved)', () => {
  const cache = makeCache();
  const project = tmp('myrules-cap-moved-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write MORE tests'));
  // 缓存在用户手改之后又前进（模拟另一台机器发布）
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '# Testing\n\n- cache WINS');

  const result = capture.captureHandEdits(cache, project, {
    priorHashes: readState(project).deployedHashes,
    claudeUserDir: optsFor(project, cache).claudeUserDir,
    opencodeUserDir: optsFor(project, cache).opencodeUserDir,
    dshUserDir: optsFor(project, cache).dshUserDir,
    runtime: 'agent',
    instanceLanding: false,
  });

  assert.strictEqual(result.captured.length, 0);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].reason, 'cache-moved');
  // 缓存保持新版本，项目文件保持手改
  assert.match(fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8'), /cache WINS/);
  assert.match(fs.readFileSync(deployed, 'utf8'), /write MORE tests/);
});

test('no deploy baseline means no capture (no-baseline)', () => {
  const cache = makeCache();
  const project = tmp('myrules-cap-nobase-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write MORE tests'));

  const result = capture.captureHandEdits(cache, project, {
    priorHashes: {}, // 模拟 state 丢失
    claudeUserDir: optsFor(project, cache).claudeUserDir,
    opencodeUserDir: optsFor(project, cache).opencodeUserDir,
    dshUserDir: optsFor(project, cache).dshUserDir,
    runtime: 'agent',
    instanceLanding: false,
  });

  assert.strictEqual(result.captured.length, 0);
  assert.strictEqual(result.conflicts[0].reason, 'no-baseline');
});

test('two platform copies edited differently both refuse (disagree)', () => {
  const cache = makeCache();
  const project = tmp('myrules-cap-disagree-');
  arrange(project, cache);

  const a = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  const b = path.join(project, '.dsh', 'rules', 'myrules-testing.md');
  fs.writeFileSync(a, fs.readFileSync(a, 'utf8').replace('write tests', 'write A tests'));
  fs.writeFileSync(b, fs.readFileSync(b, 'utf8').replace('write tests', 'write B tests'));

  const result = capture.captureHandEdits(cache, project, {
    priorHashes: readState(project).deployedHashes,
    claudeUserDir: optsFor(project, cache).claudeUserDir,
    opencodeUserDir: optsFor(project, cache).opencodeUserDir,
    dshUserDir: optsFor(project, cache).dshUserDir,
    runtime: 'agent',
    instanceLanding: false,
  });

  assert.strictEqual(result.captured.length, 0);
  const reasons = result.conflicts.map((c) => c.reason).sort();
  assert.deepStrictEqual(reasons, ['disagree', 'disagree']);
});

test('edits that agree across two platform copies capture once', () => {
  const cache = makeCache();
  const project = tmp('myrules-cap-agree-');
  arrange(project, cache);

  const a = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  const b = path.join(project, '.dsh', 'rules', 'myrules-testing.md');
  fs.writeFileSync(a, fs.readFileSync(a, 'utf8').replace('write tests', 'write SAME tests'));
  fs.writeFileSync(b, fs.readFileSync(b, 'utf8').replace('write tests', 'write SAME tests'));

  const result = capture.captureHandEdits(cache, project, {
    priorHashes: readState(project).deployedHashes,
    claudeUserDir: optsFor(project, cache).claudeUserDir,
    opencodeUserDir: optsFor(project, cache).opencodeUserDir,
    dshUserDir: optsFor(project, cache).dshUserDir,
    runtime: 'agent',
    instanceLanding: false,
  });

  assert.strictEqual(result.conflicts.length, 0, JSON.stringify(result.conflicts));
  assert.strictEqual(result.captured.length, 2);
  assert.match(fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8'), /write SAME tests/);
});

test('a new file inside a managed skill dir is reported as new-file, never written', () => {
  const cache = makeCache();
  const project = tmp('myrules-cap-newfile-');
  arrange(project, cache);

  const extra = path.join(project, '.cursor', 'skills', 'project-method', 'notes.md');
  fs.writeFileSync(extra, '- local notes\n');

  const result = capture.captureHandEdits(cache, project, {
    priorHashes: readState(project).deployedHashes,
    claudeUserDir: optsFor(project, cache).claudeUserDir,
    opencodeUserDir: optsFor(project, cache).opencodeUserDir,
    dshUserDir: optsFor(project, cache).dshUserDir,
    runtime: 'agent',
    instanceLanding: false,
  });

  assert.ok(result.conflicts.some((c) => c.reason === 'new-file' && c.abs === extra));
  assert.strictEqual(fs.existsSync(path.join(cache, 'method', 'skills', 'project-method', 'notes.md')), false);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/capture.test.js`
Expected: FAIL（`Cannot find module .../capture`）

- [ ] **Step 3: 实现 `tools/sync/lib/capture.js`**

```js
// tools/sync/lib/capture.js
//
// 捕获决策引擎（spec §4 乐观并发）：对每个缓存源的全部部署拷贝分组判定——
// - 干净（D === emitted(S)）：不动
// - 缓存前进（hash(D) === baseline）：不动，部署照常更新
// - 手改：仅当 baseline === hash(emitted(S))（手改基于当前缓存版本）且
//   各平台候选正文一致时写回缓存源；否则冲突报告，文件保留，绝不覆盖。
// 捕获让缓存变 dirty → 下次 sync 被 pull 闸门拦住，直到 push.js 发布。
const fs = require('node:fs');
const path = require('node:path');
const fsutil = require('./fsutil');
const reverseMap = require('./reverse-map');

function captureHandEdits(cacheDir, projectRoot, opts = {}) {
  const entries = reverseMap.buildReverseMap(cacheDir, projectRoot, opts);
  const priorHashes = opts.priorHashes || {};
  const captured = [];
  const conflicts = [];

  // 分组：一个缓存源 ↔ 全部平台拷贝
  const groups = new Map();
  for (const m of entries) {
    if (!fs.existsSync(m.abs)) continue;
    if (!groups.has(m.sourceAbs)) groups.set(m.sourceAbs, []);
    groups.get(m.sourceAbs).push(m);
  }

  for (const [sourceAbs, members] of groups) {
    const S = fs.readFileSync(sourceAbs, 'utf8');
    const edited = [];
    for (const m of members) {
      const D = fs.readFileSync(m.abs, 'utf8');
      const E = reverseMap.emittedSource(m, S);
      if (D === E) continue;
      const baseline = priorHashes[m.stateKey];
      if (baseline && baseline === fsutil.hashContent(D)) continue; // 缓存前进，部署会更新
      edited.push({ m, D, E });
    }
    if (!edited.length) continue;

    const candidates = [];
    for (const { m, D, E } of edited) {
      const baseline = priorHashes[m.stateKey];
      if (!baseline || baseline !== fsutil.hashContent(E)) {
        conflicts.push({ abs: m.abs, sourceAbs, stateKey: m.stateKey, reason: baseline ? 'cache-moved' : 'no-baseline' });
        continue;
      }
      const r = reverseMap.backfillSource(m, S, D);
      if (!r.ok) {
        conflicts.push({ abs: m.abs, sourceAbs, stateKey: m.stateKey, reason: r.reason });
        continue;
      }
      candidates.push({ m, source: r.source });
    }

    const distinct = new Map();
    for (const c of candidates) distinct.set(c.source, c);
    if (distinct.size === 1) {
      const source = [...distinct.keys()][0];
      fs.writeFileSync(sourceAbs, source);
      for (const c of candidates) {
        captured.push({ abs: c.m.abs, sourceAbs, stateKey: c.m.stateKey });
      }
    } else if (distinct.size > 1) {
      for (const c of candidates) {
        conflicts.push({ abs: c.m.abs, sourceAbs, stateKey: c.m.stateKey, reason: 'disagree' });
      }
    }
  }

  // 托管技能目录里的新文件（映射里没有源）：只报告。导到缓存用 export --apply。
  reportNewSkillFiles(entries, projectRoot, conflicts);

  return { captured, conflicts };
}

function reportNewSkillFiles(entries, projectRoot, conflicts) {
  const known = new Set(entries.map((e) => e.abs));
  const skillDirs = new Set();
  for (const e of entries) {
    if (e.surface !== 'skill') continue;
    skillDirs.add(path.dirname(e.abs));
  }
  for (const dir of skillDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (!fs.statSync(abs).isFile()) continue;
      if (known.has(abs)) continue;
      conflicts.push({ abs, sourceAbs: null, stateKey: null, reason: 'new-file' });
    }
  }
}

module.exports = { captureHandEdits };
```

注意 `reportNewSkillFiles` 只扫一级目录文件（技能目录下的子目录如 `templates/` 由映射枚举，若子目录出现新文件属边缘场景，v1 不覆盖——这与 export 的递归报告不同步是已接受的取舍）。若想一步到位，把 `walkFiles` 从 reverse-map 导出并递归扫（diff 仅几行），测试新增一条子目录新文件断言。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/capture.test.js`
Expected: 全 PASS

- [ ] **Step 5: Commit**

```powershell
git add tools/sync/lib/capture.js tests/capture.test.js
git commit -m "feat: 捕获决策引擎 capture（乐观并发 + 平台一致性）"
```

---

### Task 4: sync 接线：捕获 pass、--no-capture、闸门文案（含集成测试）

**Files:**
- Modify: `tools/sync/sync.js`
- Test: `tests/capture-sync.test.js`

**Interfaces:**
- Consumes: `capture.captureHandEdits`（Task 3）、既有 `state.readState` / `runtimeLib.hasInstanceLanding` / `paths.getDshUserRulesDir`
- Produces: CLI 旗标 `--no-capture`；`syncOne` 输出两段新报告（捕获清单 / 冲突清单）；闸门错误文案含 `possibly captured edits`

- [ ] **Step 1: 写失败集成测试 `tests/capture-sync.test.js`**

```js
// tests/capture-sync.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { seedCacheContent, writeRuntime } = require('./helpers/cache-seed');
const syncCli = require('../tools/sync/sync');
const pushCli = require('../tools/sync/push');
const installSkillCli = require('../tools/sync/install-skill');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeCacheRepo() {
  const cache = tmp('myrules-capsync-cache-');
  seedCacheContent(cache);
  execFileSync('git', ['init'], { cwd: cache, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: cache, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: cache, stdio: 'ignore' });
  execFileSync('git', ['add', '-A'], { cwd: cache, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: cache, stdio: 'ignore' });
  return cache;
}

function syncOpts(project, cache, extra = {}) {
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
    dshUserDir: path.join(project, '.fake-home', '.dsh', 'rules'),
    ...extra,
  };
}

function arrange(project, cache) {
  installSkillCli.run({ project, sourceDir: installSkillCli.getBundledRepoRoot() });
  writeRuntime(project, 'agent');
  syncCli.run(syncOpts(project, cache));
}

test('end-to-end: hand edit is captured on sync, converges all copies, push publishes', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-capsync-e2e-');
  arrange(project, cache);

  const deployed = path.join(project, '.cursor', 'rules', 'myrules-testing.mdc');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write E2E tests'));

  syncCli.run(syncOpts(project, cache)); // 捕获 + 部署收敛

  const source = fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8');
  assert.match(source, /write E2E tests/);
  for (const rel of ['.cursor/rules/myrules-testing.mdc', '.claude/rules/myrules-testing.md', '.dsh/rules/myrules-testing.md']) {
    assert.match(fs.readFileSync(path.join(project, rel), 'utf8'), /write E2E tests/);
  }
  // 捕获让缓存 dirty；push 后干净
  execFileSync('git', ['status', '--porcelain'], { cwd: cache, stdio: 'ignore' });
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: cache, encoding: 'utf8' }).trim();
  assert.ok(dirty.length > 0, 'cache must be dirty after capture');
  pushCli.run({ cacheDir: cache, message: 'publish capture' });
  const clean = execFileSync('git', ['status', '--porcelain'], { cwd: cache, encoding: 'utf8' }).trim();
  assert.strictEqual(clean, '');

  syncCli.run(syncOpts(project, cache)); // 幂等：无捕获、无漂移
  const s = JSON.parse(fs.readFileSync(path.join(project, '.myrules-sync-state.json'), 'utf8'));
  assert.ok(Object.keys(s.deployedHashes).length > 0);
});

test('sync refuses to run while captured edits are unpublished (gate)', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-capsync-gate-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write GATE tests'));
  syncCli.run(syncOpts(project, cache)); // 捕获 → cache dirty

  assert.throws(
    () => syncCli.run(syncOpts(project, cache, { skipPull: false })),
    /uncommitted changes/
  );
  pushCli.run({ cacheDir: cache, message: 'publish' });
  assert.doesNotThrow(() => syncCli.run(syncOpts(project, cache, { skipPull: false, skipEnsureCache: true })));
});

test('--no-capture keeps the edit local and leaves the cache untouched', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-capsync-nocap-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write LOCAL tests'));

  syncCli.run(syncOpts(project, cache, { noCapture: true }));
  assert.ok(!fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8').includes('write LOCAL tests'));
  assert.match(fs.readFileSync(deployed, 'utf8'), /write LOCAL tests/);
});

test('--force discards the edit without capturing it', () => {
  const cache = makeCacheRepo();
  const project = tmp('myrules-capsync-force-');
  arrange(project, cache);

  const deployed = path.join(project, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployed, fs.readFileSync(deployed, 'utf8').replace('write tests', 'write FORCED tests'));

  syncCli.run(syncOpts(project, cache, { force: true }));
  assert.ok(!fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8').includes('write FORCED tests'));
  assert.ok(!fs.readFileSync(deployed, 'utf8').includes('write FORCED tests'), 'force overwrites local edits');
});

test('two projects: first capture wins, second gets a cache-moved conflict (no ping-pong)', () => {
  const cache = makeCacheRepo();
  const projectA = tmp('myrules-capsync-pa-');
  const projectB = tmp('myrules-capsync-pb-');
  arrange(projectA, cache);
  arrange(projectB, cache);

  const b = path.join(projectB, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(b, fs.readFileSync(b, 'utf8').replace('write tests', 'write B tests'));
  const a = path.join(projectA, '.claude', 'rules', 'myrules-testing.md');
  fs.writeFileSync(a, fs.readFileSync(a, 'utf8').replace('write tests', 'write A tests'));

  syncCli.run(syncOpts(projectA, cache)); // A 先捕获
  assert.match(fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8'), /write A tests/);

  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  try {
    syncCli.run(syncOpts(projectB, cache)); // B 的手改基于旧缓存 → 冲突，保留
  } finally {
    console.warn = origWarn;
  }
  assert.match(fs.readFileSync(b, 'utf8'), /write B tests/);
  assert.match(warns.join('\n'), /cache-moved|冲突|not captured/i);
});
```

注意：`syncOpts` 里 `dshUserDir` 传 fake 目录以隔离 HOME；`skipEnsureCache` 在现有测试里出现过（cli-sync.test.js 一带），若 `sync.js` 的 parseArgs/run 不识别该键则删掉它——`syncOne` 不读该键，只是透传，无害。`--no-capture` 经 `parseArgs` 后落在 `args.noCapture`；直接传对象给 `run` 时键名是 `noCapture`。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/capture-sync.test.js`
Expected: FAIL（捕获未接线：source 未更新 / 闸门文案不含 `possibly captured edits` 等）

- [ ] **Step 3: 改 `tools/sync/sync.js`**

三处修改：

(a) 顶部 require（`dshRoles` 之后）：

```js
const capture = require('./lib/capture');
```

(b) `parseArgs` 增加旗标（与 `--force` 并列）：

```js
    else if (argv[i] === '--no-capture') args.noCapture = true;
```

并在 `const args = {...}` 初始化行加 `noCapture: false`。

(c) `syncOne` 中 `const current = state.readState(projectRoot);` 之后、`const result = deploy.deployRules(...)` 之前插入捕获 pass：

```js
  // 捕获 pass（部署之前）：可反查的手改自动写回缓存源（spec capture-on-sync）。
  // --force 的既有语义是丢弃本地改动，与捕获互斥；--no-capture 退回「告警 + export」模式。
  if (!opts.noCapture && !opts.force) {
    const captureResult = capture.captureHandEdits(cacheDir, projectRoot, {
      manifest,
      runtime,
      instanceLanding: runtimeLib.hasInstanceLanding(projectRoot),
      priorHashes: current.deployedHashes || {},
      ...(opts.claudeUserDir ? { claudeUserDir: opts.claudeUserDir } : {}),
      ...(opts.opencodeUserDir ? { opencodeUserDir: opts.opencodeUserDir } : {}),
      dshUserDir: opts.dshUserDir || paths.getDshUserRulesDir(homeDir),
    });
    reportCaptures(projectRoot, captureResult);
  }
```

并在 `reportDrifted` 函数旁新增两个打印函数：

```js
const CAPTURE_CONFLICT_TEXT = {
  'no-baseline': 'no deploy baseline in sync state',
  'cache-moved': 'cache source changed since your edit (published elsewhere) - merge by hand in ~/.myrules and push',
  'header-edit': 'frontmatter changed; only body edits auto-capture - copy it into ~/.myrules by hand',
  'disagree': 'platform copies disagree (two different edits) - pick one in ~/.myrules and push',
  'new-file': 'new file in a managed skill dir - run export --apply to add it to the cache',
};

function displayRel(projectRoot, abs) {
  const rel = path.relative(projectRoot, abs).replace(/\\/g, '/');
  return rel && !rel.startsWith('..') ? rel : abs;
}

function reportCaptures(projectRoot, result) {
  if (result.captured.length) {
    console.log(`Captured ${result.captured.length} hand edit(s) into ~/.myrules (run push.js to publish):`);
    for (const c of result.captured) {
      const srcRel = c.sourceAbs.replace(/\\/g, '/').replace(/^.*\/\.myrules\//, '~/.myrules/');
      console.log(`  ${displayRel(projectRoot, c.abs)} -> ${srcRel}`);
    }
  }
  if (result.conflicts.length) {
    console.warn(`NOT captured: ${result.conflicts.length} hand edit(s) (kept as-is, never overwritten):`);
    for (const c of result.conflicts) {
      console.warn(`  ${displayRel(projectRoot, c.abs)} -> ${CAPTURE_CONFLICT_TEXT[c.reason]}`);
    }
  }
}
```

(d) 闸门文案（`run` 里 `if (git.isDirty(cacheDir))` 的 throw）：

```js
      throw new Error(`${cacheDir} has uncommitted changes (possibly captured edits). Run node tools/sync/push.js to publish, or resolve manually.`);
```

- [ ] **Step 4: 跑测试确认通过（含回归）**

Run: `npm test`
Expected: 全 PASS（新增 5 条 + 既有 282 条 + Task 1/2 新增）

- [ ] **Step 5: Commit**

```powershell
git add tools/sync/sync.js tests/capture-sync.test.js
git commit -m "feat: sync 自动捕获手改回流缓存（--no-capture 逃生阀，闸门文案升级）"
```

---

### Task 5: export 源解析统一到 reverse-map

**Files:**
- Modify: `tools/sync/lib/export.js`（`diffSkills` 的源解析改用 `reverseMap.skillSourceFor`，删除私有 `skillSourceMap`）
- Test: 既有 `tests/export.test.js` 全绿即回归通过；不新增测试文件

**Interfaces:**
- Consumes: `reverseMap.skillSourceFor(destRel, manifest) -> string|null`（Task 2）
- Produces: 无新接口（export 报告结构不变：`{ toUpdate, sourceMissing }`，条目 `{ deployedFile, sourceFile, body, kind }`）

- [ ] **Step 1: 改 `tools/sync/lib/export.js`**

删除 `skillSourceMap(manifest)` 函数与 `isSkillsRoot`（改用 reverse-map 的导出）。`diffSkills` 中：

```js
  const sourceMap = skillSourceMap(manifest);
```

及其后的 `const sourceRel = sourceMap.get(destRel) || ...` 行，替换为：

```js
        const sourceRel = reverseMap.skillSourceFor(destRel, manifest);
        if (!sourceRel) continue;
        diffSkillFile(abs, path.join(cacheDir, sourceRel), report);
```

顶部 require 追加 `const reverseMap = require('./reverse-map');`；`skillNameOfTarget` 改为 `reverseMap.skillNameOfTarget`（删除本地副本）。`walkFiles` / `SKILL_PLATFORMS` 保留本地（export 的 dest 驱动扫描语义与 capture 的 source 驱动枚举不同，见 spec §3：export 要能发现「项目里多出来的文件」并报 `sourceMissing`）。

- [ ] **Step 2: 跑测试确认通过**

Run: `node --test tests/export.test.js tests/reverse-map.test.js`
Expected: 全 PASS（export 既有 13 条断言场景不变：模板映射、私有技能忽略、instanceLanding 排除、sourceMissing 报告）

- [ ] **Step 3: Commit**

```powershell
git add tools/sync/lib/export.js
git commit -m "refactor: export 技能源解析复用 reverse-map.skillSourceFor"
```

---

### Task 6: 文档、spec 补记、全量回归、真机验证

**Files:**
- Modify: `skills/myrules/REFERENCE.md`、`skills/myrules/COMMANDS.md`、`docs/superpowers/specs/2026-09-26-myrules-capture-design.md`

**Interfaces:** 无（纯文档）。

- [ ] **Step 1: spec 决策表补一行（--force 与捕获互斥，实现期澄清）**

在 spec「决策记录」表末尾追加：

```markdown
| `--force` 跳过捕获 | `--force` 的既有语义是丢弃本地改动；捕获默认开启后二者互斥，`--force` = 明确要缓存版。`--no-capture` 才是「保留本地改动但不回流」的开关 |
```

- [ ] **Step 2: `skills/myrules/REFERENCE.md` 更新三处**

(a) Method pack 行的结尾句改为：

```markdown
project copies are tracked artifacts; body edits are auto-captured back into the cache on the next sync (run push.js to publish), frontmatter edits and cross-platform disagreements are reported and left alone
```

(b) Safety rules 第一条（sync skips and reports...）整条替换为：

```markdown
- Hand edits to deployable artifacts are **auto-captured** back into `~/.myrules`
  on the next sync (body edits only; frontmatter is preserved). Publishing is
  mandatory: captured edits dirty the cache and the next sync refuses to run
  until `push.js` is executed. Capture is refused and reported, never applied,
  when: the cache source moved on since your edit, sync state has no baseline,
  frontmatter changed, or two platform copies disagree. `--no-capture` keeps
  edits local (warn only); `--force` discards local edits (never captures).
  Composite artifacts (agent bundles, hooks, hooks.json, managed blocks) have no
  reverse path: edit the source in `~/.myrules/` and push.
```

(c) 失败处理表「Deployed **artifact** locally modified (drift)」行替换为两行：

```markdown
| Hand edit, baseline matches cache | Auto-captured into cache source; deploy converges all copies; push.js required next |
| Hand edit, conflict (cache moved / no baseline / header edit / platform disagreement) | Not captured; reported every sync; file kept as-is |
| Hand edit with `--no-capture` | Not captured; drift warning with export advice |
| New file in a managed skill dir | Reported; `export --apply` adds it to the cache |
```

(d) `export.js` 那一条改为：

```markdown
- `export.js` is the **preview/inspection** tool (report mode) plus manual
  backfill (`--apply` writes skill edits back to the cache; rules stay
  report-only because their sources carry `agents:` / `runtimes:` frontmatter).
  Normal flow no longer needs it: sync auto-captures.
```

- [ ] **Step 3: `skills/myrules/COMMANDS.md` 表格补一行并调整 export 行**

```markdown
| Auto-capture hand edits on sync (default) | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>"` ; disable with `--no-capture` |
```

（export 行保留，措辞加 "preview"。）

- [ ] **Step 4: 全量回归**

Run: `npm test`
Expected: 全 PASS（Task 1-5 累计：282 基线 + rule-targets 4 + reverse-map 8 + capture 6 + capture-sync 5 ≈ 305 条）

- [ ] **Step 5: Commit**

```powershell
git add skills/myrules/REFERENCE.md skills/myrules/COMMANDS.md docs/superpowers/specs/2026-09-26-myrules-capture-design.md
git commit -m "docs: capture-on-sync 工作流、逃生阀与失败处理表更新"
```

- [ ] **Step 6: 真机验证（wiki 项目，需人工执行/陪同）**

```powershell
# 1. 手改技能
Add-Content -Path "d:\llm wiki\trading-review-wiki-1\.cursor\skills\writing-for-the-reader\SKILL.md" "`n<!-- CAPTURE_E2E -->" -NoNewline
# 2. sync：期望打印 "Captured 1 hand edit(s) into ~/.myrules (run push.js to publish):"
node tools/sync/sync.js --project "d:\llm wiki\trading-review-wiki-1"
# 3. 再 sync：期望闸门拒绝 "uncommitted changes (possibly captured edits)"
node tools/sync/sync.js --project "d:\llm wiki\trading-review-wiki-1"
# 4. 发布后 sync：期望全绿收敛，三个 skills 目录都有 CAPTURE_E2E
node tools/sync/push.js -m "test capture"
node tools/sync/sync.js --project "d:\llm wiki\trading-review-wiki-1"
# 5. 还原现场：git revert 测试提交 → 重新 push → sync（或手工删标记行）
```

验收标准：第 2 步捕获清单指向 `method/skills/writing-for-the-reader/SKILL.md`；第 3 步确实拒绝；第 4 步三平台收敛；第 5 步现场干净（`git status` 无输出、无 `CAPTURE_E2E` 残留）。

---

## Self-Review 记录

1. **Spec 覆盖**：§2 捕获语义 → Task 3/4；§3 映射与体裁 → Task 1/2（frontmatter 保留、逐字节、用户级目标、preserve 排除）；§4 冲突三条件 + ping-pong → Task 3（含两项目集成测试）；§5 闸门 + 文案 → Task 4(d)；§6 不可逆告警 → 既有 drift 机制不动（Task 4 不触碰 reportDrifted）；§7 CLI/export/push → Task 4(b)/5；§8 测试 → Task 1-5 测试 + Task 6 真机。**补**：spec 未规定 `--force` 交互，实现期定为互斥（跳过捕获），Task 6 Step 1 回填 spec。
2. **占位符**：无 TBD/TODO；所有代码块可直接落地。
3. **类型一致性**：`captureHandEdits` 返回 `{captured, conflicts}`（Task 3 定义、Task 4 消费一致）；Member 字段 `stateKey/sourceAbs/abs/surface/backfill/methodKind/topic/emit` 在 Task 2 定义、Task 3 使用一致；`skillSourceFor` 在 Task 2 定义、Task 5 消费一致。
