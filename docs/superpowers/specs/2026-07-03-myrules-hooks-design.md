# MyRules Hooks Design Spec

**Date:** 2026-07-03 (revised 2026-07-25)
**Status:** Draft for review
**Scope:** v1 — add a new **hooks** content type to MyRules (extends `docs/superpowers/specs/2026-07-02-myrules-design.md`; does not modify it)

## Revision Note (2026-07-25)

Post-implementation review of Claude Code v2.1.179 (binary string extraction) confirmed that Claude Code has a full native hooks mechanism via `settings.json` under the `hooks` key, with event names, I/O schemas, and execution semantics that parallel Cursor's but differ in detail (see [Platform Verification - Claude Code](#platform-verification---claude-code)). The original spec described Claude-side hooks as prose-only with no automatic execution — this was a conservative v1 decision, not a permanent limitation. This revision documents the native mechanism and outlines a future implementation plan (see [Future: Claude Native Hooks](#future-claude-native-hooks)), without changing the current v1 behavior (prose-only Claude-side hooks remain the default).

## Summary

MyRules gains a second content type alongside `rules/`: **hooks** — conventions for the agent to read or write specific files at specific moments in a session. On Cursor, a hook is deployed as real automation: an entry in `hooks.json` plus a small standalone Node script that Cursor executes automatically at the declared lifecycle event. On Claude Code, the same convention is currently deployed as a plain-language rule document (Claude follows it because the rule is loaded as context, not because of any technical trigger). Claude Code **does** have its own native hooks mechanism (`settings.json` under the `hooks` key), and a future revision of MyRules will wire hooks into it for automatic execution on both platforms — see [Future: Claude Native Hooks](#future-claude-native-hooks). Hooks are authored once in `~/.myrules/hooks/` and synced the same way rules are: gitignored generated artifacts in consumer projects, source of truth in the cache repo.

Hooks support two scopes — **project** (this repo only) and **user** (every project on this machine) — mirroring `rules/user/` vs `rules/project/`. Unlike rules, this split maps to a *real* mechanism on the Cursor side: Cursor natively supports a global `~/.cursor/hooks.json`, so a user-scoped hook genuinely deploys once and applies everywhere, with no per-project workaround needed.

## Goals

1. Let the user define "at moment X, read/write file Y" conventions once, synced across devices via the existing MyRules cache/push/pull flow.
2. Cursor: real automatic execution via `hooks.json` + a Node script per hook.
3. Claude Code (v1): the same convention expressed as prose in a rule file; no automatic execution. **Future**: wire into Claude Code's native `settings.json` hooks for automatic execution (see [Future: Claude Native Hooks](#future-claude-native-hooks)).
4. Support both project-scoped and user-scoped hooks.
5. Deploy artifacts are gitignored by default, consistent with how rules are already treated — source lives in `~/.myrules/hooks/`, the project copy is a regenerable build output.

## Non-Goals (v1)

- Gating/blocking hook types (permission allow/deny — e.g. `beforeShellExecution`, `preToolUse`). v1 hooks only read/write files and inject context; they never approve or deny an agent action.
- Prompt-type (LLM-evaluated) Cursor hooks.
- Any automatic execution on the Claude side in **v1** (rules-doc convention only). Native hooks deployment is planned for a future revision (see [Future: Claude Native Hooks](#future-claude-native-hooks)).
- Reverse-export / hybrid-edit merge for the generated Claude-side prose file (one-way generation only).
- Team/Enterprise hook distribution — MyRules remains a personal, single-user tool.
- Codex support (unchanged from the main MyRules scope).

## Platform Verification (2026-07-03)

Verified against Cursor's official hooks documentation (`cursor.com/docs/hooks`, `cursor.com/docs/reference/third-party-hooks`):

| Mechanism | Detail |
|---|---|
| Config file | `hooks.json` — project: `<project>/.cursor/hooks.json`; user (global, machine-wide): `~/.cursor/hooks.json` |
| Format | `{"version": 1, "hooks": {"<eventName>": [{"command": ..., "matcher"?, "timeout"?, "failClosed"?}]}}` — value per event is an **array**, so multiple hooks per event coexist naturally |
| `command` field | Documented as "a shell string, an absolute path, or a relative path" — a plain string like `node .cursor/hooks/foo.js` is valid. This avoids any shebang/`chmod +x` dependency and keeps hook scripts Node-only, consistent with the rest of MyRules' toolchain and with Windows (no bash required). |
| Working directory | Project hooks run from the **project root**; user hooks run from `~/.cursor/` |
| Script I/O contract | Spawned as a child process; the hook's event JSON arrives on stdin, the script prints JSON on stdout, exit code `0`/other. The script is a real OS process and can perform **any file I/O** as a side effect — this is independent of whatever it returns in the structured JSON output. |
| Merge across sources | Enterprise → Team → Project → User; all matching hooks from every source execute. No conflict to resolve for array membership — only structured *decisions* (e.g. permission allow/deny) are priority-resolved, which v1 hooks never return. |
| Relevant events for v1 | `sessionStart` (input: `session_id`, `composer_mode`; output: `additional_context`, `env`) and `sessionEnd` (input: `reason`, `duration_ms`, `final_status`; fire-and-forget, output ignored) |
| Env vars available to scripts | `CURSOR_PROJECT_DIR` (workspace root, always present), `CURSOR_VERSION`, etc. |
| Windows compatibility | Confirmed no shebang/chmod needed; `"command": "node <path>"` is parsed as a shell string and runs identically on Windows/macOS/Linux. |

Claude Code also has its own native hook mechanism (`settings.json` under the `hooks` key). See [Platform Verification - Claude Code](#platform-verification---claude-code) below for the full I/O contract. MyRules does **not** use it in v1 (prose-only convention); a future revision will wire into it - see [Future: Claude Native Hooks](#future-claude-native-hooks).

## Platform Verification - Claude Code (2026-07-25)

Verified by binary string extraction of Claude Code v2.1.179 (`claude.exe`); cross-checked against live session context (`~/.claude/rules/*.md` confirmed loaded as "user's private global instructions").

### Native hooks mechanism

| Mechanism | Detail |
|---|---|
| Config file | `settings.json` - project: `<project>/.claude/settings.json`; user (global): `~/.claude/settings.json`. **Shared file** - also holds `env`, `permissions`, `includeCoAuthoredBy`, etc. (unlike Cursor's dedicated `hooks.json`) |
| Config format | `{"hooks": {"<EventName>": [{"matcher": "...?", "hooks": [{"type": "command", "command": "node /path/to/script.js", "timeout": 30?}]}]}}` - note the **extra nesting level** vs Cursor: each event maps to an array of `{matcher, hooks}` objects, each of which contains a `hooks` array of command entries |
| `type` field | `"command"` required (discriminated union - other types: `prompt`, `agent`, `http`, `mcpTool`) |
| `command` field | Shell string, same as Cursor - `"node /path/to/script.js"` works identically |
| Script I/O contract | Same as Cursor: JSON on stdin, JSON on stdout, exit code 0/other. Script is a real OS process with full file I/O. |
| Working directory | Resolved from `input.cwd` in the hook input JSON (not an env var like Cursor's `CURSOR_PROJECT_DIR`) |

### Hook events (Claude Code)

Full event list extracted from the binary:

```
PreToolUse, PostToolUse, PostToolUseFailure, PostToolBatch,
Notification, UserPromptSubmit, UserPromptExpansion,
SessionStart, SessionEnd, Stop, StopFailure,
SubagentStart, SubagentStop, PreCompact, PostCompact,
PermissionRequest, PermissionDenied, Setup,
TeammateIdle, TaskCreated, TaskCompleted,
Elicitation, ElicitationResult,
ConfigChange, WorktreeCreate, WorktreeRemove,
InstructionsLoaded, CwdChanged, FileChanged, MessageDisplay
```

**Event name casing**: Claude Code uses PascalCase (`SessionStart`, `SessionEnd`); Cursor uses lowerCamelCase (`sessionStart`, `sessionEnd`).

### Hook input schema

Base input (all events include these fields):

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "agent_id": "optional, present only in subagent calls",
  "agent_type": "optional, e.g. 'general-purpose'",
  "hook_event_name": "SessionStart"
}
```

Event-specific fields:

| Event | Extra input fields |
|---|---|
| `SessionStart` | `source` (`"startup"` \| `"resume"` \| `"clear"` \| `"compact"`), `model`, `session_title` |
| `SessionEnd` | `reason` (string) - **no `duration_ms`** (unlike Cursor) |
| `PreToolUse` | `tool_name`, `tool_input`, `tool_use_id` |
| `PostToolUse` | `tool_name`, `tool_input`, `tool_response`, `tool_use_id`, `duration_ms` |

### Hook output schema

| Event | Output fields |
|---|---|
| `SessionStart` | `hookEventName: "SessionStart"`, `additionalContext` (string, optional), `sessionTitle` (optional), `reloadSkills` (boolean, optional), `watchPaths` (array, optional) |
| `SessionEnd` | Fire-and-forget (output ignored, same as Cursor) |
| `PreToolUse` | `hookEventName: "PreToolUse"`, `permissionDecision` (optional), `updatedInput` (optional), `additionalContext` (optional) |

**Key field naming difference**: Claude Code uses `additionalContext` (camelCase); Cursor uses `additional_context` (snake_case).

### Key differences from Cursor hooks

| Dimension | Cursor | Claude Code |
|---|---|---|
| Event names | lowerCamelCase (`sessionStart`) | PascalCase (`SessionStart`) |
| Config file | `hooks.json` (dedicated) | `settings.json` (shared with env/permissions/etc.) |
| Config structure | Flat: `{command: "..."}` per event | Nested: `{matcher: "...", hooks: [{type: "command", command: "..."}]}` |
| Project root in input | `CURSOR_PROJECT_DIR` env var + `workspace_roots[0]` | `cwd` field in input JSON |
| Context injection output | `additional_context` (snake_case) | `additionalContext` (camelCase) + `hookEventName` field required |
| SessionEnd input | Has `duration_ms` | No `duration_ms` |
| Config merge complexity | Low (dedicated file, only hooks) | Higher (shared file, must preserve non-hooks fields) |

## Architecture

```
~/.myrules/hooks/                          ← source of truth (synced like rules/)
├── user/session-log.js                    ← deploys once per machine
└── project/session-start-context.js       ← deploys once per project

        │ tools/sync/ (sync.js)
        ▼
┌────────────────────────────────────┬──────────────────────────────────────┐
│ Cursor (real automation)            │ Claude Code                          │
│ ~/.cursor/hooks.json (user)         │ v1: ~/.claude/rules/myrules-hook-*.md│
│ ~/.cursor/hooks/myrules-*.js        │      (prose only, no auto-exec)      │
│ <project>/.cursor/hooks.json        │ v1: <project>/.claude/rules/         │
│ <project>/.cursor/hooks/myrules-*.js│      myrules-hook-*.md (project)     │
│                                     │ Future: ~/.claude/settings.json      │
│                                     │   hooks key (native auto-exec)       │
│                                     │ Future: <project>/.claude/           │
│                                     │   settings.json hooks key            │
└────────────────────────────────────┴──────────────────────────────────────┘
```

## Repository Layout Additions

```
MyRules/
├── hooks/
│   ├── user/
│   │   └── session-log.js
│   └── project/
│       └── session-start-context.js
├── tools/sync/lib/
│   ├── hooks.js                  # scan hooks/{user,project}/*.js, load {meta, handle}
│   ├── hooks-deploy-cursor.js    # hooks.json merge, script write, stale cleanup
│   ├── hooks-deploy-claude.js    # prose rule generation
│   ├── hooks-state.js            # read/write ~/.myrules/.user-hooks-state.json
│   └── drift.js                  # NEW shared helper, extracted from deploy.js
```

## Neutral Format (`hooks/`)

### Principles

- One hook per file, same "one topic per file" principle as `rules/`.
- Each file is a complete, standalone, directly-runnable Node script (chosen approach — see Decision Log): it can be executed directly (`node hooks/project/foo.js < input.json`) for manual testing, and also exports `{ meta, handle }` for deploy-time introspection and unit testing.
- No hardcoded whitelist of valid `meta.event` values — any non-empty string is accepted, so new Cursor hook events work without a MyRules code change.
- `meta.description` is required and is used verbatim as the Claude-side prose body.

### Hook file contract

```js
module.exports.meta = {
  event: 'sessionStart',       // required: Cursor hook event name
  matcher: undefined,          // optional: only meaningful for events that support matchers
  timeout: undefined,          // optional: seconds
  failClosed: false,           // optional: default false — v1 hooks never gate/block an action
  description: '...',          // required: plain-language convention text, feeds the Claude rule
};

module.exports.handle = function handle(input) {
  // Given the hook's input JSON, perform any file I/O side effects and
  // return the JSON object Cursor expects back (or {} if there's nothing to return).
};

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      console.log(JSON.stringify(handle(JSON.parse(raw || '{}'))));
    } catch (err) {
      console.error(err.message);
      console.log('{}'); // always emit valid JSON, never leave Cursor hanging or blocked
    }
  });
}

module.exports = { meta, handle };
```

This mirrors the existing `parseArgs` / `run` / `if (require.main === module)` idiom already used by every file in `tools/sync/*.js`.

### Categories

| Directory | Deploy target (Cursor) | Deploy target (Claude) | Scope |
|---|---|---|---|
| `hooks/user/` | `~/.cursor/hooks.json` + `~/.cursor/hooks/myrules-<name>.js` | `~/.claude/rules/myrules-hook-<name>.md` | Every project on this machine |
| `hooks/project/` | `<project>/.cursor/hooks.json` + `<project>/.cursor/hooks/myrules-<name>.js` | `<project>/.claude/rules/myrules-hook-<name>.md` | This project only |

Unlike rules (where Cursor has no file-backed global mechanism and "user" rules had to be faked as always-apply project rules, requiring a `user-` filename infix to disambiguate), Cursor hooks have a genuinely separate global location. Directory alone disambiguates scope, so **no `user-` infix is needed in the Cursor-side hook script filename**. The same `<name>` may be reused independently in both `hooks/user/` and `hooks/project/` with no collision, since they deploy to different directories.

## Deploy Mapping — Cursor

### `hooks.json` merge algorithm

`hooks.json` is a shared file that may contain hooks unrelated to MyRules (hand-written by the user, or from another tool). Sync must merge, never overwrite wholesale:

1. Load existing `hooks.json` as-is (preserving its `version` field and any keys MyRules doesn't recognize, untouched), or start from `{version: 1, hooks: {}}` only when the file doesn't exist yet.
2. Read the prior deploy record (exact `command` strings previously written by MyRules, per event) from state — `.myrules-sync-state.json` for project scope, `~/.myrules/.user-hooks-state.json` for user scope.
3. For every event previously touched by MyRules, remove exactly the previously-recorded command entries from that event's array. All other entries in that array (and every other event) are left untouched.
   - **First-ever sync** (no prior state recorded yet): fall back to filtering out any entry whose `command` contains `myrules-`, as a safety net against a stray leftover from a prior manual test.
4. For every hook currently defined in the relevant source directory, append a fresh entry — `{ command: "node <path>/myrules-<name>.js", matcher?, timeout?, failClosed? }` (optional keys omitted when unset) — to that event's array, creating the event key if it doesn't exist yet.
5. If an event's array is empty after steps 3–4, delete that event key (keeps the file readable).
6. Write back with `JSON.stringify(obj, null, 2)`. **The `hooks.json` file itself is never deleted**, even if it ends up as `{"version":1,"hooks":{}}` — we can't be sure nothing else will ever write to it.

Command paths always use forward slashes (`.cursor/hooks/myrules-foo.js`), regardless of OS, for deterministic and testable output — each machine regenerates its own local `hooks.json` on sync, so there's no cross-machine path-format sharing to worry about (the file is gitignored — see below).

### Script deploy, drift, and stale cleanup

- Writing each hook's script file goes through a shared `drift.js` helper (extracted from the existing `deploy.js` hash-compare logic): if the target already exists with content that doesn't match the hash recorded at last deploy, it's been hand-edited — skip and report it, same as rules (`--force` overrides).
- **Stale cleanup runs on every plain `sync`, with no opt-in flag required** (this is different from legacy-rule pruning, which needs `--prune-legacy-rules`): if a hook that MyRules previously deployed no longer exists in the current source, its script file and `hooks.json` entry are removed automatically. This is safe without an opt-in gate because it only ever touches artifacts MyRules itself created and precisely tracked — never a foreign file. This is intentionally more thorough than the existing `skills.js`, which does not clean up a skill removed from `skills-manifest.js`; a stale hook is worse to leave behind than a stale skill clone, since a stale hook keeps actively executing on every session.
- All cleanup targets — the Cursor script path, the `hooks.json` entry, and the Claude prose file path — are **derived from the hook's name alone** using the fixed naming convention (`myrules-<name>.js`, `myrules-hook-<name>.md`). The state file only needs to remember *which hook names* were deployed last time (see Sync State Changes, below); it does not need a separate record per platform.

### New path helpers (`paths.js`)

`getCursorProjectHooksDir/Config(projectRoot)`, `getCursorUserHooksDir/Config(homeDir)`. These paths are Cursor's own fixed convention, not a MyRules choice, so they're hardcoded here rather than added as configurable-but-unread `manifest.js` fields (matching the existing rule "every manifest field is actually read at runtime").

## Deploy Mapping — Claude

One generated prose file per hook, in the same directories already used for rules:

- Project: `<project>/.claude/rules/myrules-hook-<name>.md`
- User: `~/.claude/rules/myrules-hook-<name>.md`

The `hook-` infix (new `manifest.claude.hookInfix` field) distinguishes these from regular `myrules-<topic>.md` rule files, so a later reverse-export pass can always tell which source directory (`rules/` vs `hooks/`) a deployed file came from, purely from its filename.

Body template:

```markdown
## Hook: <name>

**Trigger (Cursor event):** <meta.event>

**Convention:** <meta.description>

(This is a MyRules hook convention. Claude has no automatic trigger for this —
perform this action manually at the described moment.)
```

Drift-detected via the same shared `drift.js` helper as everything else — a hand-edited copy is skipped and reported, not clobbered. **One-way generation only**: there is no reverse-export/merge path for this file, since it's prose with no structured field to parse edits back into. To change a hook's behavior or description, edit `meta.description` / `handle` in the source `.js` file and re-sync.

## Example Hooks (v1 seed content)

### `hooks/project/session-start-context.js`

```js
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

`.myrules-context.md` is a plain file the user writes by hand in each project — not a MyRules deploy artifact, not gitignored by MyRules, not tracked in the protect list (MyRules never writes to it, only this hook reads it). Renaming it is a one-line edit to this file's own source, since it's the user's personal hook.

### `hooks/user/session-log.js`

```js
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

module.exports.meta = {
  event: 'sessionEnd',
  description:
    'Whenever any session ends, in any project on this machine, append a one-line ' +
    'entry (timestamp, project, duration, status) to ~/myrules-activity-log.md.',
};

module.exports.handle = function handle(input) {
  const project = path.basename(input.workspace_roots?.[0] || process.cwd());
  const line = `- ${new Date().toISOString()} | ${project} | ${input.duration_ms}ms | ${input.reason}\n`;
  fs.appendFileSync(path.join(os.homedir(), 'myrules-activity-log.md'), line);
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

`sessionEnd` is fire-and-forget (Cursor ignores its output), so the meaningful work is the `appendFileSync` side effect, not the returned `{}`.

## `manifest.js` Changes

```js
claude: {
  userRulesDir: "~/.claude/rules",
  projectRulesDir: ".claude/rules",
  extension: ".md",
  hookInfix: "hook-",   // NEW — distinguishes myrules-hook-<name>.md from myrules-<topic>.md
},
```

No other manifest changes. `managedPrefix` ("myrules-") already applies directly to hook script filenames with no new field needed.

## Sync State Changes

### Per-project `.myrules-sync-state.json` (new field)

`deployedHooks` lists only **project-scoped** hooks (everything from `hooks/project/`) that were deployed into this specific project — user-scoped hooks are never recorded here, since they aren't this project's responsibility.

```json
{
  "deployedHooks": {
    "session-start-context": {
      "event": "sessionStart",
      "command": "node .cursor/hooks/myrules-session-start-context.js"
    }
  }
}
```

The `command` field is stored purely so the merge algorithm's exact-match removal (step 3, above) doesn't need to reconstruct it from scratch; the script and Claude prose file paths are derived from the key (`session-start-context`) using the fixed naming convention. `deployedHashes` (already exists) is reused unchanged — both the Cursor script file and the Claude prose file are tracked in it, keyed by path relative to the project root, exactly like rule files today.

### New global `~/.myrules/.user-hooks-state.json`

Same shape as above (`deployedHooks` + `deployedHashes`), but scoped to `hooks/user/` only. This follows the existing `~/.myrules/.registry.json` precedent of a small, dedicated, machine-global JSON file rather than overloading any per-project state file.

## Sync Engine Wiring

- **Project-level hooks** deploy inside `syncOne()`, alongside the existing `deploy.deployRules()` call — once per project, including once per project under `--all`.
- **User-level hooks** deploy inside `run()`, alongside the existing `skills.syncSkills()` call — once per invocation, regardless of `--all` or a single `--project`, since the target (`~/.cursor/hooks.json`) is machine-global, not project-specific.

No new CLI commands. Hooks ride entirely on the existing `sync` / `init` / `status` / `export` commands. `status.js` gains a minor addition reporting hook counts (e.g. `hooksDeployed: { project: 1, user: 1 }`) for a quick sanity check that sync picked them up.

## `.gitignore`

Extend the existing MyRules marker block with one line:

```gitignore
.cursor/hooks/myrules-*
```

**`hooks.json` itself is intentionally not gitignored.** Unlike a `myrules-*.mdc` rule file (100% MyRules-owned, safe to blanket-ignore), `hooks.json` is a single shared file that may contain the user's own non-MyRules entries — gitignoring the whole file would silently stop tracking those too. Only the MyRules-owned script files under `.cursor/hooks/` are ignored.

## Error Handling

| Condition | Behavior |
|---|---|
| No hooks defined anywhere in source | No-op: does not create `hooks.json` if absent; does not touch it if present; at most a one-line log, no error |
| `hooks.json` exists with foreign entries | Only MyRules-tagged entries (per state-recorded commands, or the `myrules-` substring fallback on the very first sync) are touched; everything else in the file is preserved byte-for-byte in structure |
| `hooks.json` contains malformed JSON | Abort with a clear parse-error message; never overwrite a file we can't safely parse |
| Hook script or Claude prose file hand-edited locally | Skip + report (drift), same as rules; `--force` overwrites |
| Hook removed from source | Next sync deletes its script file, its `hooks.json` entry, and its Claude prose file — no opt-in flag needed (see stale cleanup, above) |
| Hook's `handle()` throws at runtime inside Cursor | Caught inside the deployed script itself; prints `{}`, logs to stderr, exits 0 — never blocks the agent loop |
| `meta.event` or `meta.description` missing from a hook source file | Sync aborts deployment of that specific hook with a clear "malformed hook source" error at sync time (fail loud when authoring, not silently at runtime inside Cursor) |

## Testing

1. **`handle()` unit tests** for both seed hooks: call the exported function directly with a mock input object; assert the returned object and assert file I/O side effects against a temp directory. No stdin/stdout plumbing needed for these tests.
2. **`hooks.json` merge tests**: fixture with pre-existing foreign entries (unrelated event, and a foreign entry on an event MyRules also manages) → assert only MyRules-tagged entries are added/updated/removed; foreign entries are untouched.
3. **Stale cleanup test**: sync with two hooks defined, then remove one from the source cache and sync again → assert its script file, `hooks.json` entry, and Claude prose file are all gone.
4. **Drift test**: hand-edit a deployed hook script (or Claude prose file), sync again → assert it's skipped and reported, not overwritten, unless `--force`.
5. **End-to-end**: fresh project + fixture cache with both seed hooks → `sync` → assert `.cursor/hooks.json`, `.cursor/hooks/myrules-*.js`, `.claude/rules/myrules-hook-*.md`, `.gitignore`, and both state files (project + global) all match expectations.
6. **User-scope isolation test**: two different fixture "projects" synced against the same cache → assert the user-level hook deploys once to the shared global location and both projects' state correctly reflects project-level hooks independently.

### Manual verification (cannot be automated)

No automated test can confirm Cursor itself calls a deployed hook at the right time — `node --test` can only verify that MyRules generates a correct `hooks.json` and correct scripts. After implementation, manually verify once:

1. Sync a real test project with both seed hooks active.
2. Create `.myrules-context.md` in that project, open it in Cursor, start a new Agent session → confirm its content appears as injected context (check the Hooks output channel / **Customize → Hooks** tab for confirmation and any errors).
3. End that session → confirm a new line appended to `~/myrules-activity-log.md`.

## Known Limitations

1. Claude-side hook prose is generated one-way; hand-editing it is detected (drift) but there's no merge-back path — edit the `.js` source instead.
2. `matcher`/`timeout`/`failClosed` are supported in the hook file contract but unused by both v1 seed hooks; they exist so future hooks (e.g. an audit hook scoped to specific tools) don't require a schema change.
3. The first-sync fallback filter (matching `myrules-` in a command string, used only when no prior state exists yet) could theoretically remove a coincidentally-named foreign entry; considered acceptable given how narrow the window is (once state exists, exact-match removal takes over).
4. No Cursor-side hook can currently be verified by automated tests — see Manual Verification, above.

## Future: Claude Native Hooks

**Status:** Planned, not yet implemented. This section documents what needs to change when MyRules wires hooks into Claude Code's native `settings.json` mechanism.

### What changes

1. **New deployer**: `hooks-deploy-claude.js` gains a second mode that writes to `settings.json` (in addition to generating the prose `.md` file, which remains as a fallback for environments where native hooks are unavailable or disabled).

2. **`settings.json` merge algorithm**: Similar to the `hooks.json` merge for Cursor, but more complex because `settings.json` is a shared file holding `env`, `permissions`, `includeCoAuthoredBy`, and other non-hooks fields. The merge must:
   - Load existing `settings.json` and preserve all non-`hooks` keys untouched.
   - Within the `hooks` key, apply the same remove-then-add strategy as `hooks.json`: remove entries whose `command` matches previously-deployed MyRules commands, then append fresh entries for current hooks.
   - Never delete the `settings.json` file itself, even if it ends up with an empty `hooks` object.

3. **Config structure adaptation**: Claude Code's hooks config has an extra nesting level vs Cursor:
   ```json
   {
     "hooks": {
       "SessionStart": [
         {
           "matcher": null,
           "hooks": [
             { "type": "command", "command": "node .claude/hooks/myrules-session-start-context.js" }
           ]
         }
       ]
     }
   }
   ```
   Each event maps to an array of `{matcher, hooks}` objects; `matcher` is omitted or null for non-tool events like `SessionStart`.

4. **Event name mapping**: `meta.event` in hook source files uses Cursor's lowerCamelCase (`sessionStart`). The deployer must map to Claude Code's PascalCase (`SessionStart`) when writing to `settings.json`. Mapping table:
   - `sessionStart` -> `SessionStart`
   - `sessionEnd` -> `SessionEnd`
   - Future hooks using tool-based events (`preToolUse`, `postToolUse`) would map to `PreToolUse`, `PostToolUse`, etc.

5. **Hook script I/O adaptation**: The deployed Node scripts must handle both platforms' I/O contracts. Two approaches:
   - **Option A (preferred)**: Scripts detect the platform from the input JSON. If `input.cwd` is present and `CURSOR_PROJECT_DIR` is absent, it's Claude Code; adapt output field names accordingly (`additionalContext` vs `additional_context`).
   - **Option B**: Deployer generates a thin platform-specific wrapper that calls the shared `handle()` function and translates the output.

6. **Script deploy paths**:
   - Project: `<project>/.claude/hooks/myrules-<name>.js`
   - User: `~/.claude/hooks/myrules-<name>.js`
   - Add `.claude/hooks/myrules-*` to the gitignore marker block.

7. **State tracking**: `deployedHooks` in sync state gains a `claudeCommand` field alongside the existing `command` (Cursor), so the merge algorithm can remove the correct entries from each file independently.

### Seed hook adaptations

**`session-start-context.js`**:
- Input: fall back to `input.cwd` when `CURSOR_PROJECT_DIR` / `workspace_roots` are absent.
- Output: return `{ hookEventName: "SessionStart", additionalContext: content }` when running under Claude Code; `{ additional_context: content }` under Cursor.

**`session-log.js`**:
- Input: `input.duration_ms` is absent in Claude Code's `SessionEnd`; omit it from the log line (or log `0`).
- Output: `{}` is fine for both platforms (fire-and-forget).

### Testing additions

- `settings.json` merge test: fixture with pre-existing `env` and `permissions` keys -> assert only the `hooks` key is modified; all other keys preserved.
- Event name mapping test: `sessionStart` -> `SessionStart` in generated `settings.json`.
- I/O adaptation test: call `handle()` with a Claude Code-shaped input (`cwd` instead of `workspace_roots`) -> assert output uses `additionalContext` (camelCase).
- End-to-end: sync -> assert `.claude/settings.json` has hooks entry, `.claude/hooks/myrules-*.js` exists, and `~/.claude/settings.json` has user-level hooks entry.

### What does NOT change

- Hook source files (`hooks/user/*.js`, `hooks/project/*.js`) stay as-is; platform adaptation happens at deploy time or inside `handle()`.
- The prose `.md` file continues to be generated (as documentation and fallback).
- Cursor-side deployment is completely unaffected.
- Drift detection, stale cleanup, and state management reuse the same `drift.js` helper and state file structure.

## Decision Log

| Decision | Choice | Rationale |
|---|---|---|
| Hook authoring format | One standalone, directly-runnable `.js` file per hook, exporting `{meta, handle}` | Matches the existing `tools/sync/*.js` idiom exactly (`require.main === module` pattern already used everywhere); simplest possible deploy (plain file copy); each hook fully self-contained and unit-testable via a direct function call |
| Rejected: shared-runtime + split logic file | Not chosen | Saves ~10 lines of boilerplate per hook but adds an extra file and an extra layer of indirection for comparatively little benefit |
| Rejected: declarative-only hook "kinds" | Not chosen | Doesn't require writing JS for pre-built kinds, but every new use case needs a new built-in kind implemented in MyRules itself — poor fit for an open-ended personal convention system |
| Scope split | Both `hooks/user/` (deploys once, machine-global) and `hooks/project/` (deploys per-project) | Cursor natively supports a real global hooks file, unlike rules — worth taking advantage of rather than forcing everything to project scope |
| Cursor-side naming | `myrules-<name>.js`, no `user-`/project infix needed | Directory alone (`.cursor/hooks/` vs `~/.cursor/hooks/`) already disambiguates scope; unlike rules, Cursor doesn't conflate user+project hooks into one directory |
| Claude-side naming | `myrules-hook-<name>.md` (new `hook-` infix) | Keeps hook-derived files distinguishable from regular `myrules-<topic>.md` rule files sharing the same directory |
| `hooks.json` gitignore | File itself not ignored; only `.cursor/hooks/myrules-*.js` scripts are | `hooks.json` may hold the user's own non-MyRules entries; blanket-ignoring it would silently stop tracking those |
| Stale hook cleanup | Runs automatically on every `sync`, no opt-in flag | Only ever touches MyRules's own previously-tracked artifacts (unlike legacy-rule prune, which handles foreign files and needs explicit confirmation); a stale hook actively executes, unlike a stale skill clone or unused rule file, so leaving it behind is a worse default than for `skills.js` |
| Claude automation (v1) | None - prose-only rule document, no `settings.json` hooks management | Conservative v1 decision. Claude Code v2.1.179 confirmed to have full native hooks via `settings.json` (see [Platform Verification - Claude Code](#platform-verification---claude-code)). Future revision will wire into it - see [Future: Claude Native Hooks](#future-claude-native-hooks) |
| v1 seed hooks | `session-start-context` (project) + `session-log` (user) | Directly matches the two concrete use cases identified during brainstorming; both are pure read/write, no gating, exercising both scope levels |
| Hook event whitelist | None — any non-empty string accepted for `meta.event` | Cursor's hook event list may grow; hardcoding a whitelist would require a MyRules update to use a new Cursor event for no real safety benefit |

## Next Step

Spec ready for review. On approval, invoke `writing-plans` to produce an implementation plan (new lib modules, manifest/state changes, seed hooks, and the full test suite described above).
