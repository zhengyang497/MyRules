# One-Shot Bootstrap Design

**Date:** 2026-07-03  
**Status:** Superseded (2026-07-03) — replaced by `install-skill.js` (step 1) then `sync.js` (step 2; absorbs former `init.js`). See `skills/myrules/SKILL.md` and `README.md`.  
**Scope:** Let a user say one sentence to Agent and have MyRules fully set up (cache + project skill + rules deploy)

## Problem

Today the user must mentally sequence:

1. Copy `skills/myrules/` into `.cursor/skills/myrules/` (manual or ad-hoc Agent file copy)
2. `git clone` → `~/.myrules/` (if missing)
3. `init.js` → rules deploy

Steps 1–2 are **not implemented** in the toolchain. The Agent cannot rely on `init` / `sync` to install the project skill. This breaks the intended UX: **user speaks → Agent acts via skill → done**.

## Goal

**User says one thing** (e.g. 「帮我设置 MyRules」「init my rules」) → **Agent runs one command** → project has:

- `~/.myrules/` cache (cloned if missing)
- `.cursor/skills/myrules/SKILL.md` (and `.claude/skills/myrules/` when Claude is in scope)
- Rules deployed under `.cursor/rules/myrules-*.mdc` (+ Claude paths)
- Project registered for `--all` sync

No separate “import skill” step for the user.

## Non-Goals

- Cursor marketplace / `/add-plugin` distribution (future)
- Installing MyRules via `skills-manifest.js` (still excluded — circular)
- Auto-prune legacy rules without explicit user confirmation (unchanged)
- Symlinks for skill install on Windows (plain copy only)

## Approaches Considered

### A. Extend `init.js` only (recommended)

Add `ensureCache()` + `ensureProjectSkill()` at the start of `init.js`. User-facing “one command” stays `init.js`.

| Pros | Cons |
|------|------|
| No new CLI surface | Name “init” doesn’t scream “first time everything” |
| Existing SKILL.md table mostly unchanged | Chicken-egg doc must explain pre-skill clone path |

### B. New `bootstrap.js` wrapping init

`bootstrap.js` = ensureCache + ensureProjectSkill + init.run(). Document as the first-time entry; `init.js` also calls ensureProjectSkill for idempotency.

| Pros | Cons |
|------|------|
| Clear “full setup” name | Two entrypoints to maintain |
| SKILL.md can map “first time” → bootstrap | Slight duplication unless shared lib |

### C. Agent-only file copy (status quo)

SKILL.md instructs Agent to copy files; no script change.

| Pros | Cons |
|------|------|
| Zero code | Fragile, untested, inconsistent across Agents |

**Decision:** **A + shared library**, with optional **B** as a thin alias (`bootstrap.js` re-exports init with `--bootstrap` semantics or identical body). Implementation plan should use **shared `project-skill.js` + `ensure-cache.js`** called from `init.js`; `bootstrap.js` is optional sugar.

## Architecture

```
User: "init my rules" / "设置 MyRules"
        │
        ▼
   Agent (SKILL.md)
        │
        ▼
node "$HOME/.myrules/tools/sync/init.js" --project "<workspace>"
        │
        ├─ ensureCache()          ← clone ~/.myrules if missing
        ├─ ensureProjectSkill()   ← copy skills/myrules → project
        └─ existing init body     ← gitignore, registry, sync
```

### Chicken-and-egg (no skill in project yet)

On a **brand-new** consumer project, Agent may not have MyRules skill loaded. SKILL.md adds a **pre-skill fallback** block:

1. Clone cache: `git clone <manifest.repo> "$HOME/.myrules"`
2. Run init anyway: `node "$HOME/.myrules/tools/sync/init.js" --project "<workspace>"`

Step 2 installs the skill into the project. **Subsequent** turns in that project load the skill normally.

No separate user step.

## New Modules

### `tools/sync/lib/ensure-cache.js`

```js
ensureCache(cacheDir, manifest)
```

| Step | Behavior |
|------|----------|
| Cache exists | Return `{ created: false, cacheDir }` |
| Cache missing | `git clone --depth 1 manifest.repo cacheDir` |
| Clone fails | Throw with repo URL and error message |

Uses `child_process.execFileSync('git', ...)` — same as existing `git.js`. No new dependencies.

**Repo URL:** `loadManifest.loadManifest(cacheDir).repo` when bundled manifest available; if cache path doesn't exist yet, use bundled `manifest.js` from dev checkout (same pattern as `load-manifest.js`).

### `tools/sync/lib/project-skill.js`

```js
ensureProjectSkill(projectRoot, cacheDir, manifest)
```

| Input | Source |
|-------|--------|
| Source file | `<cacheDir>/skills/myrules/SKILL.md` |
| Cursor dest | `<projectRoot>/.cursor/skills/myrules/SKILL.md` |
| Claude dest | `<projectRoot>/.claude/skills/myrules/SKILL.md` |

**Platform gating:** Only install Claude copy if `manifest.platforms` includes `"claude"`. Always install Cursor copy if `"cursor"` in platforms (v1 default: both).

**Idempotency:**

| Case | Action |
|------|--------|
| Dest missing | `ensureDir` + copy |
| Dest exists, same SHA-256 as source | Skip (`skipped`) |
| Dest exists, different content | Overwrite (`updated`) — cache is source of truth |

Returns `{ installed: string[], updated: string[], skipped: string[] }` for logging.

**Never** install to `~/.cursor/skills/myrules/` — that is for **external** skills via `skills.js`. MyRules entry skill is **project-local** only (per existing spec).

### `init.js` changes

```js
function run(opts) {
  const cacheDir = opts.cacheDir || paths.getCacheDir();
  const manifest = loadManifest.loadManifest(cacheDir); // bundled fallback OK

  ensureCache.ensureCache(cacheDir, manifest);
  const skillResult = projectSkill.ensureProjectSkill(projectRoot, cacheDir, manifest);
  logSkillResult(skillResult); // console.log summary

  // ... existing gitignore, registry, legacy hint, syncCli.run()
}
```

`sync.run()` cache-missing check remains as safety net but should not trigger after `ensureCache`.

### Optional `bootstrap.js`

```js
#!/usr/bin/env node
// Thin alias — identical to init for v1
module.exports = require('./init');
if (require.main === module) require('./init').run(require('./init').parseArgs(process.argv.slice(2)));
```

Documented in SKILL.md as synonym for first-time setup.

## `manifest.js` Extension

```js
bootstrap: {
  skillSource: "skills/myrules/SKILL.md",
  cursor: { skillDir: ".cursor/skills/myrules" },
  claude: { skillDir: ".claude/skills/myrules" },
  overwriteSkill: "if_changed", // "if_changed" | "always" | "never_if_exists"
},
```

`overwriteSkill` default `if_changed` (hash compare). Future: `never_if_exists` for user-edited skill copies.

All fields read by `project-skill.js` — no decorative config.

## SKILL.md Updates

### User intent table (revised)

| User intent | Agent runs |
|-------------|------------|
| **First-time / set up MyRules** (no skill yet OK) | `git clone` if needed, then `init.js --project "<workspace>"` |
| Set up / init this project | `init.js --project "<workspace>"` |
| Sync rules | `sync.js --project "<workspace>"` |
| … | (unchanged) |

### New section: Pre-skill fallback

When the project does **not** yet contain `.cursor/skills/myrules/SKILL.md` and the user asks to set up MyRules:

1. Clone `~/.myrules/` from `manifest.repo` if missing
2. Run `init.js` — it will install this skill file and deploy rules
3. Do **not** hand-copy SKILL.md in prose; always use `init.js`

### Remove

Any implication that skill copy is a separate manual step.

## User Journey (corrected)

```
① User → Agent: 「帮我设置 MyRules」
② Agent → git clone (if no ~/.myrules)
③ Agent → node ~/.myrules/tools/sync/init.js --project .
④ init → install .cursor/skills/myrules/SKILL.md
⑤ init → deploy .cursor/rules/myrules-*.mdc
⑥ User → Agent: 「sync my rules」  (later, skill now loaded)
```

One sentence from the user for step ①; Agent may run 1–2 shell commands, user runs zero.

## Error Handling

| Condition | Behavior |
|-----------|------------|
| `git clone` fails (network) | Abort with URL; no partial skill install |
| Source `SKILL.md` missing in cache | Abort — corrupt cache |
| Dest dir not writable | Fail with path |
| Skill install OK, sync fails | Report skill install success + sync error separately |
| Legacy rules detected | Unchanged — hint only, no auto-prune |

## Testing

| Test file | Cases |
|-----------|-------|
| `tests/ensure-cache.test.js` | missing cache → clone; existing → no-op |
| `tests/project-skill.test.js` | install, skip unchanged, update changed, cursor-only platforms |
| `tests/init.test.js` or extend `cli-sync.test.js` | init creates `.cursor/skills/myrules/SKILL.md` |
| `tests/e2e.test.js` | assert skill file exists after init |

Use local bare git remote for clone tests (same pattern as `git.test.js`).

## README / Docs

- Replace “Copy skills/myrules/…” with “Ask Agent to init my rules”
- Design spec § New machine — remove manual copy step 2

## Migration

Existing projects with hand-copied skill: next `init` updates skill if cache version differs (hash). No breaking change.

## Open Question

**Should `.cursor/skills/myrules/` be gitignored?**

Current spec: **version-controlled in consumer projects** (commit the skill). Recommendation: **keep committed** — teammates get the same Agent entry without re-bootstrap.

---

## Approval

After approval → `writing-plans` skill → implementation tasks.
