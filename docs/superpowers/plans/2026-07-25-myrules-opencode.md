# MyRules OpenCode Support — Phase 1 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenCode as a first-class deploy target alongside Cursor and Claude. Phase 1 covers rule files + custom agents. Skills are already covered (OpenCode reads `~/.claude/skills/` natively — zero changes). Hooks are deferred to Phase 2 (OpenCode has no event-hook mechanism; the Claude soft-convention prose can be surfaced via `instructions` later).

**OpenCode conventions (verified 2026-07-25 against https://opencode.ai/docs/):**

| Concept | Project-level | Global (user-level) |
|---------|---------------|---------------------|
| Rules entry | `AGENTS.md` (protected, not managed) + `opencode.json` `instructions` glob | `~/.config/opencode/AGENTS.md` (protected) + `~/.config/opencode/opencode.json` `instructions` glob |
| Rule files (our deploy targets) | `.opencode/rules/myrules-*.md` (referenced via `instructions`) | `~/.config/opencode/rules/myrules-user-*.md` (referenced via global `instructions`) |
| Config file | `opencode.json` (project root) | `~/.config/opencode/opencode.json` |
| Custom agents | `.opencode/agents/*.md` | `~/.config/opencode/agents/*.md` |
| Skills | `.claude/skills/<name>/SKILL.md` (already deployed — no change) | `~/.claude/skills/<name>/SKILL.md` (already deployed — no change) |

Key facts driving the design:

- OpenCode has **no `.opencode/rules/` native directory** — rule files are only loaded if `opencode.json`'s `instructions` array references them (path or glob). So deploying rules requires also maintaining `opencode.json`'s `instructions` field.
- OpenCode **natively reads `.claude/skills/*/SKILL.md`** and `~/.claude/skills/*/SKILL.md` — MyRules' existing skill deploy already covers OpenCode. No skill code changes needed.
- `AGENTS.md` and `CLAUDE.md` are both in the protect list already ([manifest.js:9-17](../../../manifest.js#L9-L17)) — correct, since OpenCode reads both as rule entry points.
- OpenCode agent frontmatter differs from Cursor (`readonly`) and Claude (`permissionMode`): it uses `mode` + `permission` (object). The agent `name` comes from the filename, not the frontmatter.
- OpenCode has **no event hooks** — only manual `/commands` and plugins. Phase 1 does not deploy hooks prose to OpenCode.

**Architecture:** Same pattern as Cursor/Claude: add an `opencode` config block to `manifest.js`, add path/transform/deploy branches alongside the existing two platforms, and add one new module (`opencode-config-deploy.js`) that maintains the `instructions` array in `opencode.json` — structurally identical to how `hooks-deploy.js` maintains `hooks.json`.

**Tech Stack:** unchanged — Node.js built-ins only, `node:test` + `node:assert`.

## Global Constraints (Phase 1)

- OpenCode rule files deploy to `.opencode/rules/myrules-*.md` (project) and `~/.config/opencode/rules/myrules-user-*.md` (user). Pure markdown, no frontmatter (same as Claude).
- `opencode.json` (project root) and `~/.config/opencode/opencode.json` (global) get an `instructions` entry referencing the deployed glob. MyRules only manages entries it owns; foreign entries are preserved. Merge logic mirrors `mergeHooksJson` ([hooks-deploy.js:11-48](../../../tools/sync/lib/hooks-deploy.js#L11-L48)).
- OpenCode agents deploy to `.opencode/agents/myrules-<role>.md`. Frontmatter: `description` (required), `mode: subagent`, optional `permission` object (derived from `readonly`). No `name` field (filename is the name). No `model` field when `model: "inherit"` (omit so OpenCode uses its default inheritance).
- `AGENTS.md` stays in the protect list — never read, written, or pruned.
- Skills: **no changes** — OpenCode reads the existing `.claude/skills/` deploy targets.

---

## File Map

| Path | Action | Responsibility |
|------|--------|----------------|
| `manifest.js` | Modify | Add `opencode` platform block |
| `tools/sync/lib/paths.js` | Modify | Add OpenCode path resolvers |
| `tools/sync/lib/transform.js` | Modify | Add `transformForOpencode` + `platform: 'opencode'` in `transformForAgent` |
| `tools/sync/lib/deploy.js` | Modify | Add OpenCode rule deploy branch + stale cleanup |
| `tools/sync/lib/opencode-config-deploy.js` | Create | Maintain `instructions` array in `opencode.json` (project + global) |
| `tools/sync/lib/deploy-agents.js` | Modify | Add OpenCode agent deploy branch |
| `tools/sync/lib/legacy.js` | Modify | Scan `.opencode/rules/` for non-managed files |
| `tools/sync/lib/gitignore.js` | Modify | Add OpenCode deploy artifacts to gitignore block |
| `tools/sync/lib/export.js` | Modify | Add OpenCode dirs to reverse-mapping scan |
| `tools/sync/lib/state.js` | Modify | Add `deployedOpencodeInstructions` field |
| `tools/sync/sync.js` | Modify | Wire OpenCode deploy steps into `syncOne` + user-level deploy into `run` |
| `tests/paths.test.js` | Modify | OpenCode path cases |
| `tests/transform.test.js` | Modify | OpenCode transform cases |
| `tests/deploy.test.js` | Modify | OpenCode rule deploy cases |
| `tests/opencode-config-deploy.test.js` | Create | `mergeInstructions` + deploy tests |
| `tests/deploy-agents.test.js` | Modify | OpenCode agent cases |
| `tests/legacy.test.js` | Modify | OpenCode scan cases |
| `tests/gitignore.test.js` | Modify | OpenCode gitignore cases |
| `tests/export.test.js` | Modify | OpenCode reverse-mapping cases |
| `tests/cli-sync.test.js` | Modify | OpenCode integration via `sync.run` |
| `tests/e2e.test.js` | Modify | OpenCode end-to-end assertions |

---

### Task 1: Manifest config block + path resolvers

**Files:**
- Modify: `manifest.js`, `tools/sync/lib/paths.js`
- Test: `tests/paths.test.js`

**Interfaces:**
- `manifest.opencode`: `{ projectRulesDir, userRulesDir, userConfigDir, projectConfigFile, extension, agentsDir }`
- `paths.getOpencodeProjectRulesDir(projectRoot)` -> `<project>/.opencode/rules`
- `paths.getOpencodeUserRulesDir(homeDir)` -> `<home>/.config/opencode/rules`
- `paths.getOpencodeUserConfigDir(homeDir)` -> `<home>/.config/opencode`
- `paths.getOpencodeProjectConfigFile(projectRoot)` -> `<project>/opencode.json`
- `paths.getOpencodeUserConfigFile(homeDir)` -> `<home>/.config/opencode/opencode.json`
- `paths.getOpencodeAgentsDir(projectRoot)` -> `<project>/.opencode/agents`

- [ ] **Step 1: Add `opencode` block to `manifest.js`**

Add `"opencode"` to the `platforms` array and a new config block. Insert after the `claude` block:

```javascript
  opencode: {
    projectRulesDir: ".opencode/rules",
    userRulesDir: "~/.config/opencode/rules",
    userConfigDir: "~/.config/opencode",
    projectConfigFile: "opencode.json",
    userConfigFile: "~/.config/opencode/opencode.json",
    extension: ".md",
    agentsDir: ".opencode/agents",
    // instructions glob entries MyRules adds to opencode.json
    projectInstructionsGlob: ".opencode/rules/myrules-*.md",
    userInstructionsGlob: "rules/myrules-user-*.md",
  },
```

Also add `"opencode"` to `platforms: ["cursor", "claude", "opencode"]`.

- [ ] **Step 2: Write failing tests in `tests/paths.test.js`**

Append:

```javascript
test('getOpencodeProjectRulesDir joins project root and .opencode/rules', () => {
  const result = paths.getOpencodeProjectRulesDir('/tmp/myproject');
  assert.strictEqual(result, path.join('/tmp/myproject', '.opencode', 'rules'));
});

test('getOpencodeUserRulesDir joins homeDir and .config/opencode/rules', () => {
  const result = paths.getOpencodeUserRulesDir('/home/alice');
  assert.strictEqual(result, path.join('/home/alice', '.config', 'opencode', 'rules'));
});

test('getOpencodeUserConfigDir joins homeDir and .config/opencode', () => {
  const result = paths.getOpencodeUserConfigDir('/home/alice');
  assert.strictEqual(result, path.join('/home/alice', '.config', 'opencode'));
});

test('getOpencodeProjectConfigFile returns opencode.json at project root', () => {
  const result = paths.getOpencodeProjectConfigFile('/tmp/myproject');
  assert.strictEqual(result, path.join('/tmp/myproject', 'opencode.json'));
});

test('getOpencodeUserConfigFile joins homeDir and .config/opencode/opencode.json', () => {
  const result = paths.getOpencodeUserConfigFile('/home/alice');
  assert.strictEqual(result, path.join('/home/alice', '.config', 'opencode', 'opencode.json'));
});

test('getOpencodeAgentsDir joins project root and .opencode/agents', () => {
  const result = paths.getOpencodeAgentsDir('/tmp/myproject');
  assert.strictEqual(result, path.join('/tmp/myproject', '.opencode', 'agents'));
});
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
node --test tests/paths.test.js
```

- [ ] **Step 4: Implement in `tools/sync/lib/paths.js`**

Add:

```javascript
function getOpencodeProjectRulesDir(projectRoot) {
  return path.join(projectRoot, '.opencode', 'rules');
}

function getOpencodeUserRulesDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.config', 'opencode', 'rules');
}

function getOpencodeUserConfigDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.config', 'opencode');
}

function getOpencodeProjectConfigFile(projectRoot) {
  return path.join(projectRoot, 'opencode.json');
}

function getOpencodeUserConfigFile(homeDir = os.homedir()) {
  return path.join(homeDir, '.config', 'opencode', 'opencode.json');
}

function getOpencodeAgentsDir(projectRoot) {
  return path.join(projectRoot, '.opencode', 'agents');
}
```

Export all six new functions.

- [ ] **Step 5: Run test — expect PASS**

```bash
node --test tests/paths.test.js
```

- [ ] **Step 6: Commit**

```bash
git add manifest.js tools/sync/lib/paths.js tests/paths.test.js
git commit -m "feat(opencode): add manifest config block and path resolvers"
```

---

### Task 2: Transform layer for OpenCode rules and agents

**Files:**
- Modify: `tools/sync/lib/transform.js`
- Test: `tests/transform.test.js`

**Interfaces:**
- `transformForOpencode(body)` -> `body` unchanged (pure markdown, no frontmatter — same as Claude)
- `transformForAgent({ ..., platform: 'opencode' })` -> OpenCode agent markdown with `description`, `mode: subagent`, optional `permission`, no `name`, no `model` when `inherit`

- [ ] **Step 1: Write failing tests in `tests/transform.test.js`**

Append:

```javascript
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
  assert.doesNotMatch(out, /name:/);
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
```

**Regression guard:** the existing claude agent test at `tests/transform.test.js:91-112` only asserts `permissionMode` - it does not check that `name:` and `model:` survive the refactor. Add a dedicated regression test that asserts both fields for cursor **and** claude:

```javascript
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
    assert.match(out, /name: "myrules-reviewer"/, `${platform} missing name field`);
    assert.match(out, /model: "inherit"/, `${platform} missing model field`);
  }
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
node --test tests/transform.test.js
```

- [ ] **Step 3: Implement in `tools/sync/lib/transform.js`**

Add `transformForOpencode`:

```javascript
function transformForOpencode(body) {
  return body;
}
```

Extend `transformForAgent` — add an `opencode` branch. The function currently has `if (platform === 'cursor') ... else if (platform === 'claude') ...`. Add after the claude branch:

```javascript
  } else if (platform === 'opencode') {
    lines.push(yamlLine('mode', 'subagent'));
    if (roleMeta.readonly) {
      lines.push('permission:');
      lines.push('  edit: deny');
      lines.push('  bash: deny');
    }
  }
```

Also: the current function unconditionally writes `yamlLine('model', roleMeta.model || 'inherit')`. For OpenCode, `model: "inherit"` is not a valid value — OpenCode expects `provider/model-id` or omission. Move the model line into the cursor/claude branches only:

```javascript
  const lines = [
    '---',
    yamlLine('description', roleMeta.description),
  ];

  if (platform === 'cursor') {
    lines.push(yamlLine('name', agentName));
    lines.push(yamlLine('model', roleMeta.model || 'inherit'));
    lines.push(yamlLine('readonly', roleMeta.readonly === true));
  } else if (platform === 'claude') {
    lines.push(yamlLine('name', agentName));
    lines.push(yamlLine('model', roleMeta.model || 'inherit'));
    const permissionMode = roleMeta.readonly ? 'plan' : 'default';
    lines.push(yamlLine('permissionMode', permissionMode));
  } else if (platform === 'opencode') {
    // name comes from filename in OpenCode; model omitted so OpenCode uses default inheritance
    lines.push(yamlLine('mode', 'subagent'));
    if (roleMeta.readonly) {
      lines.push('permission:');
      lines.push('  edit: deny');
      lines.push('  bash: deny');
    }
  }
```

**Note:** moving `name` and `model` into the branches changes the cursor/claude output order (name/description/model vs description/name/model). Verify existing `tests/transform.test.js` and `tests/deploy-agents.test.js` still pass — they assert via `assert.match` not exact string equality, so reordering is safe. If any exact-equality assertion breaks, adjust the expected string.

Add `transformForOpencode` to `module.exports`.

- [ ] **Step 4: Run test — expect PASS**

```bash
node --test tests/transform.test.js
```

- [ ] **Step 5: Run agent tests — expect PASS**

```bash
node --test tests/deploy-agents.test.js
```

- [ ] **Step 6: Commit**

```bash
git add tools/sync/lib/transform.js tests/transform.test.js
git commit -m "feat(opencode): add rule and agent transforms for OpenCode"
```

---

### Task 3: Rule deploy with OpenCode branch

**Files:**
- Modify: `tools/sync/lib/deploy.js`
- Test: `tests/deploy.test.js`

**Interfaces:**
- `deployRules` gains an OpenCode branch that writes to `.opencode/rules/myrules-*.md` (project) and `~/.config/opencode/rules/myrules-user-*.md` (user).
- `isRuleStateKey` recognises `.opencode/rules/` keys.
- `staleRuleCleanup` handles opencode paths.
- New optional opts: `opencodeUserDir` (test override, same pattern as `claudeUserDir`).

- [ ] **Step 0: Make existing `tests/deploy.test.js` hermetic for OpenCode**

Every existing `deploy.deployRules(...)` call in `tests/deploy.test.js` passes `claudeUserDir` but not `opencodeUserDir`. Once the OpenCode branch is added (Step 3), these calls will default to the real `~/.config/opencode/rules/` and pollute the dev machine. Fix this **before** implementing the branch.

Add a `fakeOpencodeUserDir` helper next to `fakeClaudeUserDir`:

```javascript
function fakeOpencodeUserDir(project) {
  return path.join(project, '.fake-opencode-home', 'rules');
}
```

Then add `opencodeUserDir: fakeOpencodeUserDir(project)` to every `deploy.deployRules(...)` call in the existing 5 tests. Run `node --test tests/deploy.test.js` after this change - it should still PASS (the opencode branch does not exist yet, so the override is a no-op). Commit this hermetic fix separately:

```bash
git add tests/deploy.test.js
git commit -m "test(deploy): add opencodeUserDir override to existing tests for hermetic isolation"
```

- [ ] **Step 0b: Add byte-level snapshot test for cursor/claude rule outputs**

This is an **invariant test**, not failing-first. It PASSES now (before the opencode branch exists) and must continue to PASS after Step 3 implements the opencode branch. If it fails after Step 3, the opencode change accidentally mutated cursor/claude output.

Baselines below were captured from the current codebase (2026-07-25) by running `deploy.deployRules` and reading the exact file contents.

```javascript
test('deployRules cursor and claude outputs are byte-identical to pre-opencode baseline', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  const opencodeUserDir = fakeOpencodeUserDir(project);
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir });

  // Cursor project rule
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.cursor', 'rules', 'myrules-testing.mdc'), 'utf8'),
    '---\ndescription: "MyRules: testing"\nalwaysApply: true\n---\n\n# Testing\n\n- write tests'
  );
  // Claude project rule
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.claude', 'rules', 'myrules-testing.md'), 'utf8'),
    '# Testing\n\n- write tests'
  );
  // Cursor user rule
  assert.strictEqual(
    fs.readFileSync(path.join(project, '.cursor', 'rules', 'myrules-user-preferences.mdc'), 'utf8'),
    '---\ndescription: "MyRules: preferences"\nalwaysApply: true\n---\n\n# Preferences\n\n- be concise'
  );
  // Claude user rule
  assert.strictEqual(
    fs.readFileSync(path.join(claudeUserDir, 'myrules-user-preferences.md'), 'utf8'),
    '# Preferences\n\n- be concise'
  );
});
```

Run `node --test tests/deploy.test.js` - should PASS. Commit:

```bash
git add tests/deploy.test.js
git commit -m "test(deploy): add byte-level snapshot for cursor/claude rule outputs"
```

- [ ] **Step 1: Write failing tests in `tests/deploy.test.js`**

Append. Follow the existing `fakeClaudeUserDir` pattern — never point tests at the real home directory.

```javascript
test('deployRules writes OpenCode project and user rule files', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  const opencodeUserDir = path.join(project, '.fake-opencode-home', 'rules');
  const result = deploy.deployRules(cache, project, {
    force: false,
    priorHashes: {},
    claudeUserDir,
    opencodeUserDir,
  });

  const opencodeProject = path.join(project, '.opencode', 'rules', 'myrules-testing.md');
  const opencodeUser = path.join(opencodeUserDir, 'myrules-user-preferences.md');

  assert.ok(fs.existsSync(opencodeProject), 'missing opencode project rule');
  assert.ok(fs.existsSync(opencodeUser), 'missing opencode user rule');
  assert.strictEqual(fs.readFileSync(opencodeProject, 'utf8'), fs.readFileSync(path.join(cache, 'rules', 'project', 'testing.md'), 'utf8'));
  assert.strictEqual(result.drifted.length, 0);
  assert.ok(Object.keys(result.hashes).some((k) => k.startsWith('.opencode/rules/')));
});

test('deployRules skips a hand-edited OpenCode rule file and reports it as drifted', () => {
  const cache = makeCache();
  const project = makeProject();
  const claudeUserDir = fakeClaudeUserDir(project);
  const opencodeUserDir = path.join(project, '.fake-opencode-home', 'rules');
  const first = deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir });

  const target = path.join(project, '.opencode', 'rules', 'myrules-testing.md');
  fs.writeFileSync(target, 'hand-edited');

  const second = deploy.deployRules(cache, project, { force: false, priorHashes: first.hashes, claudeUserDir, opencodeUserDir });
  assert.ok(second.drifted.includes(target));
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'hand-edited');
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
node --test tests/deploy.test.js
```

- [ ] **Step 3: Implement in `tools/sync/lib/deploy.js`**

Add `opencodeUserDir` to opts destructuring (default to `paths.getOpencodeUserRulesDir()`):

```javascript
  const opencodeUserDir = opts.opencodeUserDir || paths.getOpencodeUserRulesDir();
  const opencodeProjDir = paths.getOpencodeProjectRulesDir(projectRoot);
```

`mkdirSync` both after the existing claude dirs.

In the `for (const category of ['user', 'project'])` loop, after the claude `writeTracked` calls, add an opencode branch:

```javascript
      if (category === 'user') {
        const opencodeName = `${userPrefix}${topic}.md`;
        const opencodeTarget = path.join(opencodeUserDir, opencodeName);
        const opencodeStateKey = `~opencode-user~/${opencodeName}`;
        tracker.writeTracked(opencodeTarget, transform.transformForOpencode(body), opencodeStateKey);
      } else {
        const opencodeName = `${prefix}${topic}.md`;
        const opencodeTarget = path.join(opencodeProjDir, opencodeName);
        const opencodeStateKey = path.posix.join('.opencode/rules', opencodeName);
        tracker.writeTracked(opencodeTarget, transform.transformForOpencode(body), opencodeStateKey);
      }
```

Update `isRuleStateKey` to also recognise opencode keys:

```javascript
function isRuleStateKey(key) {
  if (key.startsWith('script:') || key.startsWith('claude:')) return false;
  return (
    key.startsWith('.cursor/rules/') ||
    key.startsWith('.claude/rules/') ||
    key.startsWith('.opencode/rules/') ||
    key.startsWith('~claude-user~/') ||
    key.startsWith('~opencode-user~/')
  );
}
```

Update `staleRuleCleanup` to resolve `~opencode-user~/` keys:

```javascript
    const filePath = key.startsWith('~claude-user~/')
      ? path.join(claudeUserDir, key.slice('~claude-user~/'.length))
      : key.startsWith('~opencode-user~/')
        ? path.join(opencodeUserDir, key.slice('~opencode-user~/'.length))
        : path.join(projectRoot, key);
```

This requires `staleRuleCleanup` to receive `opencodeUserDir` — add it as a parameter and thread it through the call site at the bottom of `deployRules`.

- [ ] **Step 4: Run test — expect PASS**

```bash
node --test tests/deploy.test.js
```

- [ ] **Step 4b: Run full suite - confirm no cursor/claude regression**

```bash
node --test tests/
```

The deploy change touches `deployRules` which is called by `cli-sync.test.js` and `e2e.test.js`. If those break due to hash-count or file-count assertions, fix the assertion (existing `Object.keys(result.hashes).length >= 2` style assertions are safe; any exact-count assertions need bumping).

- [ ] **Step 5: Commit**

```bash
git add tools/sync/lib/deploy.js tests/deploy.test.js
git commit -m "feat(opencode): deploy rule files to .opencode/rules/ with drift detection"
```

---

### Task 4: OpenCode config deploy (maintain `instructions` in `opencode.json`)

**Files:**
- Create: `tools/sync/lib/opencode-config-deploy.js`
- Test: `tests/opencode-config-deploy.test.js`

**Interfaces:**
- `mergeInstructions(existing, previousEntries, currentEntries)` -> merged config object
  - `existing`: parsed `opencode.json` object or `null`
  - `previousEntries`: array of strings MyRules previously deployed (from state), used for exact-match removal
  - `currentEntries`: array of strings MyRules wants to deploy now
  - Preserves all foreign `instructions` entries and all other config keys. When `previousEntries` is empty, falls back to substring filter on `myrules-` (handles first-run and upgrade from pre-state versions).
- `deployProjectConfig(cacheDir, projectRoot, opts)` -> `{ instructions: string[], wrote: boolean, drifted: [] }`
  - Reads/writes `<project>/opencode.json`. Adds `manifest.opencode.projectInstructionsGlob` to `instructions` array.
- `deployUserConfig(cacheDir, opts)` -> same shape, operates on `~/.config/opencode/opencode.json`
  - Adds `manifest.opencode.userInstructionsGlob`.

The `instructions` entry is a single fixed glob string (e.g. `.opencode/rules/myrules-*.md`), not a per-file list — it does not change when rules are added or removed. State tracks the deployed string so it can be removed cleanly if the user disables OpenCode.

- [ ] **Step 1: Write failing test `tests/opencode-config-deploy.test.js`**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const oc = require('../tools/sync/lib/opencode-config-deploy');

test('mergeInstructions creates instructions array when none exists', () => {
  const result = oc.mergeInstructions(null, [], ['.opencode/rules/myrules-*.md']);
  assert.deepStrictEqual(result.instructions, ['.opencode/rules/myrules-*.md']);
});

test('mergeInstructions preserves foreign instructions entries', () => {
  const existing = { instructions: ['CONTRIBUTING.md', 'docs/guidelines.md'] };
  const result = oc.mergeInstructions(existing, [], ['.opencode/rules/myrules-*.md']);
  assert.deepStrictEqual(result.instructions, ['CONTRIBUTING.md', 'docs/guidelines.md', '.opencode/rules/myrules-*.md']);
});

test('mergeInstructions removes prior myrules entries via exact match and replaces with current', () => {
  const existing = { instructions: ['CONTRIBUTING.md', '.opencode/rules/myrules-*.md'] };
  const result = oc.mergeInstructions(existing, ['.opencode/rules/myrules-*.md'], ['.opencode/rules/myrules-*.md']);
  assert.deepStrictEqual(result.instructions, ['CONTRIBUTING.md', '.opencode/rules/myrules-*.md']);
});

test('mergeInstructions falls back to substring filter when priorEntries is empty', () => {
  const existing = { instructions: ['keep.md', '.opencode/rules/myrules-*.md'] };
  const result = oc.mergeInstructions(existing, [], ['.opencode/rules/myrules-*.md']);
  assert.deepStrictEqual(result.instructions, ['keep.md', '.opencode/rules/myrules-*.md']);
});

test('mergeInstructions removes instructions key entirely when array becomes empty', () => {
  const existing = { instructions: ['.opencode/rules/myrules-*.md'] };
  const result = oc.mergeInstructions(existing, ['.opencode/rules/myrules-*.md'], []);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'instructions'), false);
});

test('mergeInstructions preserves other top-level config keys', () => {
  const existing = { model: 'anthropic/claude-sonnet-4-5', instructions: ['CONTRIBUTING.md'] };
  const result = oc.mergeInstructions(existing, [], ['.opencode/rules/myrules-*.md']);
  assert.strictEqual(result.model, 'anthropic/claude-sonnet-4-5');
});

// --- deployProjectConfig ---

function makeCache() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-oc-cache-'));
  fs.mkdirSync(path.join(cache, 'rules', 'user'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'rules', 'project'), { recursive: true });
  return cache;
}

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-oc-project-'));
}

const fakeManifest = {
  opencode: {
    projectInstructionsGlob: '.opencode/rules/myrules-*.md',
    userInstructionsGlob: 'rules/myrules-user-*.md',
  },
};

test('deployProjectConfig creates opencode.json with instructions glob when none exists', () => {
  const cache = makeCache();
  const project = makeProject();
  const result = oc.deployProjectConfig(cache, project, { manifest: fakeManifest, priorEntries: [] });

  const config = JSON.parse(fs.readFileSync(path.join(project, 'opencode.json'), 'utf8'));
  assert.deepStrictEqual(config.instructions, ['.opencode/rules/myrules-*.md']);
  assert.strictEqual(result.wrote, true);
});

test('deployProjectConfig preserves foreign config keys and instructions entries', () => {
  const cache = makeCache();
  const project = makeProject();
  fs.writeFileSync(
    path.join(project, 'opencode.json'),
    JSON.stringify({ model: 'anthropic/claude-sonnet-4-5', instructions: ['CONTRIBUTING.md'] }, null, 2)
  );

  oc.deployProjectConfig(cache, project, { manifest: fakeManifest, priorEntries: [] });

  const config = JSON.parse(fs.readFileSync(path.join(project, 'opencode.json'), 'utf8'));
  assert.strictEqual(config.model, 'anthropic/claude-sonnet-4-5');
  assert.deepStrictEqual(config.instructions, ['CONTRIBUTING.md', '.opencode/rules/myrules-*.md']);
});

test('deployProjectConfig is idempotent on a second run', () => {
  const cache = makeCache();
  const project = makeProject();
  oc.deployProjectConfig(cache, project, { manifest: fakeManifest, priorEntries: [] });
  const firstContent = fs.readFileSync(path.join(project, 'opencode.json'), 'utf8');

  const result = oc.deployProjectConfig(cache, project, { manifest: fakeManifest, priorEntries: ['.opencode/rules/myrules-*.md'] });
  const secondContent = fs.readFileSync(path.join(project, 'opencode.json'), 'utf8');

  assert.strictEqual(result.wrote, false);
  assert.strictEqual(firstContent, secondContent);
});

test('deployProjectConfig aborts with a clear error when opencode.json is malformed', () => {
  const cache = makeCache();
  const project = makeProject();
  fs.writeFileSync(path.join(project, 'opencode.json'), '{ not valid json');

  assert.throws(
    () => oc.deployProjectConfig(cache, project, { manifest: fakeManifest, priorEntries: [] }),
    /Failed to parse/
  );
});

// --- deployUserConfig ---

test('deployUserConfig writes to the given homeDir config path', () => {
  const cache = makeCache();
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-oc-home-'));
  const result = oc.deployUserConfig(cache, { manifest: fakeManifest, homeDir, priorEntries: [] });

  const config = JSON.parse(fs.readFileSync(path.join(homeDir, '.config', 'opencode', 'opencode.json'), 'utf8'));
  assert.deepStrictEqual(config.instructions, ['rules/myrules-user-*.md']);
  assert.strictEqual(result.wrote, true);
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
node --test tests/opencode-config-deploy.test.js
```

- [ ] **Step 3: Implement `tools/sync/lib/opencode-config-deploy.js`**

```javascript
const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const loadManifest = require('./load-manifest');

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${file} as JSON: ${err.message}`);
  }
}

function mergeInstructions(existing, previousEntries, currentEntries) {
  const doc = existing && typeof existing === 'object' ? { ...existing } : {};
  const existingInstructions = Array.isArray(doc.instructions) ? [...doc.instructions] : [];

  const priorSet = new Set(previousEntries || []);
  let kept;
  if (priorSet.size > 0) {
    kept = existingInstructions.filter((s) => !priorSet.has(s));
  } else {
    kept = existingInstructions.filter((s) => typeof s !== 'string' || !s.includes('myrules-'));
  }

  for (const entry of currentEntries || []) {
    if (!kept.includes(entry)) kept.push(entry);
  }

  if (kept.length > 0) {
    doc.instructions = kept;
  } else {
    delete doc.instructions;
  }
  return doc;
}

function deployConfigFile(configFile, currentEntries, priorEntries) {
  const existed = fs.existsSync(configFile);
  const existing = readJsonIfExists(configFile);
  const merged = mergeInstructions(existing, priorEntries, currentEntries);

  // Idempotency: skip write if nothing changed
  if (existed && existing) {
    const beforeInstructions = Array.isArray(existing.instructions) ? existing.instructions : [];
    const afterInstructions = Array.isArray(merged.instructions) ? merged.instructions : [];
    if (JSON.stringify(beforeInstructions) === JSON.stringify(afterInstructions)) {
      return { instructions: afterInstructions, wrote: false };
    }
  }

  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(merged, null, 2) + '\n');
  return { instructions: Array.isArray(merged.instructions) ? merged.instructions : [], wrote: true };
}

function deployProjectConfig(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const configFile = opts.configFile || paths.getOpencodeProjectConfigFile(projectRoot);
  const current = [manifest.opencode.projectInstructionsGlob];
  return deployConfigFile(configFile, current, opts.priorEntries || []);
}

function deployUserConfig(cacheDir, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const homeDir = opts.homeDir || require('node:os').homedir();
  const configFile = opts.configFile || paths.getOpencodeUserConfigFile(homeDir);
  const current = [manifest.opencode.userInstructionsGlob];
  return deployConfigFile(configFile, current, opts.priorEntries || []);
}

module.exports = { mergeInstructions, deployProjectConfig, deployUserConfig };
```

- [ ] **Step 4: Run test — expect PASS**

```bash
node --test tests/opencode-config-deploy.test.js
```

- [ ] **Step 5: Commit**

```bash
git add tools/sync/lib/opencode-config-deploy.js tests/opencode-config-deploy.test.js
git commit -m "feat(opencode): maintain instructions array in opencode.json"
```

---

### Task 5: Agent deploy with OpenCode branch

**Files:**
- Modify: `tools/sync/lib/deploy-agents.js`
- Test: `tests/deploy-agents.test.js`

**Interfaces:**
- `deployAgents` writes a third set of agent files to `.opencode/agents/myrules-<role>.md` using `platform: 'opencode'`.
- `staleAgentCleanup` covers the opencode agents dir.

- [ ] **Step 0: Add byte-level snapshot test for cursor/claude agent outputs**

This is an **invariant test**, not failing-first. It PASSES now and must continue to PASS after Step 3 adds the opencode branch. Uses a **self-contained cache** (no `seedCacheContent`) so the baseline does not depend on the real repo's `rules/` directory.

```javascript
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
```

Run `node --test tests/deploy-agents.test.js` - should PASS. Commit:

```bash
git add tests/deploy-agents.test.js
git commit -m "test(deploy-agents): add byte-level snapshot for cursor/claude agent outputs"
```

- [ ] **Step 1: Write failing tests in `tests/deploy-agents.test.js`**

Append:

```javascript
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
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
node --test tests/deploy-agents.test.js
```

- [ ] **Step 3: Implement in `tools/sync/lib/deploy-agents.js`**

Add opencode dir resolution and `mkdirSync` after the claude dir:

```javascript
  const opencodeDir = paths.getOpencodeAgentsDir(projectRoot);
  fs.mkdirSync(opencodeDir, { recursive: true });
```

Inside the `for (const roleId of roleIds)` loop, after the claude `writeTracked` block, add:

```javascript
    const opencodeFile = `${agentName}.md`;
    const opencodeTarget = path.join(opencodeDir, opencodeFile);
    const opencodeStateKey = path.posix.join('.opencode/agents', opencodeFile);
    tracker.writeTracked(
      opencodeTarget,
      transform.transformForAgent({
        roleMeta,
        roleId,
        agentName,
        userBodies,
        projectBodies,
        platform: 'opencode',
      }),
      opencodeStateKey
    );
```

Add opencode to `staleAgentCleanup` calls:

```javascript
  const staleRemoved = [
    ...staleAgentCleanup(cursorDir, prefix, roleIds, '.md'),
    ...staleAgentCleanup(claudeDir, prefix, roleIds, '.md'),
    ...staleAgentCleanup(opencodeDir, prefix, roleIds, '.md'),
  ];
```

The existing stale-hash-cleanup loop at the bottom uses `agentsConfig.claudeDir` / `agentsConfig.cursorDir` to resolve keys — opencode keys (`.opencode/agents/...`) will also be caught by the fallback `path.join(projectRoot, key)` since they are project-relative. Verify this works in the test; if the key prefix check needs adjustment, add an explicit opencode branch.

- [ ] **Step 4: Run test — expect PASS**

```bash
node --test tests/deploy-agents.test.js
```

- [ ] **Step 4b: Run full suite - confirm no cursor/claude regression**

```bash
node --test tests/
```

The agent deploy change adds a third platform to `deployAgents`. Existing tests in `cli-sync.test.js` and `e2e.test.js` call `sync.run` which invokes `deployAgents` - verify they still pass. Agent files are project-level (`.opencode/agents/`), so no home-directory pollution risk.

- [ ] **Step 5: Commit**

```bash
git add tools/sync/lib/deploy-agents.js tests/deploy-agents.test.js
git commit -m "feat(opencode): deploy custom agents to .opencode/agents/"
```

---

### Task 6: Legacy scan, gitignore, and export — OpenCode coverage

**Files:**
- Modify: `tools/sync/lib/legacy.js`, `tools/sync/lib/gitignore.js`, `tools/sync/lib/export.js`
- Test: `tests/legacy.test.js`, `tests/gitignore.test.js`, `tests/export.test.js`

- [ ] **Step 0: Make existing `tests/export.test.js` hermetic for OpenCode**

Every existing `deploy.deployRules(...)` and `exportLib.exportProject(...)` call in `tests/export.test.js` passes `claudeUserDir` but not `opencodeUserDir`. Once the OpenCode scan is added (Step 3), `exportProject` will default to scanning the real `~/.config/opencode/rules/`. Fix this before implementing.

Add a `fakeOpencodeUserDir` helper (same pattern as `fakeClaudeUserDir`) and pass `opencodeUserDir` to every `deploy.deployRules(...)` and `exportLib.exportProject(...)` call in all 4 existing tests. Run `node --test tests/export.test.js` - should still PASS. Commit separately:

```bash
git add tests/export.test.js
git commit -m "test(export): add opencodeUserDir override to existing tests for hermetic isolation"
```

- [ ] **Step 1: Write failing tests**

In `tests/legacy.test.js`, append:

```javascript
test('scanLegacy finds non-managed .opencode/rules/*.md files', () => {
  const project = tmpProject();
  write(path.join(project, '.opencode', 'rules', 'myrules-testing.md'));
  write(path.join(project, '.opencode', 'rules', 'old-style.md'));
  write(path.join(project, '.opencode', 'agents', 'old-agent.md'));

  const found = legacy.scanLegacy(project, 'myrules-');
  const relative = found.map((f) => path.relative(project, f)).sort();
  assert.ok(relative.includes(path.join('.opencode', 'rules', 'old-style.md')));
  // agents are not rules — not scanned
  assert.ok(!relative.some((f) => f.includes('agents')));
});
```

In `tests/gitignore.test.js`, append:

```javascript
test('buildBlock includes opencode rules and agents', () => {
  const manifest = {
    managedPrefix: 'myrules-',
    prune: { backupDir: '.myrules-backup' },
    agents: { prefix: 'myrules-' },
  };
  const block = gitignore.buildBlock(manifest);
  assert.match(block, /\.opencode\/rules\/myrules-\*/);
  assert.match(block, /\.opencode\/agents\/myrules-\*/);
});
```

In `tests/export.test.js`, append:

```javascript
test('exportProject detects a hand-edited OpenCode rule and maps it to rules/project/<topic>.md', () => {
  const cache = makeCache();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-oc-export-project-'));
  const claudeUserDir = fakeClaudeUserDir(project);
  const opencodeUserDir = path.join(project, '.fake-opencode-home', 'rules');
  deploy.deployRules(cache, project, { force: false, priorHashes: {}, claudeUserDir, opencodeUserDir });

  const deployedFile = path.join(project, '.opencode', 'rules', 'myrules-testing.md');
  fs.writeFileSync(deployedFile, fs.readFileSync(deployedFile, 'utf8').replace('write tests', 'write ALL the tests'));

  const report = exportLib.exportProject(cache, project, { claudeUserDir, opencodeUserDir });
  const match = report.toUpdate.find((u) => u.deployedFile === deployedFile);
  assert.ok(match);
  assert.strictEqual(match.sourceFile, path.join(cache, 'rules', 'project', 'testing.md'));
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
node --test tests/legacy.test.js tests/gitignore.test.js tests/export.test.js
```

- [ ] **Step 3: Implement**

In `legacy.js` `scanLegacy`, add after the claude dir scan block:

```javascript
  const opencodeDir = paths.getOpencodeProjectRulesDir(projectRoot);
  if (fs.existsSync(opencodeDir)) {
    for (const f of fs.readdirSync(opencodeDir)) {
      const full = path.join(opencodeDir, f);
      if (fs.statSync(full).isFile() && f.endsWith('.md') && !f.startsWith(managedPrefix)) {
        found.push(full);
      }
    }
  }
```

In `gitignore.js` `buildBlock`, add after the claude agents line:

```javascript
    `.opencode/rules/${prefix}*`,
    `.opencode/agents/${agentPrefix}*`,
```

In `export.js`, add `opencodeUserDir` to opts destructuring (default `paths.getOpencodeUserRulesDir()`), add the opencode dirs to the `scans` array:

```javascript
  const opencodeProjDir = paths.getOpencodeProjectRulesDir(projectRoot);
  // ...
  const scans = [
    { dir: cursorDir, ext: manifest.cursor.extension },
    { dir: claudeProjDir, ext: manifest.claude.extension },
    { dir: claudeUserDir, ext: manifest.claude.extension },
    { dir: opencodeProjDir, ext: manifest.opencode.extension },
    { dir: opencodeUserDir, ext: manifest.opencode.extension },
  ];
```

Also: opencode rule files are pure markdown (no frontmatter to strip), same as claude — the existing `diffFile` logic handles `.md` correctly (it only strips cursor frontmatter for `.mdc`).

- [ ] **Step 4: Run tests — expect PASS**

```bash
node --test tests/legacy.test.js tests/gitignore.test.js tests/export.test.js
```

- [ ] **Step 5: Commit**

```bash
git add tools/sync/lib/legacy.js tools/sync/lib/gitignore.js tools/sync/lib/export.js tests/legacy.test.js tests/gitignore.test.js tests/export.test.js
git commit -m "feat(opencode): legacy scan, gitignore, and export reverse-mapping"
```

---

### Task 7: State field + sync.js integration

**Files:**
- Modify: `tools/sync/lib/state.js`, `tools/sync/sync.js`
- Test: `tests/cli-sync.test.js`

**Interfaces:**
- `DEFAULT_STATE.deployedOpencodeInstructions`: `{ project: [], user: [] }`
- `syncOne` calls `opencode-config-deploy.deployProjectConfig` after rule deploy
- `run` calls `opencode-config-deploy.deployUserConfig` in the user-level block (alongside user hooks)

- [ ] **Step 1: Write failing test in `tests/cli-sync.test.js`**

Append:

```javascript
test('sync.run deploys opencode.json with instructions glob and writes it to state', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-oc-sync-project-'));

  syncCli.run(baseOpts(project, cache));

  const config = JSON.parse(fs.readFileSync(path.join(project, 'opencode.json'), 'utf8'));
  assert.deepStrictEqual(config.instructions, ['.opencode/rules/myrules-*.md']);

  const s = state.readState(project);
  assert.deepStrictEqual(s.deployedOpencodeInstructions.project, ['.opencode/rules/myrules-*.md']);
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
node --test tests/cli-sync.test.js
```

- [ ] **Step 3: Implement**

In `state.js`, add to `DEFAULT_STATE`:

```javascript
  deployedOpencodeInstructions: { project: [], user: [] },
```

In `sync.js`, `require` the new module:

```javascript
const opencodeConfig = require('./lib/opencode-config-deploy');
```

In `syncOne`, after the `deploy.deployRules` call and before agents, add:

```javascript
  const ocConfigResult = opencodeConfig.deployProjectConfig(cacheDir, projectRoot, {
    manifest,
    priorEntries: (current.deployedOpencodeInstructions && current.deployedOpencodeInstructions.project) || [],
  });
```

In `run`, after the user-hooks block (`if (!opts.skipUserHooks) { ... }`), add a user-level opencode config block. This runs once per machine, not per project:

```javascript
  if (!opts.skipUserConfig) {
    const priorUserInstr = (hooksState.readUserHooksState(homeDir).deployedOpencodeInstructions || {}).user || [];
    const ocUserResult = opencodeConfig.deployUserConfig(cacheDir, {
      homeDir,
      manifest,
      priorEntries: priorUserInstr,
    });
    // Persist to user-hooks state file (shared machine-level state) or a dedicated file.
    // For Phase 1, reuse the user-hooks state file since it already tracks machine-level deploys.
    const userState = hooksState.readUserHooksState(homeDir);
    userState.deployedOpencodeInstructions = userState.deployedOpencodeInstructions || {};
    userState.deployedOpencodeInstructions.user = ocUserResult.instructions;
    hooksState.writeUserHooksState(homeDir, userState);
  }
```

**Design note:** the user-level opencode config is machine-global, so its state belongs in the same machine-level state file as user hooks (`~/.myrules/.user-hooks-state.json`). Reusing that file avoids introducing a second machine-level state file. If the field name `deployedOpencodeInstructions` on a file named `user-hooks-state` feels misleading, a follow-up can rename the file — out of scope for Phase 1.

In the `state.writeState` call at the bottom of `syncOne`, add:

```javascript
    deployedOpencodeInstructions: {
      project: ocConfigResult.instructions,
      user: (current.deployedOpencodeInstructions && current.deployedOpencodeInstructions.user) || [],
    },
```

In `baseOpts` in the test helper, add `skipUserConfig: true` (same pattern as `skipUserHooks`) and add `opencodeUserDir: path.join(project, '.fake-opencode-home', 'rules')` so the project-level opencode deploy in `syncOne` stays hermetic.

- [ ] **Step 4: Run test — expect PASS**

```bash
node --test tests/cli-sync.test.js
```

- [ ] **Step 5: Commit**

```bash
git add tools/sync/lib/state.js tools/sync/sync.js tests/cli-sync.test.js
git commit -m "feat(opencode): wire config deploy into sync and track in state"
```

---

### Task 8: End-to-end test and full suite

**Files:**
- Modify: `tests/e2e.test.js`

- [ ] **Step 1: Add OpenCode assertions to the e2e test**

In `tests/e2e.test.js`, after the existing `initCli.run(opts)` assertions, add:

```javascript
  // OpenCode: rule files + opencode.json instructions + agent files
  assert.ok(fs.existsSync(path.join(project, '.opencode', 'rules', 'myrules-testing.md')));
  const ocConfig = JSON.parse(fs.readFileSync(path.join(project, 'opencode.json'), 'utf8'));
  assert.ok(ocConfig.instructions.includes('.opencode/rules/myrules-*.md'));
  assert.ok(fs.existsSync(path.join(project, '.opencode', 'agents', 'myrules-implementer.md')));
```

After the prune section, add an assertion that `AGENTS.md` (if it existed) was not touched — it is in the protect list:

```javascript
  // AGENTS.md is protected — MyRules never touches it
  assert.strictEqual(fs.existsSync(path.join(project, 'AGENTS.md')), false);
```

(The legacy fixture does not create `AGENTS.md`, so this asserts MyRules did not create one.)

Update `baseOpts` in the e2e test to include `skipUserConfig: true` (added in Task 7).

- [ ] **Step 2: Run e2e — expect PASS**

```bash
node --test tests/e2e.test.js
```

- [ ] **Step 3: Run full suite**

```bash
node --test tests/
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e.test.js
git commit -m "test(opencode): add end-to-end assertions for opencode deploy"
```

---

## Spec Coverage Self-Review

| Requirement | Task |
|-------------|------|
| `manifest.opencode` config block | Task 1 |
| Path resolvers for rules/config/agents | Task 1 |
| `transformForOpencode` (rules) | Task 2 |
| `transformForAgent` platform: opencode | Task 2 |
| Rule deploy to `.opencode/rules/` with drift detection | Task 3 |
| `opencode.json` `instructions` merge (project + user) | Task 4 |
| Agent deploy to `.opencode/agents/` | Task 5 |
| Legacy scan covers `.opencode/rules/` | Task 6 |
| Gitignore covers opencode artifacts | Task 6 |
| Export reverse-mapping covers opencode | Task 6 |
| State tracks deployed instructions | Task 7 |
| `sync.js` wires project + user config deploy | Task 7 |
| E2E asserts opencode outputs | Task 8 |
| Skills: zero changes (OpenCode reads `.claude/skills/` natively) | — |
| `AGENTS.md` stays protected | Task 8 (assertion) |
| No hooks deploy in Phase 1 | — (deferred) |

No placeholder steps remain; every task has concrete code and a runnable verification command.

---

## Phase 2 (deferred - 2026-07-25)

**Decision:** Phase 1 is complete (166 tests pass, zero cursor/claude regression). Phase 2 is documented here for future reference but not scheduled.

### Scope: Hooks soft-convention for OpenCode

MyRules hooks deploy to two targets today:
- **Cursor**: `hooks.json` with event-triggered command entries (real automation)
- **Claude**: `.claude/rules/myrules-hook-<name>.md` prose files (soft convention - Claude has no auto-trigger, the markdown just instructs the agent to act manually at the described moment)

OpenCode has no event-hook mechanism (only manual `/commands` and plugins). The Claude soft-convention approach maps directly: deploy the same hook prose markdown to `.opencode/rules/myrules-hook-<name>.md`. OpenCode's `instructions` glob (`.opencode/rules/myrules-*.md`, set up in Phase 1) already covers `myrules-hook-*` files - no `opencode.json` change needed.

### What Phase 2 would involve

1. **[hooks-deploy.js](../../../tools/sync/lib/hooks-deploy.js)**: add an OpenCode branch alongside the existing Cursor script + Claude prose deploy. Writes `transformHookForClaude(meta, name)` output (same prose format) to `.opencode/rules/myrules-hook-<name>.md` via the drift tracker.
2. **[hooks-deploy.test.js](../../../tests/hooks-deploy.test.js)**: add OpenCode assertions (file exists, content matches, drift detection, stale cleanup).
3. No changes needed to `opencode.json`, `gitignore.js`, or `sync.js` - the glob and gitignore already cover `myrules-hook-*` under `.opencode/rules/`.

Estimated effort: ~1 task, smaller than any Phase 1 task.

### What is NOT Phase 2

- **opencode commands** (`.opencode/commands/*.md`): a new resource type (user-triggered `/xxx` prompts), not a platform extension. Would require a new `commands/` source directory, source format, and deploy module. Out of scope for MyRules platform extensions.
- **opencode native skills path** (`.opencode/skills/`): Phase 1 relies on OpenCode's Claude-compatible `.claude/skills/` read path, which works natively. No need to duplicate to `.opencode/skills/`.
- **opencode global agents** (`~/.config/opencode/agents/`): MyRules agents are project-scoped by design. Global agents don't fit the model.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-07-25-myrules-opencode.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks
2. **Inline Execution** — execute tasks in this session using executing-plans
