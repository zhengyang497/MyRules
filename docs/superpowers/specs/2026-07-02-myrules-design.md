# MyRules Design Spec

**Date:** 2026-07-02 (revised 2026-07-03)  
**Status:** Draft for review  
**Scope:** v1 — Cursor + Claude (Codex deferred)

## Revision Note (2026-07-03)

Post-brainstorming review found the original Bash+PowerShell dual implementation was not executable on the primary dev machine: empirical check found no `bash`, no real `python` (Windows Store stub only), no `jq` — but Node.js v24 and npm were present. The design is revised to use a **single Node.js implementation** instead of dual Bash/PowerShell scripts. This section documents what changed; the rest of this document reflects the corrected design going forward. See [Decision Log](#decision-log) for the full list of changes and rationale.

## Summary

MyRules is a skill-driven rules synchronization system. A single GitHub repository holds platform-neutral rule sources; each machine keeps a global cache at `~/.myrules/`; a Node.js sync tool transforms and deploys rules to Cursor and Claude Code using official, file-backed paths only.

MyRules is the **primary rules source** for personal projects. Legacy project rules without the `myrules-` prefix are removed only via explicit opt-in (`--prune-legacy-rules`), with dry-run and backup.

## Goals

1. Sync personal rules (preferences, AI behavior, testing requirements, prohibitions, output standards) and a standard skill manifest across devices, platforms, and projects via GitHub push/pull.
2. New projects: import the MyRules skill and run init/sync to configure rules.
3. Old projects: import MyRules, opt-in prune legacy rules, deploy MyRules rules; never touch project memory/context files.

**Explicitly excluded:** project memory (Claude auto memory, `CLAUDE.md` project context, `AGENTS.md`, `CLAUDE.local.md`, third-party MCP memory stores).

## Non-Goals (v1)

- Codex support
- Bidirectional auto-sync from Cursor Settings → User Rules (no filesystem API)
- Native `~/.cursor/rules/` as a global rules sink (not officially supported by Cursor)
- Pruning or modifying non-rules project files
- Automatic sync on every rule edit (still an explicit, user-run command — mitigated by `--all`, see below)

## Platform Verification (2026-07-02)

Verified against official docs:

| Mechanism | Cursor | Claude Code |
|-----------|--------|-------------|
| Project rules (file-backed, auto-loaded) | `.cursor/rules/*.mdc` with YAML frontmatter | `.claude/rules/*.md` |
| User/global rules (file-backed) | **Not available** — User Rules live in Settings UI only | `~/.claude/rules/*.md` |
| Project context / memory (protect) | `CLAUDE.md`, `AGENTS.md` (Cursor reads both) | `CLAUDE.md`, `CLAUDE.local.md`, `~/.claude/projects/**/memory/**` |
| Skills discovery | `~/.cursor/skills/`, `.cursor/skills/` | `~/.claude/skills/`, `.claude/skills/` |
| Plain `.md` in `.cursor/rules/` | Ignored (must be `.mdc`) | N/A |

**Design correction:** Cursor user-level content from `rules/user/` deploys as per-project `.cursor/rules/myrules-user-*.mdc` with `alwaysApply: true`, not to Cursor Settings User Rules.

## Runtime Verification (2026-07-03)

Empirically checked on the primary dev machine (Windows 10/11, PowerShell 5.1):

| Runtime | Available? |
|---------|-----------|
| `bash` | ❌ No (no Git Bash, no WSL) |
| `python` / `py` | ❌ No (Windows Store stub only, not a real interpreter) |
| `jq` | ❌ No |
| **Node.js** | ✅ v24.17.0 |
| **npm/npx** | ✅ v11.13.0 |

**Decision:** the sync engine is a **single Node.js implementation**. No dual-language scripts, no assumption of Bash/Python/jq. This is a stricter zero-new-dependency guarantee than the original "Bash reference + PowerShell port" plan, which in practice required installing Git Bash or WSL before anything could run.

Config files (`manifest.js`, `skills-manifest.js`) are plain Node modules (`module.exports = {...}`) rather than YAML, so they load via `require()` with no parser to write or maintain, and support comments natively.

## Architecture

```
GitHub (MyRules repo)
        │ git push / pull
        ▼
~/.myrules/                    ← single machine cache (Node.js project, no npm deps)
        │ tools/sync/ (Node.js)
        ▼
┌───────────────────┬────────────────────────────┐
│ Cursor            │ Claude Code                │
│ project/.cursor/  │ ~/.claude/rules/           │
│   rules/myrules-* │ project/.claude/rules/     │
│ ~/.cursor/skills/ │   myrules-*                │
│                   │ ~/.claude/skills/          │
└───────────────────┴────────────────────────────┘
```

Invocation is identical on every OS: `node <path>/tools/sync/sync.js --project "<dir>"`. Both PowerShell and POSIX shells expand `$HOME`, so the same command string works everywhere — no OS branching needed in the skill.

### Repository Layout

```
MyRules/
├── package.json                 # engines.node >=18, type: commonjs, no dependencies
├── manifest.js                  # exports config object (protect list, prune targets, prefixes)
├── skills-manifest.js           # exports external skill list
├── rules/
│   ├── user/
│   │   ├── preferences.md
│   │   ├── prohibitions.md
│   │   └── output-standards.md
│   └── project/
│       ├── ai-behavior.md
│       ├── testing.md
│       └── coding-standards.md
├── tools/sync/
│   ├── lib/
│   │   ├── paths.js             # cache/project/rules-dir resolution
│   │   ├── fsutil.js            # ensureDir, listFilesWithExt, hashContent
│   │   ├── state.js             # read/write .myrules-sync-state.json
│   │   ├── gitignore.js         # idempotent gitignore append
│   │   ├── git.js               # git pull/push/status wrapper (execFileSync)
│   │   ├── transform.js         # markdown -> .mdc / .md, frontmatter strip
│   │   ├── deploy.js            # write transformed files, drift detection
│   │   ├── legacy.js            # scan/fingerprint/archive legacy rules
│   │   ├── skills.js            # clone/update external skills
│   │   ├── export.js            # reverse map deployed files -> neutral sources
│   │   └── registry.js          # track known consumer projects for --all
│   ├── sync.js                  # CLI: pull, deploy, prune, dry-run, --all
│   ├── init.js                  # CLI: first-time setup for a project
│   ├── status.js                # CLI: print state + git info
│   └── push.js                  # CLI: commit + push the cache repo
├── skills/myrules/
│   └── SKILL.md                 # agent entry point
├── tests/
│   ├── fixtures/                # sample projects for integration tests
│   └── *.test.js                # node:test suites (no test framework dependency)
└── README.md
```

## Neutral Format (`rules/`)

### Principles

- One topic per file; Markdown body only in source files.
- Filenames are semantic (`testing.md`, not platform-specific names).
- Platform metadata (frontmatter) is generated at transform time, not authored in source.

### Categories

| Directory | Purpose | Examples |
|-----------|---------|----------|
| `rules/user/` | Cross-project personal preferences | communication style, global prohibitions |
| `rules/project/` | Standard project behavior template | TDD requirements, output format, AI workflow |

### `manifest.js`

```js
module.exports = {
  version: 1,
  repo: "https://github.com/zhengyang497/MyRules.git",
  platforms: ["cursor", "claude"],

  managedPrefix: "myrules-",

  protect: {
    paths: [
      "CLAUDE.md",
      ".claude/CLAUDE.md",
      "CLAUDE.local.md",
      "AGENTS.md",
      "~/.claude/projects/**/memory/**",
    ],
  },

  prune: {
    flag: "--prune-legacy-rules",
    backupDir: ".myrules-backup",
    requireDryRunFirst: true,
    targets: [
      ".cursor/rules/*.mdc",        // except managedPrefix
      ".claude/rules/*.md",         // except managedPrefix
      ".cursorrules",               // legacy single-file Cursor rules
      ".cursor/rules/imported/**",  // Cursor Remote Rule imports
    ],
  },

  deploy: {
    gitignoreDeployArtifacts: true,
  },

  cursor: {
    userRulesVia: "project_always_apply", // not Settings UI — see Platform Verification
    extension: ".mdc",
  },

  claude: {
    userRulesDir: "~/.claude/rules",
    projectRulesDir: ".claude/rules",
    extension: ".md",
  },
};
```

This file is `require()`'d directly by `tools/sync/lib/*` — every field listed above is actually read at runtime (unlike the original YAML draft, where several fields were aspirational and not wired into any script). Fields not read by any module are not included, to avoid config that silently does nothing.

### `skills-manifest.js`

Lists **external** skills only. Do **not** include MyRules itself — MyRules is the bootstrap entry point installed by copying `skills/myrules/` into each consumer project (`.cursor/skills/myrules/`, `.claude/skills/myrules/`). Listing MyRules here would duplicate the skill and create a circular install. `tools/sync/lib/skills.js` also defensively skips any entry named `myrules`.

```js
module.exports = {
  skills: [
    { name: "superpowers", repo: "https://github.com/obra/superpowers.git", ref: "main" },
  ],
};
```

On sync: shallow-clone or fetch+reset each entry into `~/.cursor/skills/<name>/` and `~/.claude/skills/<name>/`.

## Deploy Mapping

| Source | Cursor target | Claude target |
|--------|---------------|---------------|
| `rules/user/*` | `<project>/.cursor/rules/myrules-user-<topic>.mdc` (`alwaysApply: true`) | `~/.claude/rules/myrules-user-<topic>.md` |
| `rules/project/*` | `<project>/.cursor/rules/myrules-<topic>.mdc` (`alwaysApply: true`) | `<project>/.claude/rules/myrules-<topic>.md` |

**Naming symmetry fix:** the Claude user target now keeps the `user-` infix (`myrules-user-<topic>.md`), matching Cursor's convention. The original draft dropped it for Claude user rules, which made the export reverse-mapping ambiguous (same basename could mean "user" or "project" depending only on which directory it was found in, requiring a prompt to disambiguate). With symmetric naming, `myrules-user-*` vs `myrules-*` unambiguously identifies category from the filename alone, in every target directory.

### Cursor `.mdc` template (generated)

```markdown
---
description: "MyRules: <topic>"
alwaysApply: true
---

<transformed markdown body>
```

### Claude rule file (generated)

Plain markdown at `<dir>/myrules-<user->-<topic>.md` with no `paths` frontmatter so rules load at session start. Body is unchanged from source (no transform needed for v1).

### Export reverse mapping (`myrules export`)

| Deployed file | Export target |
|---------------|---------------|
| `<project>/.cursor/rules/myrules-user-<topic>.mdc` | `~/.myrules/rules/user/<topic>.md` |
| `<project>/.cursor/rules/myrules-<topic>.mdc` | `~/.myrules/rules/project/<topic>.md` |
| `~/.claude/rules/myrules-user-<topic>.md` | `~/.myrules/rules/user/<topic>.md` |
| `<project>/.claude/rules/myrules-<topic>.md` | `~/.myrules/rules/project/<topic>.md` |

With symmetric naming, this mapping is a pure lookup — no ambiguity, no user prompt required.

Export rules:

- Only read files matching managed prefix `myrules-`.
- Never read or export from protect-listed paths.
- Cursor `.mdc`: strip the YAML frontmatter block before diffing body content.
- Claude `.md`: use body as-is.
- Report is a list of `{deployedFile, sourceFile, body}` diffs; merging into `rules/` is a manual confirm step (v1 does not auto-write the cache repo from export).

## Deploy artifacts, drift detection, and `.gitignore`

Deploy outputs are **local caches** of `~/.myrules/rules/`, not a second source of truth. By default they are **not committed** to consumer project repos.

### Drift detection (new)

The original draft allowed `sync` to silently overwrite a `myrules-*` file that the user had hand-edited locally without exporting first — a real data-loss risk for the hybrid edit workflow. This is fixed: `.myrules-sync-state.json` now tracks a content hash per deployed file (`deployedHashes`). On each `sync`:

1. If a target file exists and its current hash differs from the hash recorded at the last successful deploy, it is **locally modified** — sync skips it and reports it instead of overwriting.
2. `myrules sync --force` overwrites anyway (cache wins).
3. `myrules export` reads the same drifted files to build a diff report for manual merge back into `~/.myrules/rules/`.

### `.gitignore` template

On `myrules init`, append the following to the consumer project's `.gitignore` if entries are missing (create `.gitignore` if needed), guarded by a marker comment so repeated `init` runs are idempotent:

```gitignore
# MyRules deploy artifacts (generated by myrules sync — edit ~/.myrules/rules/ instead)
.cursor/rules/myrules-*
.claude/rules/myrules-*
.myrules-backup/
.myrules-sync-state.json
```

Optional override: set `deploy.gitignoreDeployArtifacts: false` in `manifest.js` if a project should commit deploy outputs (not recommended for the default single-source workflow).

The MyRules skill bootstrap files **are** version-controlled in consumer projects:

```
.cursor/skills/myrules/
.claude/skills/myrules/
```

These are plain copied files, not symlinks. (The original draft suggested an "optional symlink" for the Claude copy; this is dropped — Windows symlinks require admin rights or Developer Mode, which is exactly why the earlier "Symlink Deployment" architecture option was rejected during brainstorming. A second copy of a small `SKILL.md` is cheap; a symlink caveat is not worth reintroducing.)

## Sync state (`.myrules-sync-state.json`)

Each consumer project keeps a machine-local state file at the project root. It is gitignored and records sync/prune history and per-file deploy hashes.

```json
{
  "schemaVersion": 1,
  "cachePath": "~/.myrules",
  "cacheCommit": "abc123def456",
  "lastSyncAt": "2026-07-03T12:00:00Z",
  "lastPruneAt": null,
  "pruneDryRunDone": false,
  "pruneDryRunAt": null,
  "legacyRulesFingerprint": null,
  "legacyRulesDetected": 0,
  "deployedHashes": {
    ".cursor/rules/myrules-testing.mdc": "sha256:..."
  }
}
```

| Field | Purpose |
|-------|---------|
| `schemaVersion` | Migration marker for future state format changes |
| `cacheCommit` | Git commit SHA of `~/.myrules/` at last successful sync |
| `lastSyncAt` | ISO 8601 timestamp of last successful deploy |
| `lastPruneAt` | ISO 8601 timestamp of last `--prune-legacy-rules` (null if never) |
| `pruneDryRunDone` | Must be `true` **and** `legacyRulesFingerprint` must match the current scan before `--prune-legacy-rules` is allowed |
| `pruneDryRunAt` | When dry-run last completed |
| `legacyRulesFingerprint` | Hash of the sorted legacy file list at last dry-run — used to detect "legacy set changed since dry-run" and force a fresh dry-run |
| `legacyRulesDetected` | Count from last scan (informational) |
| `deployedHashes` | Content hash per deployed file, keyed by path relative to project root — powers drift detection |

Updated by `tools/sync/` on successful `sync`, `init`, dry-run, and prune. `myrules status` reads this file. If missing, treat as never synced.

## Protect List

Never read for export merge, never write, never delete:

- `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`
- `AGENTS.md`
- `~/.claude/projects/**/memory/**` (Claude auto memory)
- Any `.cursor/rules/*` or `.claude/rules/*` file whose basename does not start with `myrules-` **unless** `--prune-legacy-rules` is explicitly used (then legacy rules are archived, not protect-listed)

## Legacy Rule Policy (Option 2 — Primary Source)

**Philosophy:** MyRules is the primary rules source for personal projects.

| Command | Behavior |
|---------|----------|
| `myrules sync` | Pull cache; deploy/overwrite non-drifted `myrules-*` only; leave legacy rules |
| `myrules sync --dry-run --prune-legacy-rules` | List legacy rule files that would be archived; records a fingerprint of that exact set |
| `myrules sync --prune-legacy-rules` | Archive legacy rules to `.myrules-backup/<timestamp>/`, then deploy `myrules-*` — refuses if the legacy set has changed since the last dry-run |

Legacy targets for prune:

- `<project>/.cursor/rules/*.mdc` not matching `myrules-*`
- `<project>/.claude/rules/*.md` not matching `myrules-*`
- `<project>/.cursorrules` (legacy single-file format; archive to backup)
- `<project>/.cursor/rules/imported/**` (Cursor Remote Rule imports)

Prune never touches protect paths. First prune in a project requires `pruneDryRunDone: true` **and** a matching `legacyRulesFingerprint` in `.myrules-sync-state.json`. If the legacy file set changed after the dry-run (e.g., a new stray `.mdc` appeared), the fingerprint mismatch forces a fresh dry-run rather than silently proceeding with a stale approval.

## Commands

| Command | Description |
|---------|-------------|
| `myrules init [--project PATH]` | Ensure `~/.myrules/` clone; update project `.gitignore`; register project; deploy; detect legacy rules and print prune hint |
| `myrules sync [--project PATH]` | `git pull --ff-only` in cache; sync skills; deploy rules (skip drifted files); write sync state |
| `myrules sync --all` | Same as above for every project in the registry (`~/.myrules/.registry.json`) |
| `myrules sync --force` | Deploy overwrites drifted files too (cache wins) |
| `myrules sync --prune-legacy-rules` | Sync + archive legacy rules (requires a matching prior dry-run) |
| `myrules sync --dry-run [--prune-legacy-rules]` | Print pending actions only; with prune flag, records `pruneDryRunDone` + fingerprint |
| `myrules export [--project PATH]` | Diff local `myrules-*` files against cache; print merge report |
| `myrules push [-m MESSAGE]` | Commit (if there are changes) and push `~/.myrules/` |
| `myrules status [--project PATH]` | Cache commit, cache dirty state, legacy rule count, last sync/prune timestamps |

## Workflows

### New machine

1. `git clone <MyRules-repo> ~/.myrules/`
2. Copy `skills/myrules/` into each project's `.cursor/skills/myrules/` (and `.claude/skills/myrules/` when using Claude in that repo)
3. Run `node ~/.myrules/tools/sync/init.js --project "<dir>"`

### Edit rules (primary path)

1. Edit files under `~/.myrules/rules/`
2. `node ~/.myrules/tools/sync/push.js`
3. On other machines: `git pull` in `~/.myrules/`, then `node tools/sync/sync.js --project "<dir>"` per project (or `--all` to cover every registered project on that machine in one call)

### Temporary local edit (hybrid export)

1. Edit a deployed `myrules-*` file in a project or `~/.claude/rules/`
2. `node tools/sync/export.js --project "<dir>"` → review diff (drift detection means a plain `sync` will not silently clobber this edit first)
3. Merge into `~/.myrules/rules/` manually
4. `push`; sync other projects

**Not supported:** export from Cursor Settings → User Rules.

### Old personal project takeover

1. Import MyRules skill
2. `init` → detects legacy rules, prints hint
3. `sync --dry-run --prune-legacy-rules` → review list
4. `sync --prune-legacy-rules` → archive + deploy

## Skill Structure (`skills/myrules/SKILL.md`)

### Responsibilities

- Parse user intent (`init`, `sync`, `sync --all`, `export`, `push`, `prune`)
- Always invoke `node <cache>/tools/sync/<cmd>.js ...`; never improvise deploy logic in prose
- On init with legacy rules: require explicit user confirmation before prune
- Same invocation syntax on Windows and Unix (`$HOME` expands in both PowerShell and POSIX shells) — no OS branch needed

### Required sections in SKILL.md

1. When to use (init new project, sync after pull, export after local edits)
2. Command mapping to scripts with exact arguments
3. Protect list reminder — never edit `CLAUDE.md` / `AGENTS.md` / memory
4. Platform notes (Cursor user rules → per-project `alwaysApply` mdc)
5. Failure handling: missing clone → offer `git clone`; cache dirty → warn before pulling; drifted files reported, not silently overwritten

### Project bootstrap

For a **new** consumer project, copy only:

```
.cursor/skills/myrules/     # Cursor entry
.claude/skills/myrules/     # Claude entry (plain copy, not a symlink)
```

Skill scripts reference `~/.myrules/tools/sync/` by absolute path; no relative path assumptions about where the consumer project lives.

## Error Handling

| Condition | Behavior |
|-----------|----------|
| `~/.myrules/` missing | Prompt to clone from `manifest.js`'s `repo` field |
| Cache repo has uncommitted changes | Abort before `git pull`; instruct to commit/stash or run `push` |
| `git pull` not fast-forward | Abort; report conflict, do not auto-merge |
| Deployed file locally modified (drift) | Skip that file, report it; suggest `export` or `--force` |
| Transform target not writable | Fail with path and permission hint |
| Legacy rules + no prune flag | Deploy myrules only; print legacy count hint |
| Prune without matching dry-run | Refuse; instruct to run `--dry-run --prune-legacy-rules` |
| Legacy set changed since dry-run | Refuse; fingerprint mismatch forces a fresh dry-run |
| Skill clone/update URL unreachable | Continue rules deploy; report failed skill names |
| `push` with nothing staged | No-op, not an error |

## Testing (v1)

Uses Node's built-in test runner (`node --test`) — no test framework dependency, since Node 18+ ships `node:test`/`node:assert` and the dev machine has Node 24.

1. **paths:** cache/project/rules-dir resolution, with `homedir` injectable for tests (no env var mutation)
2. **transform:** Cursor output includes `alwaysApply: true` + description; Claude output has no frontmatter (asserted via "does not contain", not "at least one non-matching line")
3. **state:** write/read round-trip, partial patch merge, missing-file defaults
4. **gitignore:** idempotent append (marker-guarded), second run does not duplicate
5. **git wrapper:** against a real local fixture repo — dirty check, ff-only pull failure, commit-skip-when-clean
6. **legacy scan/fingerprint:** correct file set (including `.cursorrules`, `imported/**`), protect files never included, fingerprint stable for same set / changes when set changes
7. **deploy + drift:** first deploy writes all files; second deploy with an untouched cache is a no-op; hand-editing a deployed file causes it to be skipped and reported, not overwritten, unless `--force`
8. **prune gate:** refuses without dry-run; refuses if legacy set changed after dry-run; archives correctly and leaves protect files untouched
9. **skills sync:** clone-if-missing / fetch+reset-if-present against a local bare repo fixture; `myrules` entry is always skipped
10. **export reverse mapping:** deployed mdc/md map back to the correct `rules/user/` or `rules/project/` file unambiguously
11. **end-to-end:** legacy project fixture → init → sync → protect files unchanged → dry-run prune → prune → files archived → export

## Known Limitations

1. Cursor user preferences require per-project deploy (no global file-backed User Rules).
2. Rules are prompt context on both platforms, not hard enforcement.
3. Sync is not automatic on rule edits; `sync --all` covers every registered project on one machine in one call, but each machine must still run it.
4. Prune is destructive to legacy rule files (mitigated by backup + fingerprint-gated dry-run); unsuitable for shared team repos without careful review.
5. Codex not included in v1.
6. `manifest.js`/`skills-manifest.js` being real JS modules (not YAML/JSON) means they are trusted, personal config — not meant to ingest untrusted input.

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Canonical format | Platform-neutral Markdown in `rules/` | unchanged |
| Edit workflow | Hybrid: primary edit in cache; export for local hotfixes | unchanged |
| Deploy layers | User + project templates; protect project memory | unchanged |
| v1 platforms | Cursor + Claude | unchanged |
| Machine cache | `~/.myrules/` global clone | unchanged |
| Skill manifest | External git refs in `skills-manifest.js` | format changed from YAML |
| Claude project deploy | `.claude/rules/myrules-*.md` (not `CLAUDE.md`) | unchanged |
| Implementation | Skill + scripts (not standalone CLI) | unchanged decision; scripting language revised below |
| **Sync engine language** | **Node.js single implementation (was: Bash reference + PowerShell port)** | Empirically verified: dev machine has no bash/python/jq but has Node v24; dual-implementation also risked the two versions drifting |
| **Config file format** | **`manifest.js` / `skills-manifest.js` as `require()`-able JS modules (was: YAML)** | Avoids writing/maintaining a YAML parser (the original plan never actually specified one — a real gap this revision closes); zero dependencies; comments still supported |
| Legacy rules | MyRules primary source; opt-in prune with backup | unchanged |
| Cursor user rules | Per-project `myrules-user-*.mdc` alwaysApply | unchanged |
| Deploy artifacts | Gitignored in consumer projects by default | unchanged |
| Prune scope | Includes `.cursorrules` and `.cursor/rules/imported/**` | unchanged |
| **Prune safety** | **Requires dry-run AND a matching legacy-set fingerprint, not just a boolean flag** | Original design described fingerprint invalidation but never specified how; this revision makes it concrete |
| Sync state | `.myrules-sync-state.json` per consumer project | extended with `deployedHashes` and `legacyRulesFingerprint` |
| skills-manifest | External skills only; MyRules installed via bootstrap copy | unchanged |
| **Drift detection** | **Sync skips and reports locally-modified `myrules-*` files instead of silently overwriting** | Original design had no protection against losing local hotfixes to `myrules-*` files; this closes that gap |
| **Multi-project sync** | **`~/.myrules/.registry.json` tracks known projects; `sync --all` updates all of them in one call** | Original design required manually re-running sync in every open project after every rule edit, which undercut the "stays in sync across many projects" goal |
| **Claude user rule naming** | **`myrules-user-<topic>.md` (was: `myrules-<topic>.md`, no infix)** | Symmetric with Cursor's naming; removes the export-mapping ambiguity the original design had to resolve with a user prompt |
| Claude skill bootstrap | Plain copy in both `.cursor/skills/myrules/` and `.claude/skills/myrules/` (no symlink) | Original draft suggested an optional symlink, contradicting the earlier rejection of symlink-based deployment for Windows reasons |

## Next Step

Spec revised post-review. Proceed to update `docs/superpowers/plans/2026-07-02-myrules.md` to match this design, then resume implementation from Task 1.
