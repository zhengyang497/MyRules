# MyRules Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `hooks/` content type to MyRules — agent read/write-file conventions deployed as real `hooks.json` automation on Cursor and as documentation-only rule files on Claude Code.

**Architecture:** Each hook is one standalone, directly-runnable `.js` file (`module.exports = {meta, handle}` plus a `require.main === module` stdin/stdout runner block, matching the existing `tools/sync/*.js` idiom). `hooks/project/*.js` deploys per-project (`.cursor/hooks.json` + `.cursor/hooks/`, `.claude/rules/`); `hooks/user/*.js` deploys once per machine (`~/.cursor/hooks.json` + `~/.cursor/hooks/`, `~/.claude/rules/`). A safe JSON-merge algorithm preserves any non-MyRules entries already in `hooks.json`. Drift detection and stale-hook cleanup reuse a shared helper extracted from the existing rules deploy code.

**Tech Stack:** Node.js (`>=18`, CommonJS, zero dependencies), `node:test` / `node:assert` for tests — same stack as the rest of MyRules.

## Global Constraints

- Node.js `>=18`, `"type": "commonjs"`, no new npm dependencies (per `package.json` and the main MyRules design spec).
- Every hook script must run identically on Windows/macOS/Linux — use `node <path>` as the `command` string in `hooks.json`, never bash/shebang/`chmod`.
- `managedPrefix` (`"myrules-"`, from `manifest.js`) applies to all hook script filenames, exactly as it already does for rule files.
- No new CLI commands or flags — hooks ride entirely on the existing `sync` / `init` / `status` / `export` commands.
- Deploy artifacts are gitignored by default (source of truth lives in `~/.myrules/hooks/`); `hooks.json` itself is never gitignored (it may hold non-MyRules entries).
- All tests must be hermetic: use `fs.mkdtempSync` fixtures and explicit `homeDir`/`claudeUserDir`/`priorState` overrides — never touch the real `~/.cursor`, `~/.claude`, or `~/.myrules`.
- Stale hook cleanup (script + `hooks.json` entry + Claude prose file for a hook removed from source) runs automatically on every sync, no opt-in flag — this only ever touches MyRules's own previously-tracked artifacts.
- Claude Code never executes hooks automatically in v1 — it only receives a generated prose rule file.
- Run `npm test` (`node --test tests/*.test.js`) after every task to confirm no regressions in the existing suite, not just the new tests.

Full design rationale: `docs/superpowers/specs/2026-07-03-myrules-hooks-design.md`.

---

## Task 1: Extract shared drift-detection helper into `lib/drift.js`

**Files:**
- Create: `tools/sync/lib/drift.js`
- Modify: `tools/sync/lib/deploy.js` (replace the inline `writeTracked` closure with `drift.createTracker`)
- Test: `tests/drift.test.js`

**Interfaces:**
- Produces: `drift.createTracker({ force = false, priorHashes = {} } = {})` → `{ writeTracked(targetFile, content, stateKey), drifted: string[], written: string[], hashes: Record<string, string> }`. `writeTracked` writes `content` to `targetFile` unless its current on-disk hash differs from `priorHashes[stateKey]` (drift), in which case it skips the write and records the file in `drifted`. Every later task that writes a deployed file (hook scripts, Claude hook prose) uses this exact function.

This is a behavior-preserving refactor: `deploy.deployRules`'s existing tests (`tests/deploy.test.js`) must continue to pass unchanged.

- [ ] **Step 1: Write the failing test for the extracted helper**

```javascript
// tests/drift.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const drift = require('../tools/sync/lib/drift');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-drift-'));
}

test('writeTracked writes a new file and records its hash', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'out.txt');
  const tracker = drift.createTracker({ force: false, priorHashes: {} });
  tracker.writeTracked(target, 'hello', 'out.txt');
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'hello');
  assert.strictEqual(tracker.written.length, 1);
  assert.strictEqual(tracker.drifted.length, 0);
  assert.ok(tracker.hashes['out.txt']);
});

test('writeTracked skips and reports a file whose content no longer matches the prior hash', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'out.txt');
  const first = drift.createTracker({ force: false, priorHashes: {} });
  first.writeTracked(target, 'hello', 'out.txt');

  fs.writeFileSync(target, 'hand-edited');
  const second = drift.createTracker({ force: false, priorHashes: first.hashes });
  second.writeTracked(target, 'hello', 'out.txt');

  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'hand-edited');
  assert.deepStrictEqual(second.drifted, [target]);
});

test('writeTracked with force:true overwrites a drifted file', () => {
  const dir = tmpDir();
  const target = path.join(dir, 'out.txt');
  const first = drift.createTracker({ force: false, priorHashes: {} });
  first.writeTracked(target, 'hello', 'out.txt');

  fs.writeFileSync(target, 'hand-edited');
  const second = drift.createTracker({ force: true, priorHashes: first.hashes });
  second.writeTracked(target, 'hello', 'out.txt');

  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'hello');
  assert.strictEqual(second.drifted.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/drift.test.js`
Expected: FAIL with "Cannot find module '../tools/sync/lib/drift'"

- [ ] **Step 3: Create `lib/drift.js`**

```javascript
// tools/sync/lib/drift.js
const fs = require('node:fs');
const fsutil = require('./fsutil');

function createTracker({ force = false, priorHashes = {} } = {}) {
  const nextHashes = {};
  const drifted = [];
  const written = [];

  function writeTracked(targetFile, content, stateKey) {
    if (!force && fs.existsSync(targetFile)) {
      const currentHash = fsutil.hashContent(fs.readFileSync(targetFile, 'utf8'));
      const expectedHash = priorHashes[stateKey];
      if (expectedHash && currentHash !== expectedHash) {
        drifted.push(targetFile);
        nextHashes[stateKey] = currentHash;
        return;
      }
    }
    fs.writeFileSync(targetFile, content);
    nextHashes[stateKey] = fsutil.hashContent(content);
    written.push(targetFile);
  }

  return { writeTracked, drifted, written, hashes: nextHashes };
}

module.exports = { createTracker };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/drift.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Refactor `deploy.js` to use the shared tracker**

Replace the full contents of `tools/sync/lib/deploy.js` with:

```javascript
// tools/sync/lib/deploy.js
const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const fsutil = require('./fsutil');
const transform = require('./transform');
const loadManifest = require('./load-manifest');
const drift = require('./drift');

function listTopics(dir) {
  return fsutil.listFilesWithExt(dir, '.md').map((file) => ({
    file,
    topic: path.basename(file, '.md'),
  }));
}

function deployRules(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const prefix = manifest.managedPrefix;
  const cursorExt = manifest.cursor.extension;
  const claudeExt = manifest.claude.extension;

  const {
    force = false,
    priorHashes = {},
    cursorDir = paths.getCursorRulesDir(projectRoot),
    claudeProjDir = paths.getClaudeProjectRulesDir(projectRoot),
    claudeUserDir = paths.getClaudeUserRulesDir(),
  } = opts;
  fsutil.ensureDir(cursorDir);
  fsutil.ensureDir(claudeProjDir);
  fsutil.ensureDir(claudeUserDir);

  const tracker = drift.createTracker({ force, priorHashes });

  for (const { file, topic } of listTopics(path.join(cacheDir, 'rules', 'user'))) {
    const body = fs.readFileSync(file, 'utf8');
    const cursorTarget = path.join(cursorDir, `${prefix}user-${topic}${cursorExt}`);
    const claudeTarget = path.join(claudeUserDir, `${prefix}user-${topic}${claudeExt}`);
    tracker.writeTracked(cursorTarget, transform.transformForCursor(body, topic), path.relative(projectRoot, cursorTarget));
    tracker.writeTracked(claudeTarget, transform.transformForClaude(body), `~claude-user~/${prefix}user-${topic}${claudeExt}`);
  }

  for (const { file, topic } of listTopics(path.join(cacheDir, 'rules', 'project'))) {
    const body = fs.readFileSync(file, 'utf8');
    const cursorTarget = path.join(cursorDir, `${prefix}${topic}${cursorExt}`);
    const claudeTarget = path.join(claudeProjDir, `${prefix}${topic}${claudeExt}`);
    tracker.writeTracked(cursorTarget, transform.transformForCursor(body, topic), path.relative(projectRoot, cursorTarget));
    tracker.writeTracked(claudeTarget, transform.transformForClaude(body), path.relative(projectRoot, claudeTarget));
  }

  return { written: tracker.written, drifted: tracker.drifted, hashes: tracker.hashes };
}

module.exports = { deployRules };
```

- [ ] **Step 6: Run the full existing suite to confirm no regressions**

Run: `node --test tests/deploy.test.js tests/drift.test.js`
Expected: PASS (all `deploy.test.js` tests unchanged in behavior, plus the 3 new `drift.test.js` tests)

- [ ] **Step 7: Commit**

```bash
git add tools/sync/lib/drift.js tools/sync/lib/deploy.js tests/drift.test.js
git commit -m "refactor: extract shared drift-detection helper into lib/drift.js"
```

---

## Task 2: Hook source loader (`lib/hooks.js`)

**Files:**
- Create: `tools/sync/lib/hooks.js`
- Test: `tests/hooks.test.js`

**Interfaces:**
- Consumes: `fsutil.listFilesWithExt(dir, ext)` (existing, returns `[]` for a missing directory) from `tools/sync/lib/fsutil.js`.
- Produces: `hooks.loadHookSources(dir)` → `Array<{ name: string, file: string, meta: {event, matcher?, timeout?, failClosed?, description}, handle: Function }>`. Throws a descriptive `Error` if any file in `dir` is missing `meta.event`, `meta.description`, or a `handle` function. Task 9's `hooks-deploy.js` is the primary consumer.

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/hooks.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const hooks = require('../tools/sync/lib/hooks');

function tmpHooksDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-src-'));
}

test('loadHookSources returns an empty array for a missing directory', () => {
  const missing = path.join(os.tmpdir(), 'myrules-hooks-does-not-exist-' + Date.now());
  assert.deepStrictEqual(hooks.loadHookSources(missing), []);
});

test('loadHookSources loads meta and handle from each .js file', () => {
  const dir = tmpHooksDir();
  fs.writeFileSync(
    path.join(dir, 'example.js'),
    "module.exports.meta = { event: 'sessionStart', description: 'test hook' };\n" +
      'module.exports.handle = function handle(input) { return {}; };\n'
  );
  const result = hooks.loadHookSources(dir);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].name, 'example');
  assert.strictEqual(result[0].meta.event, 'sessionStart');
  assert.strictEqual(typeof result[0].handle, 'function');
});

test('loadHookSources throws a clear error when meta.event is missing', () => {
  const dir = tmpHooksDir();
  fs.writeFileSync(
    path.join(dir, 'broken.js'),
    "module.exports.meta = { description: 'missing event' };\n" +
      'module.exports.handle = function handle() { return {}; };\n'
  );
  assert.throws(() => hooks.loadHookSources(dir), /meta\.event/);
});

test('loadHookSources throws a clear error when meta.description is missing', () => {
  const dir = tmpHooksDir();
  fs.writeFileSync(
    path.join(dir, 'broken.js'),
    "module.exports.meta = { event: 'sessionStart' };\n" +
      'module.exports.handle = function handle() { return {}; };\n'
  );
  assert.throws(() => hooks.loadHookSources(dir), /meta\.description/);
});

test('loadHookSources throws a clear error when handle is missing', () => {
  const dir = tmpHooksDir();
  fs.writeFileSync(
    path.join(dir, 'broken.js'),
    "module.exports.meta = { event: 'sessionStart', description: 'x' };\n"
  );
  assert.throws(() => hooks.loadHookSources(dir), /handle/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks.test.js`
Expected: FAIL with "Cannot find module '../tools/sync/lib/hooks'"

- [ ] **Step 3: Create `lib/hooks.js`**

```javascript
// tools/sync/lib/hooks.js
const path = require('node:path');
const fsutil = require('./fsutil');

function loadHookSources(dir) {
  const files = fsutil.listFilesWithExt(dir, '.js');
  return files.map((file) => {
    const name = path.basename(file, '.js');
    const resolved = path.resolve(file);
    delete require.cache[require.resolve(resolved)];
    const mod = require(resolved);
    if (!mod.meta || typeof mod.meta.event !== 'string' || !mod.meta.event) {
      throw new Error(`Hook source missing meta.event: ${file}`);
    }
    if (typeof mod.meta.description !== 'string' || !mod.meta.description) {
      throw new Error(`Hook source missing meta.description: ${file}`);
    }
    if (typeof mod.handle !== 'function') {
      throw new Error(`Hook source missing handle function: ${file}`);
    }
    return { name, file, meta: mod.meta, handle: mod.handle };
  });
}

module.exports = { loadHookSources };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hooks.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full existing suite to confirm no regressions**

Run: `node --test tests/*.test.js`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add tools/sync/lib/hooks.js tests/hooks.test.js
git commit -m "feat: add hook source loader (lib/hooks.js)"
```

---

## Task 3: Seed hooks — `session-start-context` and `session-log`

**Files:**
- Create: `hooks/project/session-start-context.js`
- Create: `hooks/user/session-log.js`
- Test: `tests/session-start-context-hook.test.js`
- Test: `tests/session-log-hook.test.js`

**Interfaces:**
- Produces: two hook source files matching the `lib/hooks.js` contract (`module.exports.meta`, `module.exports.handle`). Task 10's `tests/helpers/cache-seed.js` extension copies these two real files into test fixture caches.

- [ ] **Step 1: Write the failing test for `session-start-context`**

```javascript
// tests/session-start-context-hook.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const hook = require('../hooks/project/session-start-context');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hook-project-'));
}

test('meta declares the sessionStart event and a description', () => {
  assert.strictEqual(hook.meta.event, 'sessionStart');
  assert.ok(hook.meta.description.length > 0);
});

test('handle returns {} when .myrules-context.md does not exist', () => {
  const project = tmpProject();
  const result = hook.handle({ workspace_roots: [project] });
  assert.deepStrictEqual(result, {});
});

test('handle returns the file content as additional_context when it exists', () => {
  const project = tmpProject();
  fs.writeFileSync(path.join(project, '.myrules-context.md'), '# Status\n\nWorking on X');
  const result = hook.handle({ workspace_roots: [project] });
  assert.strictEqual(result.additional_context, '# Status\n\nWorking on X');
});

test('handle prefers CURSOR_PROJECT_DIR over workspace_roots when set', () => {
  const project = tmpProject();
  fs.writeFileSync(path.join(project, '.myrules-context.md'), 'from env');
  const prevEnv = process.env.CURSOR_PROJECT_DIR;
  process.env.CURSOR_PROJECT_DIR = project;
  try {
    const result = hook.handle({ workspace_roots: ['/some/other/path'] });
    assert.strictEqual(result.additional_context, 'from env');
  } finally {
    if (prevEnv === undefined) delete process.env.CURSOR_PROJECT_DIR;
    else process.env.CURSOR_PROJECT_DIR = prevEnv;
  }
});

test('running the file directly via stdin/stdout returns additional_context for valid input', () => {
  const { execFileSync } = require('node:child_process');
  const project = tmpProject();
  fs.writeFileSync(path.join(project, '.myrules-context.md'), 'hello from file');
  const hookPath = path.join(__dirname, '..', 'hooks', 'project', 'session-start-context.js');
  const output = execFileSync('node', [hookPath], {
    input: JSON.stringify({ workspace_roots: [project] }),
    encoding: 'utf8',
  });
  assert.deepStrictEqual(JSON.parse(output), { additional_context: 'hello from file' });
});

test('running the file directly via stdin/stdout prints {} for malformed input instead of crashing', () => {
  const { execFileSync } = require('node:child_process');
  const hookPath = path.join(__dirname, '..', 'hooks', 'project', 'session-start-context.js');
  const output = execFileSync('node', [hookPath], { input: 'not valid json', encoding: 'utf8' });
  assert.strictEqual(output.trim(), '{}');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/session-start-context-hook.test.js`
Expected: FAIL with "Cannot find module '../hooks/project/session-start-context'"

- [ ] **Step 3: Create `hooks/project/session-start-context.js`**

```javascript
// hooks/project/session-start-context.js
const fs = require('node:fs');
const path = require('node:path');

module.exports.meta = {
  event: 'sessionStart',
  description:
    'At the start of every session in this project, if .myrules-context.md exists ' +
    'at the project root, read it and inject its content as additional context.',
};

module.exports.handle = function handle(input) {
  const projectRoot = process.env.CURSOR_PROJECT_DIR || input.workspace_roots?.[0] || process.cwd();
  const contextFile = path.join(projectRoot, '.myrules-context.md');
  if (!fs.existsSync(contextFile)) return {};
  return { additional_context: fs.readFileSync(contextFile, 'utf8') };
};

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      console.log(JSON.stringify(module.exports.handle(JSON.parse(raw || '{}'))));
    } catch (err) {
      console.error(err.message);
      console.log('{}');
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/session-start-context-hook.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Write the failing test for `session-log`**

```javascript
// tests/session-log-hook.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const hook = require('../hooks/user/session-log');

test('meta declares the sessionEnd event and a description', () => {
  assert.strictEqual(hook.meta.event, 'sessionEnd');
  assert.ok(hook.meta.description.length > 0);
});

test('handle appends a summary line to <homeDir>/myrules-activity-log.md', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hook-home-'));
  const result = hook.handle(
    { workspace_roots: ['/some/project-name'], duration_ms: 1234, reason: 'completed' },
    { homeDir: fakeHome }
  );
  assert.deepStrictEqual(result, {});
  const logContent = fs.readFileSync(path.join(fakeHome, 'myrules-activity-log.md'), 'utf8');
  assert.match(logContent, /project-name/);
  assert.match(logContent, /1234ms/);
  assert.match(logContent, /completed/);
});

test('handle appends a second line without overwriting the first', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hook-home-'));
  hook.handle({ workspace_roots: ['/a'], duration_ms: 1, reason: 'completed' }, { homeDir: fakeHome });
  hook.handle({ workspace_roots: ['/b'], duration_ms: 2, reason: 'aborted' }, { homeDir: fakeHome });
  const lines = fs
    .readFileSync(path.join(fakeHome, 'myrules-activity-log.md'), 'utf8')
    .trim()
    .split('\n');
  assert.strictEqual(lines.length, 2);
});

test('handle falls back to os.homedir() when no homeDir override is given', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hook-home-'));
  const prevHome = process.env.HOME;
  const prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
  try {
    const result = hook.handle({ workspace_roots: ['/x'], duration_ms: 1, reason: 'completed' });
    assert.deepStrictEqual(result, {});
    const logContent = fs.readFileSync(path.join(fakeHome, 'myrules-activity-log.md'), 'utf8');
    assert.match(logContent, /completed/);
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
  }
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `node --test tests/session-log-hook.test.js`
Expected: FAIL with "Cannot find module '../hooks/user/session-log'"

- [ ] **Step 7: Create `hooks/user/session-log.js`**

```javascript
// hooks/user/session-log.js
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

module.exports.meta = {
  event: 'sessionEnd',
  description:
    'Whenever any session ends, in any project on this machine, append a one-line ' +
    'entry (timestamp, project, duration, status) to ~/myrules-activity-log.md.',
};

module.exports.handle = function handle(input, opts = {}) {
  const homeDir = opts.homeDir || os.homedir();
  const project = path.basename(input.workspace_roots?.[0] || process.cwd());
  const line = `- ${new Date().toISOString()} | ${project} | ${input.duration_ms}ms | ${input.reason}\n`;
  fs.appendFileSync(path.join(homeDir, 'myrules-activity-log.md'), line);
  return {};
};

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      console.log(JSON.stringify(module.exports.handle(JSON.parse(raw || '{}'))));
    } catch (err) {
      console.error(err.message);
      console.log('{}');
    }
  });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `node --test tests/session-log-hook.test.js`
Expected: PASS (4 tests)

- [ ] **Step 9: Run the full existing suite to confirm no regressions**

Run: `node --test tests/*.test.js`
Expected: PASS (all tests)

- [ ] **Step 10: Commit**

```bash
git add hooks/project/session-start-context.js hooks/user/session-log.js tests/session-start-context-hook.test.js tests/session-log-hook.test.js
git commit -m "feat: add v1 seed hooks (session-start-context, session-log)"
```

---

## Task 4: Path helpers for Cursor hook locations (`lib/paths.js`)

**Files:**
- Modify: `tools/sync/lib/paths.js`
- Test: `tests/paths.test.js`

**Interfaces:**
- Produces: `paths.getCursorProjectHooksDir(projectRoot)`, `paths.getCursorProjectHooksConfig(projectRoot)`, `paths.getCursorUserHooksDir(homeDir)`, `paths.getCursorUserHooksConfig(homeDir)`, `paths.getUserHooksStateFilePath(homeDir)`. Tasks 6 and 9 consume these directly.

- [ ] **Step 1: Write the failing tests**

Append to `tests/paths.test.js`:

```javascript
test('getCursorProjectHooksDir joins project root and .cursor/hooks', () => {
  const result = paths.getCursorProjectHooksDir('/tmp/myproject');
  assert.strictEqual(result, path.join('/tmp/myproject', '.cursor', 'hooks'));
});

test('getCursorProjectHooksConfig joins project root and .cursor/hooks.json', () => {
  const result = paths.getCursorProjectHooksConfig('/tmp/myproject');
  assert.strictEqual(result, path.join('/tmp/myproject', '.cursor', 'hooks.json'));
});

test('getCursorUserHooksDir joins homeDir and .cursor/hooks', () => {
  const result = paths.getCursorUserHooksDir('/home/alice');
  assert.strictEqual(result, path.join('/home/alice', '.cursor', 'hooks'));
});

test('getCursorUserHooksConfig joins homeDir and .cursor/hooks.json', () => {
  const result = paths.getCursorUserHooksConfig('/home/alice');
  assert.strictEqual(result, path.join('/home/alice', '.cursor', 'hooks.json'));
});

test('getUserHooksStateFilePath joins homeDir, .myrules, and the state filename', () => {
  const result = paths.getUserHooksStateFilePath('/home/alice');
  assert.strictEqual(result, path.join('/home/alice', '.myrules', '.user-hooks-state.json'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/paths.test.js`
Expected: FAIL with "paths.getCursorProjectHooksDir is not a function"

- [ ] **Step 3: Add the new functions to `lib/paths.js`**

Replace the full contents of `tools/sync/lib/paths.js` with:

```javascript
// tools/sync/lib/paths.js
const os = require('node:os');
const path = require('node:path');

function getCacheDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.myrules');
}

function getProjectRoot(explicitPath) {
  return path.resolve(explicitPath || process.cwd());
}

function getClaudeUserRulesDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.claude', 'rules');
}

function getClaudeUserSkillsDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.claude', 'skills');
}

function getCursorUserSkillsDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.cursor', 'skills');
}

function getCursorRulesDir(projectRoot) {
  return path.join(projectRoot, '.cursor', 'rules');
}

function getClaudeProjectRulesDir(projectRoot) {
  return path.join(projectRoot, '.claude', 'rules');
}

function getStateFilePath(projectRoot) {
  return path.join(projectRoot, '.myrules-sync-state.json');
}

function getRegistryFilePath(homeDir = os.homedir()) {
  return path.join(getCacheDir(homeDir), '.registry.json');
}

function getCursorProjectHooksDir(projectRoot) {
  return path.join(projectRoot, '.cursor', 'hooks');
}

function getCursorProjectHooksConfig(projectRoot) {
  return path.join(projectRoot, '.cursor', 'hooks.json');
}

function getCursorUserHooksDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.cursor', 'hooks');
}

function getCursorUserHooksConfig(homeDir = os.homedir()) {
  return path.join(homeDir, '.cursor', 'hooks.json');
}

function getUserHooksStateFilePath(homeDir = os.homedir()) {
  return path.join(getCacheDir(homeDir), '.user-hooks-state.json');
}

module.exports = {
  getCacheDir,
  getProjectRoot,
  getClaudeUserRulesDir,
  getClaudeUserSkillsDir,
  getCursorUserSkillsDir,
  getCursorRulesDir,
  getClaudeProjectRulesDir,
  getStateFilePath,
  getRegistryFilePath,
  getCursorProjectHooksDir,
  getCursorProjectHooksConfig,
  getCursorUserHooksDir,
  getCursorUserHooksConfig,
  getUserHooksStateFilePath,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/paths.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Run the full existing suite to confirm no regressions**

Run: `node --test tests/*.test.js`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add tools/sync/lib/paths.js tests/paths.test.js
git commit -m "feat: add path helpers for Cursor hook locations"
```

---

## Task 5: Claude prose transform for hooks (`lib/transform.js` + `manifest.js`)

**Files:**
- Modify: `tools/sync/lib/transform.js`
- Modify: `manifest.js`
- Test: `tests/transform.test.js`

**Interfaces:**
- Produces: `transform.transformHookForClaude(meta, name)` → prose `string`. `manifest.claude.hookInfix` (`"hook-"`). Task 9's `hooks-deploy.js` consumes both.

- [ ] **Step 1: Write the failing test**

Append to `tests/transform.test.js`:

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/transform.test.js`
Expected: FAIL with "transform.transformHookForClaude is not a function"

- [ ] **Step 3: Add `transformHookForClaude` to `lib/transform.js`**

Replace the full contents of `tools/sync/lib/transform.js` with:

```javascript
// tools/sync/lib/transform.js
function transformForCursor(body, topic) {
  return `---\ndescription: "MyRules: ${topic}"\nalwaysApply: true\n---\n\n${body}`;
}

function transformForClaude(body) {
  return body;
}

function stripCursorFrontmatter(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)$/);
  return match ? match[1] : content;
}

function transformHookForClaude(meta, name) {
  return (
    `## Hook: ${name}\n\n` +
    `**Trigger (Cursor event):** ${meta.event}\n\n` +
    `**Convention:** ${meta.description}\n\n` +
    '(This is a MyRules hook convention. Claude has no automatic trigger for this — ' +
    'perform this action manually at the described moment.)\n'
  );
}

module.exports = { transformForCursor, transformForClaude, stripCursorFrontmatter, transformHookForClaude };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/transform.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Add `hookInfix` to `manifest.js`**

In `manifest.js`, replace the `claude` block:

```javascript
  claude: {
    userRulesDir: "~/.claude/rules",
    projectRulesDir: ".claude/rules",
    extension: ".md",
  },
```

with:

```javascript
  claude: {
    userRulesDir: "~/.claude/rules",
    projectRulesDir: ".claude/rules",
    extension: ".md",
    hookInfix: "hook-",
  },
```

- [ ] **Step 6: Run the full existing suite to confirm no regressions**

Run: `node --test tests/*.test.js`
Expected: PASS (all tests, including any that load `manifest.js` directly)

- [ ] **Step 7: Commit**

```bash
git add tools/sync/lib/transform.js manifest.js tests/transform.test.js
git commit -m "feat: add Claude prose transform for hooks"
```

---

## Task 6: Global user-hooks state module (`lib/hooks-state.js`)

**Files:**
- Create: `tools/sync/lib/hooks-state.js`
- Test: `tests/hooks-state.test.js`

**Interfaces:**
- Consumes: `paths.getUserHooksStateFilePath(homeDir)` (Task 4).
- Produces: `hooksState.readUserHooksState(homeDir)` → `{schemaVersion, deployedHooks: {}, deployedHashes: {}}`; `hooksState.writeUserHooksState(homeDir, patch)` → same shape, merged. Task 10's `sync.js` wiring is the consumer (mirrors `state.js`'s `readState`/`writeState`, scoped globally instead of per-project).

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/hooks-state.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const hooksState = require('../tools/sync/lib/hooks-state');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-state-home-'));
}

test('readUserHooksState returns defaults when no state file exists', () => {
  const home = tmpHome();
  const s = hooksState.readUserHooksState(home);
  assert.strictEqual(s.schemaVersion, 1);
  assert.deepStrictEqual(s.deployedHooks, {});
  assert.deepStrictEqual(s.deployedHashes, {});
});

test('writeUserHooksState creates the file and readUserHooksState reflects it', () => {
  const home = tmpHome();
  hooksState.writeUserHooksState(home, {
    deployedHooks: { 'session-log': { event: 'sessionEnd', command: 'node hooks/myrules-session-log.js' } },
  });
  const file = path.join(home, '.myrules', '.user-hooks-state.json');
  assert.ok(fs.existsSync(file));
  const s = hooksState.readUserHooksState(home);
  assert.deepStrictEqual(s.deployedHooks, {
    'session-log': { event: 'sessionEnd', command: 'node hooks/myrules-session-log.js' },
  });
});

test('writeUserHooksState merges with existing state instead of replacing it', () => {
  const home = tmpHome();
  hooksState.writeUserHooksState(home, { deployedHashes: { 'script:a': 'hash1' } });
  hooksState.writeUserHooksState(home, {
    deployedHooks: { b: { event: 'sessionEnd', command: 'node hooks/myrules-b.js' } },
  });
  const s = hooksState.readUserHooksState(home);
  assert.deepStrictEqual(s.deployedHashes, { 'script:a': 'hash1' });
  assert.deepStrictEqual(s.deployedHooks, { b: { event: 'sessionEnd', command: 'node hooks/myrules-b.js' } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-state.test.js`
Expected: FAIL with "Cannot find module '../tools/sync/lib/hooks-state'"

- [ ] **Step 3: Create `lib/hooks-state.js`**

```javascript
// tools/sync/lib/hooks-state.js
const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');

const DEFAULT_USER_HOOKS_STATE = {
  schemaVersion: 1,
  deployedHooks: {},
  deployedHashes: {},
};

function readUserHooksState(homeDir) {
  const file = paths.getUserHooksStateFilePath(homeDir);
  if (!fs.existsSync(file)) return { ...DEFAULT_USER_HOOKS_STATE };
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...DEFAULT_USER_HOOKS_STATE, ...stored };
}

function writeUserHooksState(homeDir, patch) {
  const current = readUserHooksState(homeDir);
  const next = { ...current, ...patch };
  const file = paths.getUserHooksStateFilePath(homeDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}

module.exports = { DEFAULT_USER_HOOKS_STATE, readUserHooksState, writeUserHooksState };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hooks-state.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full existing suite to confirm no regressions**

Run: `node --test tests/*.test.js`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add tools/sync/lib/hooks-state.js tests/hooks-state.test.js
git commit -m "feat: add global user-hooks state module"
```

---

## Task 7: Gitignore MyRules-managed hook scripts (`lib/gitignore.js`)

**Files:**
- Modify: `tools/sync/lib/gitignore.js`
- Test: `tests/gitignore.test.js`

**Interfaces:**
- Produces: `gitignore.buildBlock(manifest)` now includes a `.cursor/hooks/myrules-*` line. No signature change.

- [ ] **Step 1: Write the failing test**

Append to `tests/gitignore.test.js`:

```javascript
test('ensureGitignore includes the MyRules-managed hook scripts pattern', () => {
  const project = tmpProject();
  gitignore.ensureGitignore(project, manifest);
  const content = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
  assert.match(content, /\.cursor\/hooks\/myrules-\*/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/gitignore.test.js`
Expected: FAIL (no match for `/\.cursor\/hooks\/myrules-\*/`)

- [ ] **Step 3: Update `buildBlock` in `lib/gitignore.js`**

Replace the `buildBlock` function in `tools/sync/lib/gitignore.js`:

```javascript
function buildBlock(manifest) {
  const prefix = manifest.managedPrefix;
  const backupDir = manifest.prune.backupDir;
  const stateFile = path.basename(paths.getStateFilePath('.'));
  return [
    MARKER,
    `.cursor/rules/${prefix}*`,
    `.claude/rules/${prefix}*`,
    `.cursor/hooks/${prefix}*`,
    `${backupDir}/`,
    `${stateFile}`,
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/gitignore.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full existing suite to confirm no regressions**

Run: `node --test tests/*.test.js`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add tools/sync/lib/gitignore.js tests/gitignore.test.js
git commit -m "feat: gitignore MyRules-managed hook scripts"
```

---

## Task 8: `hooks.json` merge algorithm (`lib/hooks-deploy.js`)

**Files:**
- Create: `tools/sync/lib/hooks-deploy.js`
- Test: `tests/hooks-deploy.test.js`

**Interfaces:**
- Produces: `hooksDeploy.mergeHooksJson(existing, previousCommandsByEvent, currentHooks)` → new `hooks.json` document object. `existing` is the parsed `hooks.json` content or `null`. `previousCommandsByEvent` is `{ [event]: string[] }` (exact `command` strings MyRules wrote last time for that event) or `{}` when there's no record for an event yet. `currentHooks` is `Array<{event, command, matcher?, timeout?, failClosed?}>`. Task 9 builds the rest of `hooks-deploy.js` around this function.

- [ ] **Step 1: Write the failing tests**

```javascript
// tests/hooks-deploy.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { mergeHooksJson } = require('../tools/sync/lib/hooks-deploy');

test('mergeHooksJson creates a fresh doc when none exists', () => {
  const result = mergeHooksJson(null, {}, [{ event: 'sessionStart', command: 'node .cursor/hooks/myrules-a.js' }]);
  assert.strictEqual(result.version, 1);
  assert.deepStrictEqual(result.hooks.sessionStart, [{ command: 'node .cursor/hooks/myrules-a.js' }]);
});

test('mergeHooksJson preserves foreign entries on events MyRules does not manage', () => {
  const existing = { version: 1, hooks: { afterFileEdit: [{ command: './format.sh' }] } };
  const result = mergeHooksJson(existing, {}, [{ event: 'sessionStart', command: 'node .cursor/hooks/myrules-a.js' }]);
  assert.deepStrictEqual(result.hooks.afterFileEdit, [{ command: './format.sh' }]);
  assert.deepStrictEqual(result.hooks.sessionStart, [{ command: 'node .cursor/hooks/myrules-a.js' }]);
});

test('mergeHooksJson preserves a foreign entry on a MyRules-managed event via exact-match removal', () => {
  const existing = {
    version: 1,
    hooks: {
      sessionStart: [{ command: './my-own-script.sh' }, { command: 'node .cursor/hooks/myrules-old.js' }],
    },
  };
  const previous = { sessionStart: ['node .cursor/hooks/myrules-old.js'] };
  const result = mergeHooksJson(existing, previous, [
    { event: 'sessionStart', command: 'node .cursor/hooks/myrules-a.js' },
  ]);
  assert.deepStrictEqual(result.hooks.sessionStart, [
    { command: './my-own-script.sh' },
    { command: 'node .cursor/hooks/myrules-a.js' },
  ]);
});

test('mergeHooksJson falls back to a myrules- substring filter when no prior record exists for that event', () => {
  const existing = {
    version: 1,
    hooks: { sessionStart: [{ command: 'node .cursor/hooks/myrules-leftover.js' }, { command: './keep-me.sh' }] },
  };
  const result = mergeHooksJson(existing, {}, [{ event: 'sessionStart', command: 'node .cursor/hooks/myrules-a.js' }]);
  assert.deepStrictEqual(result.hooks.sessionStart, [
    { command: './keep-me.sh' },
    { command: 'node .cursor/hooks/myrules-a.js' },
  ]);
});

test('mergeHooksJson removes an event key entirely when its array becomes empty', () => {
  const existing = { version: 1, hooks: { sessionEnd: [{ command: 'node .cursor/hooks/myrules-old.js' }] } };
  const previous = { sessionEnd: ['node .cursor/hooks/myrules-old.js'] };
  const result = mergeHooksJson(existing, previous, []);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result.hooks, 'sessionEnd'), false);
});

test('mergeHooksJson preserves an existing non-default version number', () => {
  const existing = { version: 2, hooks: {} };
  const result = mergeHooksJson(existing, {}, []);
  assert.strictEqual(result.version, 2);
});

test('mergeHooksJson includes optional matcher/timeout/failClosed only when set', () => {
  const result = mergeHooksJson(null, {}, [
    { event: 'beforeShellExecution', command: 'node .cursor/hooks/myrules-a.js', matcher: 'curl' },
  ]);
  assert.deepStrictEqual(result.hooks.beforeShellExecution, [
    { command: 'node .cursor/hooks/myrules-a.js', matcher: 'curl' },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hooks-deploy.test.js`
Expected: FAIL with "Cannot find module '../tools/sync/lib/hooks-deploy'"

- [ ] **Step 3: Create `lib/hooks-deploy.js` with `mergeHooksJson` only**

```javascript
// tools/sync/lib/hooks-deploy.js
function mergeHooksJson(existing, previousCommandsByEvent, currentHooks) {
  const doc = existing && typeof existing === 'object' ? { ...existing } : {};
  if (typeof doc.version !== 'number') doc.version = 1;
  const hooksObj = { ...(doc.hooks || {}) };
  const priorByEvent = previousCommandsByEvent || {};

  const touchedEvents = new Set([...Object.keys(priorByEvent), ...currentHooks.map((h) => h.event)]);

  for (const event of touchedEvents) {
    const existingArray = Array.isArray(hooksObj[event]) ? hooksObj[event] : [];
    const hasRecordForEvent = Object.prototype.hasOwnProperty.call(priorByEvent, event);
    const previousCommands = new Set(priorByEvent[event] || []);

    const kept = existingArray.filter((entry) => {
      if (!hasRecordForEvent) {
        return !(typeof entry.command === 'string' && entry.command.includes('myrules-'));
      }
      return !previousCommands.has(entry.command);
    });

    const additions = currentHooks
      .filter((h) => h.event === event)
      .map((h) => {
        const entry = { command: h.command };
        if (h.matcher !== undefined) entry.matcher = h.matcher;
        if (h.timeout !== undefined) entry.timeout = h.timeout;
        if (h.failClosed !== undefined) entry.failClosed = h.failClosed;
        return entry;
      });

    const merged = kept.concat(additions);
    if (merged.length) hooksObj[event] = merged;
    else delete hooksObj[event];
  }

  doc.hooks = hooksObj;
  return doc;
}

module.exports = { mergeHooksJson };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hooks-deploy.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full existing suite to confirm no regressions**

Run: `node --test tests/*.test.js`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add tools/sync/lib/hooks-deploy.js tests/hooks-deploy.test.js
git commit -m "feat: add hooks.json merge algorithm"
```

---

## Task 9: Full hook deploy — project and user scope

**Files:**
- Modify: `tools/sync/lib/hooks-deploy.js` (add `deployHooks`, `deployProjectHooks`, `deployUserHooks`)
- Modify: `tools/sync/lib/state.js` (add `deployedHooks: {}` to `DEFAULT_STATE`)
- Test: `tests/hooks-deploy.test.js` (append)
- Test: `tests/state.test.js` (append)

**Interfaces:**
- Consumes: `hooksLib.loadHookSources` (Task 2), `drift.createTracker` (Task 1), `transform.transformHookForClaude` (Task 5), `paths.getCursor{Project,User}Hooks{Dir,Config}` (Task 4), `paths.getClaude{Project,User}RulesDir` (existing), `loadManifest.loadManifest` (existing), `manifest.claude.hookInfix` (Task 5).
- Produces: `hooksDeploy.deployProjectHooks(cacheDir, projectRoot, opts)` and `hooksDeploy.deployUserHooks(cacheDir, opts)`, both returning `{ deployedHooks: Record<string, {event, command}>, deployedHashes: Record<string,string>, drifted: string[], stale: string[] }`. `opts.priorState` (`{deployedHooks?, deployedHashes?}`, defaults to `{}`), `opts.force`, `opts.manifest`, and (for the project variant) `opts.scriptsDir`/`opts.configFile`/`opts.claudeDir`, or (for the user variant) `opts.homeDir`/`opts.scriptsDir`/`opts.configFile`/`opts.claudeDir` are all test-overridable, mirroring `deploy.deployRules`'s option shape. Task 10's `sync.js` wiring is the consumer.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hooks-deploy.test.js`:

```javascript
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const hooksDeploy = require('../tools/sync/lib/hooks-deploy');

function makeCache() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-cache-'));
  fs.mkdirSync(path.join(cache, 'hooks', 'project'), { recursive: true });
  fs.mkdirSync(path.join(cache, 'hooks', 'user'), { recursive: true });
  fs.writeFileSync(
    path.join(cache, 'hooks', 'project', 'session-start-context.js'),
    "module.exports.meta = { event: 'sessionStart', description: 'read context' };\n" +
      'module.exports.handle = function handle() { return {}; };\n'
  );
  return cache;
}

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-project-'));
}

const fakeManifest = { claude: { hookInfix: 'hook-' } };

test('deployProjectHooks writes the Cursor script, hooks.json entry, and Claude prose file', () => {
  const cache = makeCache();
  const project = makeProject();
  const result = hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} });

  const scriptFile = path.join(project, '.cursor', 'hooks', 'myrules-session-start-context.js');
  const configFile = path.join(project, '.cursor', 'hooks.json');
  const claudeFile = path.join(project, '.claude', 'rules', 'myrules-hook-session-start-context.md');

  assert.ok(fs.existsSync(scriptFile));
  assert.ok(fs.existsSync(configFile));
  assert.ok(fs.existsSync(claudeFile));

  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.deepStrictEqual(config.hooks.sessionStart, [
    { command: 'node .cursor/hooks/myrules-session-start-context.js' },
  ]);
  assert.match(fs.readFileSync(claudeFile, 'utf8'), /read context/);
  assert.deepStrictEqual(result.deployedHooks, {
    'session-start-context': {
      event: 'sessionStart',
      command: 'node .cursor/hooks/myrules-session-start-context.js',
    },
  });
});

test('deployProjectHooks preserves foreign hooks.json entries', () => {
  const cache = makeCache();
  const project = makeProject();
  fs.mkdirSync(path.join(project, '.cursor'), { recursive: true });
  fs.writeFileSync(
    path.join(project, '.cursor', 'hooks.json'),
    JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: './format.sh' }] } }, null, 2)
  );

  hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} });

  const config = JSON.parse(fs.readFileSync(path.join(project, '.cursor', 'hooks.json'), 'utf8'));
  assert.deepStrictEqual(config.hooks.afterFileEdit, [{ command: './format.sh' }]);
});

test('deployProjectHooks removes a stale hook script, prose file, and hooks.json entry when removed from source', () => {
  const cache = makeCache();
  const project = makeProject();
  const first = hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} });

  fs.rmSync(path.join(cache, 'hooks', 'project', 'session-start-context.js'));
  const second = hooksDeploy.deployProjectHooks(cache, project, {
    manifest: fakeManifest,
    priorState: { deployedHooks: first.deployedHooks, deployedHashes: first.deployedHashes },
  });

  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'hooks', 'myrules-session-start-context.js')), false);
  assert.strictEqual(
    fs.existsSync(path.join(project, '.claude', 'rules', 'myrules-hook-session-start-context.md')),
    false
  );
  const config = JSON.parse(fs.readFileSync(path.join(project, '.cursor', 'hooks.json'), 'utf8'));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(config.hooks, 'sessionStart'), false);
  assert.deepStrictEqual(second.deployedHooks, {});
});

test('deployProjectHooks skips a hand-edited script and reports it as drifted', () => {
  const cache = makeCache();
  const project = makeProject();
  const first = hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} });

  const scriptFile = path.join(project, '.cursor', 'hooks', 'myrules-session-start-context.js');
  fs.writeFileSync(scriptFile, '// hand-edited');

  const second = hooksDeploy.deployProjectHooks(cache, project, {
    manifest: fakeManifest,
    priorState: { deployedHooks: first.deployedHooks, deployedHashes: first.deployedHashes },
  });

  assert.ok(second.drifted.includes(scriptFile));
  assert.strictEqual(fs.readFileSync(scriptFile, 'utf8'), '// hand-edited');
});

test('deployProjectHooks skips a hand-edited Claude prose file and reports it as drifted', () => {
  const cache = makeCache();
  const project = makeProject();
  const first = hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} });

  const claudeFile = path.join(project, '.claude', 'rules', 'myrules-hook-session-start-context.md');
  fs.writeFileSync(claudeFile, 'hand-edited prose');

  const second = hooksDeploy.deployProjectHooks(cache, project, {
    manifest: fakeManifest,
    priorState: { deployedHooks: first.deployedHooks, deployedHashes: first.deployedHashes },
  });

  assert.ok(second.drifted.includes(claudeFile));
  assert.strictEqual(fs.readFileSync(claudeFile, 'utf8'), 'hand-edited prose');
});

test('deployProjectHooks does nothing when no hooks are defined in source', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-empty-cache-'));
  const project = makeProject();
  const result = hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} });

  assert.strictEqual(fs.existsSync(path.join(project, '.cursor', 'hooks.json')), false);
  assert.deepStrictEqual(result.deployedHooks, {});
});

test('deployProjectHooks aborts with a clear error when hooks.json is malformed', () => {
  const cache = makeCache();
  const project = makeProject();
  fs.mkdirSync(path.join(project, '.cursor'), { recursive: true });
  fs.writeFileSync(path.join(project, '.cursor', 'hooks.json'), '{ not valid json');

  assert.throws(
    () => hooksDeploy.deployProjectHooks(cache, project, { manifest: fakeManifest, priorState: {} }),
    /Failed to parse/
  );
});

test('deployUserHooks writes to the given homeDir-relative Cursor and Claude locations', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-user-cache-'));
  fs.mkdirSync(path.join(cache, 'hooks', 'user'), { recursive: true });
  fs.writeFileSync(
    path.join(cache, 'hooks', 'user', 'session-log.js'),
    "module.exports.meta = { event: 'sessionEnd', description: 'log it' };\n" +
      'module.exports.handle = function handle() { return {}; };\n'
  );
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-home-'));

  const result = hooksDeploy.deployUserHooks(cache, { manifest: fakeManifest, homeDir, priorState: {} });

  const scriptFile = path.join(homeDir, '.cursor', 'hooks', 'myrules-session-log.js');
  const configFile = path.join(homeDir, '.cursor', 'hooks.json');
  const claudeFile = path.join(homeDir, '.claude', 'rules', 'myrules-hook-session-log.md');
  assert.ok(fs.existsSync(scriptFile));
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.deepStrictEqual(config.hooks.sessionEnd, [{ command: 'node hooks/myrules-session-log.js' }]);
  assert.ok(fs.existsSync(claudeFile));
  assert.deepStrictEqual(result.deployedHooks, {
    'session-log': { event: 'sessionEnd', command: 'node hooks/myrules-session-log.js' },
  });
});
```

Append to `tests/state.test.js`:

```javascript
test('writeState persists nested deployedHooks object', () => {
  const project = tmpProject();
  state.writeState(project, {
    deployedHooks: { 'session-start-context': { event: 'sessionStart', command: 'node x' } },
  });
  const s = state.readState(project);
  assert.deepStrictEqual(s.deployedHooks, { 'session-start-context': { event: 'sessionStart', command: 'node x' } });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks-deploy.test.js tests/state.test.js`
Expected: FAIL — `hooksDeploy.deployProjectHooks is not a function`, and the new `state.test.js` case fails because `deployedHooks` is `undefined`

- [ ] **Step 3: Add `deployedHooks` to `state.js`**

In `tools/sync/lib/state.js`, replace `DEFAULT_STATE`:

```javascript
const DEFAULT_STATE = {
  schemaVersion: 1,
  cachePath: '~/.myrules',
  cacheCommit: null,
  lastSyncAt: null,
  lastPruneAt: null,
  pruneDryRunDone: false,
  pruneDryRunAt: null,
  legacyRulesFingerprint: null,
  legacyRulesDetected: 0,
  deployedHashes: {},
  deployedHooks: {},
};
```

- [ ] **Step 4: Add `deployHooks`, `deployProjectHooks`, `deployUserHooks` to `lib/hooks-deploy.js`**

Replace the full contents of `tools/sync/lib/hooks-deploy.js` with:

```javascript
// tools/sync/lib/hooks-deploy.js
const fs = require('node:fs');
const path = require('node:path');
const hooksLib = require('./hooks');
const drift = require('./drift');
const transform = require('./transform');
const fsutil = require('./fsutil');
const paths = require('./paths');
const loadManifest = require('./load-manifest');

function mergeHooksJson(existing, previousCommandsByEvent, currentHooks) {
  const doc = existing && typeof existing === 'object' ? { ...existing } : {};
  if (typeof doc.version !== 'number') doc.version = 1;
  const hooksObj = { ...(doc.hooks || {}) };
  const priorByEvent = previousCommandsByEvent || {};

  const touchedEvents = new Set([...Object.keys(priorByEvent), ...currentHooks.map((h) => h.event)]);

  for (const event of touchedEvents) {
    const existingArray = Array.isArray(hooksObj[event]) ? hooksObj[event] : [];
    const hasRecordForEvent = Object.prototype.hasOwnProperty.call(priorByEvent, event);
    const previousCommands = new Set(priorByEvent[event] || []);

    const kept = existingArray.filter((entry) => {
      if (!hasRecordForEvent) {
        return !(typeof entry.command === 'string' && entry.command.includes('myrules-'));
      }
      return !previousCommands.has(entry.command);
    });

    const additions = currentHooks
      .filter((h) => h.event === event)
      .map((h) => {
        const entry = { command: h.command };
        if (h.matcher !== undefined) entry.matcher = h.matcher;
        if (h.timeout !== undefined) entry.timeout = h.timeout;
        if (h.failClosed !== undefined) entry.failClosed = h.failClosed;
        return entry;
      });

    const merged = kept.concat(additions);
    if (merged.length) hooksObj[event] = merged;
    else delete hooksObj[event];
  }

  doc.hooks = hooksObj;
  return doc;
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${file} as JSON: ${err.message}`);
  }
}

function deployHooks({ sourceDir, scriptsDir, configFile, commandDirPosix, claudeDir, hookInfix, force, priorState }) {
  const sources = hooksLib.loadHookSources(sourceDir);
  const previousNames = Object.keys(priorState.deployedHooks || {});

  if (sources.length === 0 && previousNames.length === 0) {
    return { deployedHooks: {}, deployedHashes: {}, drifted: [], stale: [] };
  }

  fsutil.ensureDir(scriptsDir);
  fsutil.ensureDir(claudeDir);

  const currentHooks = sources.map((s) => ({
    name: s.name,
    event: s.meta.event,
    matcher: s.meta.matcher,
    timeout: s.meta.timeout,
    failClosed: s.meta.failClosed,
    command: `node ${commandDirPosix}/myrules-${s.name}.js`,
  }));

  const currentNames = new Set(sources.map((s) => s.name));
  const staleNames = previousNames.filter((n) => !currentNames.has(n));

  const tracker = drift.createTracker({ force, priorHashes: priorState.deployedHashes || {} });

  for (const s of sources) {
    const scriptTarget = path.join(scriptsDir, `myrules-${s.name}.js`);
    tracker.writeTracked(scriptTarget, fs.readFileSync(s.file, 'utf8'), `script:${s.name}`);

    const claudeTarget = path.join(claudeDir, `myrules-${hookInfix}${s.name}.md`);
    tracker.writeTracked(claudeTarget, transform.transformHookForClaude(s.meta, s.name), `claude:${s.name}`);
  }

  for (const staleName of staleNames) {
    const scriptTarget = path.join(scriptsDir, `myrules-${staleName}.js`);
    const claudeTarget = path.join(claudeDir, `myrules-${hookInfix}${staleName}.md`);
    if (fs.existsSync(scriptTarget)) fs.unlinkSync(scriptTarget);
    if (fs.existsSync(claudeTarget)) fs.unlinkSync(claudeTarget);
  }

  const previousCommandsByEvent = {};
  for (const info of Object.values(priorState.deployedHooks || {})) {
    previousCommandsByEvent[info.event] = previousCommandsByEvent[info.event] || [];
    previousCommandsByEvent[info.event].push(info.command);
  }

  const configFileExisted = fs.existsSync(configFile);
  const existingConfig = readJsonIfExists(configFile);
  const nextConfig = mergeHooksJson(existingConfig, previousCommandsByEvent, currentHooks);
  if (configFileExisted || Object.keys(nextConfig.hooks).length > 0) {
    fs.writeFileSync(configFile, JSON.stringify(nextConfig, null, 2) + '\n');
  }

  const deployedHooks = {};
  for (const h of currentHooks) {
    deployedHooks[h.name] = { event: h.event, command: h.command };
  }

  return { deployedHooks, deployedHashes: tracker.hashes, drifted: tracker.drifted, stale: staleNames };
}

function deployProjectHooks(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  return deployHooks({
    sourceDir: path.join(cacheDir, 'hooks', 'project'),
    scriptsDir: opts.scriptsDir || paths.getCursorProjectHooksDir(projectRoot),
    configFile: opts.configFile || paths.getCursorProjectHooksConfig(projectRoot),
    commandDirPosix: '.cursor/hooks',
    claudeDir: opts.claudeDir || paths.getClaudeProjectRulesDir(projectRoot),
    hookInfix: manifest.claude.hookInfix,
    force: opts.force || false,
    priorState: opts.priorState || {},
  });
}

function deployUserHooks(cacheDir, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const homeDir = opts.homeDir || require('node:os').homedir();
  return deployHooks({
    sourceDir: path.join(cacheDir, 'hooks', 'user'),
    scriptsDir: opts.scriptsDir || paths.getCursorUserHooksDir(homeDir),
    configFile: opts.configFile || paths.getCursorUserHooksConfig(homeDir),
    commandDirPosix: 'hooks',
    claudeDir: opts.claudeDir || paths.getClaudeUserRulesDir(homeDir),
    hookInfix: manifest.claude.hookInfix,
    force: opts.force || false,
    priorState: opts.priorState || {},
  });
}

module.exports = { mergeHooksJson, deployHooks, deployProjectHooks, deployUserHooks };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/hooks-deploy.test.js tests/state.test.js`
Expected: PASS (15 tests in `hooks-deploy.test.js`, 5 in `state.test.js`)

- [ ] **Step 6: Run the full existing suite to confirm no regressions**

Run: `node --test tests/*.test.js`
Expected: PASS (all tests)

- [ ] **Step 7: Commit**

```bash
git add tools/sync/lib/hooks-deploy.js tools/sync/lib/state.js tests/hooks-deploy.test.js tests/state.test.js
git commit -m "feat: deploy project and user hooks with drift detection and stale cleanup"
```

---

## Task 10: Wire hook deployment into `sync.js`

**Files:**
- Modify: `tools/sync/sync.js`
- Modify: `tests/helpers/cache-seed.js` (copy the real seed hooks into test fixture caches)
- Test: `tests/sync-hooks.test.js`

**Interfaces:**
- Consumes: `hooksDeploy.deployProjectHooks` / `deployUserHooks` (Task 9), `hooksState.readUserHooksState` / `writeUserHooksState` (Task 6).
- Produces: `sync.run(opts)` now also deploys hooks; `opts.skipUserHooks` (internal test-only flag, mirrors `skipSkills`) skips the user-hooks step.

- [ ] **Step 1: Extend `tests/helpers/cache-seed.js` to include the real seed hooks**

Replace the full contents of `tests/helpers/cache-seed.js` with:

```javascript
// tests/helpers/cache-seed.js
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..');

function seedCacheContent(cacheDir) {
  fs.mkdirSync(path.join(cacheDir, 'rules', 'user'), { recursive: true });
  fs.mkdirSync(path.join(cacheDir, 'rules', 'project'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'manifest.js'), path.join(cacheDir, 'manifest.js'));
  fs.mkdirSync(path.join(cacheDir, 'skills', 'myrules'), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, 'skills', 'myrules', 'SKILL.md'),
    path.join(cacheDir, 'skills', 'myrules', 'SKILL.md')
  );
  fs.writeFileSync(path.join(cacheDir, 'skills-manifest.js'), 'module.exports = { skills: [] };\n');
  fs.mkdirSync(path.join(cacheDir, 'hooks', 'project'), { recursive: true });
  fs.mkdirSync(path.join(cacheDir, 'hooks', 'user'), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, 'hooks', 'project', 'session-start-context.js'),
    path.join(cacheDir, 'hooks', 'project', 'session-start-context.js')
  );
  fs.copyFileSync(
    path.join(REPO_ROOT, 'hooks', 'user', 'session-log.js'),
    path.join(cacheDir, 'hooks', 'user', 'session-log.js')
  );
}

module.exports = { seedCacheContent, REPO_ROOT };
```

- [ ] **Step 2: Run the full existing suite to confirm this alone doesn't break anything**

Run: `node --test tests/*.test.js`
Expected: PASS (every test that calls `seedCacheContent` now also seeds the two real hooks, but no existing test asserts an exhaustive file listing, so nothing existing should break)

- [ ] **Step 3: Write the failing tests for `sync.js` hook wiring**

```javascript
// tests/sync-hooks.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const syncCli = require('../tools/sync/sync');
const installSkillCli = require('../tools/sync/install-skill');
const state = require('../tools/sync/lib/state');
const hooksState = require('../tools/sync/lib/hooks-state');
const { seedCacheContent } = require('./helpers/cache-seed');

function run(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function makeCacheRepo() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-cache-'));
  seedCacheContent(cache);
  fs.writeFileSync(path.join(cache, 'rules', 'user', 'preferences.md'), '# Preferences\n\n- be concise');
  fs.writeFileSync(path.join(cache, 'rules', 'project', 'testing.md'), '# Testing\n\n- write tests');
  run(cache, ['init']);
  run(cache, ['config', 'user.email', 'test@example.com']);
  run(cache, ['config', 'user.name', 'Test']);
  run(cache, ['add', '-A']);
  run(cache, ['commit', '-m', 'init']);
  return cache;
}

function installSkill(project) {
  installSkillCli.run({ project, sourceDir: installSkillCli.getBundledRepoRoot() });
}

function baseOpts(project, cache, homeDir) {
  return {
    project,
    cacheDir: cache,
    dryRun: false,
    prune: false,
    force: false,
    skipPull: true,
    skipSkills: true,
    claudeUserDir: path.join(homeDir, '.claude', 'rules'),
    homeDir,
  };
}

test('sync.run deploys both project and user hooks in one call', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-project-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-home-'));
  installSkill(project);

  syncCli.run(baseOpts(project, cache, homeDir));

  assert.ok(fs.existsSync(path.join(project, '.cursor', 'hooks', 'myrules-session-start-context.js')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'hooks.json')));
  assert.ok(fs.existsSync(path.join(homeDir, '.cursor', 'hooks', 'myrules-session-log.js')));
  assert.ok(fs.existsSync(path.join(homeDir, '.cursor', 'hooks.json')));

  const s = state.readState(project);
  assert.deepStrictEqual(Object.keys(s.deployedHooks), ['session-start-context']);

  const hs = hooksState.readUserHooksState(homeDir);
  assert.deepStrictEqual(Object.keys(hs.deployedHooks), ['session-log']);
});

test('sync.run --all deploys user hooks once but project hooks into every registered project', () => {
  const cache = makeCacheRepo();
  const projectA = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-a-'));
  const projectB = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-b-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-home-'));
  installSkill(projectA);
  installSkill(projectB);
  syncCli.run(baseOpts(projectA, cache, homeDir));
  syncCli.run(baseOpts(projectB, cache, homeDir));

  syncCli.run({ ...baseOpts(projectA, cache, homeDir), all: true });

  assert.ok(fs.existsSync(path.join(projectA, '.cursor', 'hooks', 'myrules-session-start-context.js')));
  assert.ok(fs.existsSync(path.join(projectB, '.cursor', 'hooks', 'myrules-session-start-context.js')));
  assert.ok(fs.existsSync(path.join(homeDir, '.cursor', 'hooks', 'myrules-session-log.js')));
});

test('sync.run second run reports no drift for untouched hook files', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-project-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-home-'));
  installSkill(project);

  syncCli.run(baseOpts(project, cache, homeDir));
  syncCli.run(baseOpts(project, cache, homeDir));

  const s = state.readState(project);
  assert.deepStrictEqual(Object.keys(s.deployedHooks), ['session-start-context']);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test tests/sync-hooks.test.js`
Expected: FAIL — `.cursor/hooks/myrules-session-start-context.js` does not exist (sync.js doesn't deploy hooks yet)

- [ ] **Step 5: Wire hooks into `sync.js`**

Replace the full contents of `tools/sync/sync.js` with:

```javascript
#!/usr/bin/env node
const path = require('node:path');
const paths = require('./lib/paths');
const git = require('./lib/git');
const state = require('./lib/state');
const deploy = require('./lib/deploy');
const legacy = require('./lib/legacy');
const skills = require('./lib/skills');
const registry = require('./lib/registry');
const loadManifest = require('./lib/load-manifest');
const ensureCache = require('./lib/ensure-cache');
const prepareProject = require('./lib/prepare-project');
const hooksDeploy = require('./lib/hooks-deploy');
const hooksState = require('./lib/hooks-state');

function parseArgs(argv) {
  const args = { dryRun: false, prune: false, project: null, all: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--prune-legacy-rules') args.prune = true;
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '--project') args.project = argv[++i];
  }
  return args;
}

function reportSkillResults(results) {
  const failed = results.filter((r) => !r.ok);
  if (!failed.length) return;
  console.warn(`Skill sync failed for ${failed.length} target(s):`);
  for (const r of failed) {
    console.warn(`  ${r.name} → ${r.target}: ${r.error}`);
  }
}

function reportDrifted(label, files) {
  if (!files.length) return;
  console.warn(`Skipped ${files.length} locally-modified ${label} (run 'export' first, or pass --force):`);
  files.forEach((f) => console.warn(`  ${f}`));
}

function syncOne(cacheDir, projectRoot, opts, manifest) {
  const managedPrefix = manifest.managedPrefix;
  const backupDir = manifest.prune.backupDir;
  const legacyFiles = legacy.scanLegacy(projectRoot, managedPrefix, manifest);
  const fp = legacy.fingerprint(legacyFiles);

  if (opts.dryRun) {
    console.log(`[dry-run] ${projectRoot}`);
    console.log(`  legacy files (${legacyFiles.length}):`);
    legacyFiles.forEach((f) => console.log(`    ${f}`));
    if (opts.prune) {
      state.writeState(projectRoot, {
        pruneDryRunDone: true,
        pruneDryRunAt: new Date().toISOString(),
        legacyRulesFingerprint: fp,
        legacyRulesDetected: legacyFiles.length,
      });
    }
    return;
  }

  const current = state.readState(projectRoot);
  const result = deploy.deployRules(cacheDir, projectRoot, {
    force: opts.force,
    priorHashes: current.deployedHashes,
    manifest,
    ...(opts.claudeUserDir ? { claudeUserDir: opts.claudeUserDir } : {}),
  });
  reportDrifted('file(s)', result.drifted);

  const hooksResult = hooksDeploy.deployProjectHooks(cacheDir, projectRoot, {
    force: opts.force,
    priorState: { deployedHooks: current.deployedHooks, deployedHashes: current.deployedHashes },
    manifest,
    ...(opts.claudeDir ? { claudeDir: opts.claudeDir } : {}),
  });
  reportDrifted('hook file(s)', hooksResult.drifted);

  let lastPruneAt = current.lastPruneAt;
  if (opts.prune) {
    if (!current.pruneDryRunDone || current.legacyRulesFingerprint !== fp) {
      throw new Error(
        "Refusing to prune: run with --dry-run --prune-legacy-rules first (legacy set changed or dry-run not done)."
      );
    }
    const backupRoot = legacy.pruneLegacy(projectRoot, legacyFiles, backupDir);
    console.log(`Archived ${legacyFiles.length} legacy file(s) to ${backupRoot}`);
    lastPruneAt = new Date().toISOString();
  }

  state.writeState(projectRoot, {
    cacheCommit: git.revParseHead(cacheDir),
    lastSyncAt: new Date().toISOString(),
    lastPruneAt,
    deployedHashes: { ...result.hashes, ...hooksResult.deployedHashes },
    deployedHooks: hooksResult.deployedHooks,
  });
  registry.registerProject(projectRoot, opts.homeDir || require('node:os').homedir());
}

function run(opts) {
  let cacheDir = opts.cacheDir || paths.getCacheDir();
  const homeDir = opts.homeDir || require('node:os').homedir();

  let manifest = loadManifest.loadManifest(cacheDir);
  if (!opts.skipEnsureCache) {
    const cacheResult = ensureCache.ensureCache(cacheDir, manifest);
    if (cacheResult.created) {
      console.log(`Cloned MyRules cache to ${cacheDir}`);
      manifest = loadManifest.loadManifest(cacheDir);
    }
  }

  if (!opts.skipPull) {
    if (git.isDirty(cacheDir)) {
      throw new Error(`${cacheDir} has uncommitted changes. Commit/stash, or run push.js, before syncing.`);
    }
    git.pullFastForward(cacheDir);
  }
  if (!opts.skipSkills) {
    const skillResults = skills.syncSkills(cacheDir, {
      cursorSkillsDir: paths.getCursorUserSkillsDir(homeDir),
      claudeSkillsDir: paths.getClaudeUserSkillsDir(homeDir),
    });
    reportSkillResults(skillResults);
  }
  if (!opts.skipUserHooks) {
    const priorUserHooksState = hooksState.readUserHooksState(homeDir);
    const userHooksResult = hooksDeploy.deployUserHooks(cacheDir, {
      homeDir,
      force: opts.force,
      priorState: priorUserHooksState,
      manifest,
    });
    reportDrifted('user hook file(s)', userHooksResult.drifted);
    hooksState.writeUserHooksState(homeDir, {
      deployedHooks: userHooksResult.deployedHooks,
      deployedHashes: userHooksResult.deployedHashes,
    });
  }

  if (opts.all) {
    for (const p of registry.listRegisteredProjects(homeDir)) {
      syncOne(cacheDir, p, opts, manifest);
    }
  } else {
    const projectRoot = paths.getProjectRoot(opts.project);
    if (!opts.skipPrepare) {
      prepareProject.prepareProject(projectRoot, cacheDir, manifest);
    }
    syncOne(cacheDir, projectRoot, opts, manifest);
  }
}

if (require.main === module) {
  try {
    run(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { run, parseArgs, reportSkillResults };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/sync-hooks.test.js`
Expected: PASS (3 tests)

- [ ] **Step 7: Run the full existing suite to confirm no regressions**

Run: `node --test tests/*.test.js`
Expected: PASS (all tests)

- [ ] **Step 8: Commit**

```bash
git add tools/sync/sync.js tests/helpers/cache-seed.js tests/sync-hooks.test.js
git commit -m "feat: wire hook deployment into sync.js"
```

---

## Task 11: Report hook counts in `status.js`

**Files:**
- Modify: `tools/sync/status.js`
- Test: `tests/sync-hooks.test.js` (append)

**Interfaces:**
- Consumes: `hooksState.readUserHooksState(homeDir)` (Task 6).
- Produces: `status.run(opts)` result now includes `projectHooksDeployed: number` and `userHooksDeployed: number`.

- [ ] **Step 1: Write the failing test**

Append to `tests/sync-hooks.test.js`:

```javascript
test('status.run reports project and user hook counts', () => {
  const cache = makeCacheRepo();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-project-'));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-hooks-sync-home-'));
  installSkill(project);
  syncCli.run(baseOpts(project, cache, homeDir));

  const statusCli = require('../tools/sync/status');
  const result = statusCli.run({ project, cacheDir: cache, homeDir });
  assert.strictEqual(result.projectHooksDeployed, 1);
  assert.strictEqual(result.userHooksDeployed, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sync-hooks.test.js`
Expected: FAIL — `result.projectHooksDeployed` is `undefined`

- [ ] **Step 3: Update `status.js`**

Replace the full contents of `tools/sync/status.js` with:

```javascript
#!/usr/bin/env node
const fs = require('node:fs');
const paths = require('./lib/paths');
const state = require('./lib/state');
const git = require('./lib/git');
const hooksState = require('./lib/hooks-state');

function parseArgs(argv) {
  let project = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') project = argv[++i];
  }
  return { project };
}

function run({ project, cacheDir, homeDir } = {}) {
  const projectRoot = paths.getProjectRoot(project);
  const cache = cacheDir || paths.getCacheDir();
  const home = homeDir || require('node:os').homedir();
  const s = state.readState(projectRoot);
  const userHooksState = hooksState.readUserHooksState(home);
  const cacheDirty = fs.existsSync(cache) ? git.isDirty(cache) : null;

  return {
    project: projectRoot,
    cacheDir: cache,
    cacheDirty,
    ...s,
    projectHooksDeployed: Object.keys(s.deployedHooks || {}).length,
    userHooksDeployed: Object.keys(userHooksState.deployedHooks || {}).length,
  };
}

if (require.main === module) {
  console.log(JSON.stringify(run(parseArgs(process.argv.slice(2))), null, 2));
}

module.exports = { run, parseArgs };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sync-hooks.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full existing suite to confirm no regressions**

Run: `node --test tests/*.test.js`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add tools/sync/status.js tests/sync-hooks.test.js
git commit -m "feat: report hook counts in status.js"
```

---

## Task 12: End-to-end coverage in `tests/e2e.test.js`

**Files:**
- Modify: `tests/e2e.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1–10 (exercised transitively through `syncCli.run`).
- Produces: no new exports; extends the existing end-to-end test with hooks assertions inside the same legacy-project / prune / export flow already covered.

- [ ] **Step 1: Extend the existing end-to-end test**

In `tests/e2e.test.js`, insert the following block immediately after the existing line `assert.match(gitignoreContent, /myrules-backup/);` (still before the `syncCli.run({ ...opts, dryRun: true, prune: true });` line):

```javascript
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'hooks', 'myrules-session-start-context.js')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'hooks.json')));
  assert.ok(fs.existsSync(path.join(project, '.claude', 'rules', 'myrules-hook-session-start-context.md')));
  assert.ok(fs.existsSync(path.join(opts.homeDir, '.cursor', 'hooks', 'myrules-session-log.js')));

  const hooksConfig = JSON.parse(fs.readFileSync(path.join(project, '.cursor', 'hooks.json'), 'utf8'));
  assert.deepStrictEqual(hooksConfig.hooks.sessionStart, [
    { command: 'node .cursor/hooks/myrules-session-start-context.js' },
  ]);
  assert.match(gitignoreContent, /\.cursor\/hooks\/myrules-\*/);
```

Then, at the very end of the test (after the existing `exportLib.exportProject` assertion), append:

```javascript

  fs.rmSync(path.join(cache, 'hooks', 'project', 'session-start-context.js'));
  syncCli.run(opts);

  assert.strictEqual(
    fs.existsSync(path.join(project, '.cursor', 'hooks', 'myrules-session-start-context.js')),
    false
  );
  const hooksConfigAfterRemoval = JSON.parse(fs.readFileSync(path.join(project, '.cursor', 'hooks.json'), 'utf8'));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(hooksConfigAfterRemoval.hooks, 'sessionStart'), false);
```

- [ ] **Step 2: Run test to verify it fails first, if applied out of order**

Run: `node --test tests/e2e.test.js`
Expected: PASS immediately, since Tasks 1–10 are already implemented by this point in the plan. (If you are validating this step in isolation before those tasks exist, it will FAIL with missing files — that confirms the assertions are meaningful.)

- [ ] **Step 3: Run the full existing suite to confirm no regressions**

Run: `node --test tests/*.test.js`
Expected: PASS (all tests)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e.test.js
git commit -m "test: extend end-to-end coverage with hooks deploy and stale cleanup"
```

---

## Task 13: Manual verification (post-implementation, not automated)

No automated test can confirm Cursor itself invokes a deployed hook at the right time — `node --test` only verifies that MyRules generates a correct `hooks.json` and correct scripts. Perform this once after Task 12 is complete and merged.

- [ ] **Step 1: Sync a real test project**

In a scratch project directory (not this repo), run the same two commands a user would:

```bash
node "<path-to-this-repo>/tools/sync/install-skill.js" --project "<scratch-project>"
node "<path-to-this-repo>/tools/sync/sync.js" --project "<scratch-project>"
```

Confirm `.cursor/hooks.json` and `.cursor/hooks/myrules-session-start-context.js` now exist in `<scratch-project>`, and `~/.cursor/hooks.json` plus `~/.cursor/hooks/myrules-session-log.js` exist under the real home directory.

- [ ] **Step 2: Verify `sessionStart` context injection**

Create `<scratch-project>/.myrules-context.md` with some placeholder text (e.g. `# Status\n\nTesting MyRules hooks.`). Open `<scratch-project>` in Cursor and start a new Agent session. Open **Customize → Hooks** (or the Hooks output channel) and confirm the `session-start-context` hook ran without error, and that the injected content is visible to the agent.

- [ ] **Step 3: Verify `sessionEnd` logging**

End that Cursor session. Check `~/myrules-activity-log.md` (real home directory) for a new line containing the scratch project's folder name, a duration in milliseconds, and a status.

- [ ] **Step 4: Confirm no errors in the Hooks output channel**

Re-open the Hooks output channel and confirm there are no error entries for either `myrules-session-start-context.js` or `myrules-session-log.js`.

If any step fails, capture the exact error text from the Hooks output channel before making further changes — that error message is the source of truth for what to fix next (do not guess).
