# MyRules Design Spec

**Date:** 2026-07-02  
**Status:** Draft for review  
**Scope:** v1 — Cursor + Claude (Codex deferred)

## Summary

MyRules is a skill-driven rules synchronization system. A single GitHub repository holds platform-neutral rule sources; each machine keeps a global cache at `~/.myrules/`; sync scripts transform and deploy rules to Cursor and Claude Code using official, file-backed paths only.

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

## Architecture

```
GitHub (MyRules repo)
        │ git push / pull
        ▼
~/.myrules/                    ← single machine cache
        │ tools/sync/
        ▼
┌───────────────────┬────────────────────────────┐
│ Cursor            │ Claude Code                │
│ project/.cursor/  │ ~/.claude/rules/           │
│   rules/myrules-* │ project/.claude/rules/     │
│ ~/.cursor/skills/ │   myrules-*                │
│                   │ ~/.claude/skills/          │
└───────────────────┴────────────────────────────┘
```

### Repository Layout

```
MyRules/
├── manifest.yaml
├── skills-manifest.yaml
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
│   ├── sync.ps1
│   ├── sync.sh
│   ├── export.ps1
│   ├── export.sh
│   ├── transform/
│   │   ├── cursor.ps1
│   │   ├── cursor.sh
│   │   ├── claude.ps1
│   │   └── claude.sh
│   └── lib/
│       ├── paths.ps1
│       └── paths.sh
└── skills/myrules/
    ├── SKILL.md
    └── scripts/              # thin wrappers → ../../tools/sync/
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

### `manifest.yaml`

```yaml
version: 1
repo: "https://github.com/<user>/MyRules.git"
platforms:
  - cursor
  - claude

managed_prefix: "myrules-"

protect:
  paths:
    - CLAUDE.md
    - .claude/CLAUDE.md
    - CLAUDE.local.md
    - AGENTS.md
    - "~/.claude/projects/**/memory/**"

prune:
  flag: "--prune-legacy-rules"
  backup_dir: ".myrules-backup"
  require_dry_run_first: true
  targets:
    - ".cursor/rules/*.mdc"          # except myrules-* prefix
    - ".claude/rules/*.md"           # except myrules-* prefix
    - ".cursorrules"                 # legacy single-file Cursor rules
    - ".cursor/rules/imported/**"    # optional: Cursor Remote Rule imports

deploy:
  gitignore_deploy_artifacts: true   # default: do not commit deploy outputs

cursor:
  user_rules_via: "project_always_apply"   # not settings UI
  extension: ".mdc"

claude:
  user_rules_dir: "~/.claude/rules"
  project_rules_dir: ".claude/rules"
  extension: ".md"
```

### `skills-manifest.yaml`

Lists **external** skills only. Do **not** include MyRules itself — MyRules is the bootstrap entry point installed by copying `skills/myrules/` into each consumer project (`.cursor/skills/myrules/`, `.claude/skills/myrules/`). Listing MyRules here would duplicate the skill and create a circular install.

```yaml
skills:
  - name: superpowers
    repo: "https://github.com/obra/superpowers.git"
    path: "skills"                    # optional subdir
    ref: main
  - name: my-custom-skill
    repo: "https://github.com/<user>/my-skill.git"
    ref: v1.0.0
```

On sync: clone or `git pull` each entry into `~/.cursor/skills/<name>/` and `~/.claude/skills/<name>/`.

## Deploy Mapping

| Source | Cursor target | Claude target |
|--------|---------------|---------------|
| `rules/user/*` | `<project>/.cursor/rules/myrules-user-<topic>.mdc` (`alwaysApply: true`) | `~/.claude/rules/myrules-<topic>.md` |
| `rules/project/*` | `<project>/.cursor/rules/myrules-<topic>.mdc` (`alwaysApply: true`) | `<project>/.claude/rules/myrules-<topic>.md` |

### Cursor `.mdc` template (generated)

```markdown
---
description: "MyRules: <topic>"
alwaysApply: true
---

<transformed markdown body>
```

### Claude rule file (generated)

Plain markdown at `.claude/rules/myrules-<topic>.md` with no `paths` frontmatter so rules load at session start.

### Export reverse mapping (`myrules export`)

When reversing deployed files back to neutral sources, strip generated frontmatter and map paths as follows:

| Deployed file | Export target |
|---------------|---------------|
| `<project>/.cursor/rules/myrules-user-<topic>.mdc` | `~/.myrules/rules/user/<topic>.md` |
| `<project>/.cursor/rules/myrules-<topic>.mdc` | `~/.myrules/rules/project/<topic>.md` |
| `~/.claude/rules/myrules-<topic>.md` | `~/.myrules/rules/user/<topic>.md` if `<topic>` matches a user rule; otherwise prompt (Claude user dir has no `user-` prefix in filename) |
| `<project>/.claude/rules/myrules-<topic>.md` | `~/.myrules/rules/project/<topic>.md` |

Export rules:

- Only read files matching managed prefix `myrules-`.
- Never read or export from protect-listed paths.
- Cursor `.mdc`: remove YAML frontmatter block before diffing body content.
- Claude `.md`: use body as-is (no frontmatter to strip unless present).
- If the same `<topic>` exists in both Cursor user mdc and Claude user md, merge into a single `rules/user/<topic>.md` after user confirmation.

## Deploy artifacts and `.gitignore`

Deploy outputs are **local caches** of `~/.myrules/rules/`, not a second source of truth. By default they are **not committed** to consumer project repos.

On `myrules init`, append the following to the consumer project's `.gitignore` if entries are missing (create `.gitignore` if needed):

```gitignore
# MyRules deploy artifacts (generated by myrules sync — edit ~/.myrules/rules/ instead)
.cursor/rules/myrules-*
.claude/rules/myrules-*
.myrules-backup/
.myrules-sync-state.json
```

Optional override: set `deploy.gitignore_deploy_artifacts: false` in `manifest.yaml` if a project should commit deploy outputs (not recommended for the default single-source workflow).

The MyRules skill bootstrap files **are** version-controlled in consumer projects:

```
.cursor/skills/myrules/
.claude/skills/myrules/
```

## Sync state (`.myrules-sync-state.json`)

Each consumer project keeps a machine-local state file at the project root. It is gitignored and records sync/prune history for enforcement and status reporting.

```json
{
  "schemaVersion": 1,
  "cachePath": "~/.myrules",
  "cacheCommit": "abc123def456",
  "lastSyncAt": "2026-07-02T12:00:00Z",
  "lastPruneAt": null,
  "pruneDryRunDone": false,
  "pruneDryRunAt": null,
  "legacyRulesDetected": 3
}
```

| Field | Purpose |
|-------|---------|
| `schemaVersion` | Migration marker for future state format changes |
| `cacheCommit` | Git commit SHA of `~/.myrules/` at last successful sync |
| `lastSyncAt` | ISO 8601 timestamp of last successful deploy |
| `lastPruneAt` | ISO 8601 timestamp of last `--prune-legacy-rules` (null if never) |
| `pruneDryRunDone` | Must be `true` before `--prune-legacy-rules` is allowed |
| `pruneDryRunAt` | When dry-run last completed; reset `pruneDryRunDone` if legacy set changes |
| `legacyRulesDetected` | Count from last scan (informational) |

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
| `myrules sync` | Pull cache; deploy/overwrite `myrules-*` only; leave legacy rules |
| `myrules sync --dry-run --prune-legacy-rules` | List legacy rule files that would be archived |
| `myrules sync --prune-legacy-rules` | Archive legacy rules to `.myrules-backup/<timestamp>/`, then deploy `myrules-*` |

Legacy targets for prune:

- `<project>/.cursor/rules/*.mdc` not matching `myrules-*`
- `<project>/.claude/rules/*.md` not matching `myrules-*`
- `<project>/.cursorrules` (legacy single-file format; archive to backup)
- `<project>/.cursor/rules/imported/**` (optional; Cursor Remote Rule imports — enabled by default in `manifest.yaml` prune targets)

Prune never touches protect paths. First prune in a project requires `pruneDryRunDone: true` in `.myrules-sync-state.json` (set by a prior `--dry-run --prune-legacy-rules`) or interactive confirmation recorded in skill workflow.

## Commands

| Command | Description |
|---------|-------------|
| `myrules init` | Ensure `~/.myrules/` clone; update project `.gitignore`; deploy; write `.myrules-sync-state.json`; detect legacy rules and prompt for prune |
| `myrules sync` | `git pull` in cache; deploy skills + rules to current project and Claude user dir |
| `myrules sync --prune-legacy-rules` | Sync + archive legacy rules |
| `myrules sync --dry-run` | Show pending deploy and prune actions without writing |
| `myrules sync --dry-run --prune-legacy-rules` | List legacy files to archive; sets `pruneDryRunDone: true` in sync state |
| `myrules export` | Diff local `myrules-*` files against cache; produce merge report for `~/.myrules/rules/` |
| `myrules push` | Commit and push changes in `~/.myrules/` |
| `myrules status` | Cache commit, dirty state, legacy rule count, last sync/prune timestamps |

## Workflows

### New machine

1. `git clone <MyRules-repo> ~/.myrules/`
2. Copy `skills/myrules/` into each project's `.cursor/skills/myrules/` (and `.claude/skills/myrules/` when using Claude in that repo)
3. Run `myrules init` or `myrules sync` per project

### Edit rules (primary path)

1. Edit files under `~/.myrules/rules/`
2. `myrules push`
3. On other machines: `git pull` in `~/.myrules/`, then `myrules sync` in each project

### Temporary local edit (hybrid export)

1. Edit deployed `myrules-*` files in a project or `~/.claude/rules/`
2. `myrules export` → review diff
3. Merge into `~/.myrules/rules/` manually or via guided merge
4. `myrules push`; sync other projects

**Not supported:** export from Cursor Settings → User Rules.

### Old personal project takeover

1. Import MyRules skill
2. `myrules init` → detects legacy rules
3. `myrules sync --dry-run --prune-legacy-rules` → review list
4. `myrules sync --prune-legacy-rules` → archive + deploy

## Skill Structure (`skills/myrules/SKILL.md`)

### Responsibilities

- Parse user intent (`init`, `sync`, `export`, `push`, `prune`)
- Resolve paths: `~/.myrules/`, current project root, OS-specific home
- Invoke `tools/sync/*` via Shell; never improvise deploy logic in prose
- On init with legacy rules: require explicit user confirmation before prune

### Required sections in SKILL.md

1. When to use (init new project, sync after pull, export after local edits)
2. Command mapping to scripts with exact arguments
3. Protect list reminder — never edit `CLAUDE.md` / `AGENTS.md` / memory
4. Platform notes (Cursor user rules → per-project `alwaysApply` mdc)
5. Failure handling: missing clone → offer `git clone`; git dirty → warn before overwrite
6. On init: append MyRules `.gitignore` template; create `.myrules-sync-state.json`

### Project bootstrap

For a **new** consumer project, copy only:

```
.cursor/skills/myrules/     # Cursor entry
.claude/skills/myrules/     # Claude entry (optional symlink to same content)
```

Skill scripts reference `~/.myrules/tools/sync/` by absolute path.

## Error Handling

| Condition | Behavior |
|-----------|----------|
| `~/.myrules/` missing | Prompt to clone from `manifest.yaml` repo URL |
| `git pull` fails | Abort deploy; show error |
| Transform target not writable | Fail with path and permission hint |
| Legacy rules + no prune flag | Deploy myrules only; print legacy count warning |
| Prune without dry-run first | Refuse; instruct to run `--dry-run --prune-legacy-rules`; check `pruneDryRunDone` in `.myrules-sync-state.json` |
| Skill clone URL unreachable | Continue rules deploy; report failed skill names |

## Testing (v1)

1. **Transform unit checks:** sample `rules/user/preferences.md` → valid `.mdc` and `.md` output
2. **Deploy integration:** temp project dir receives `myrules-*` files with correct frontmatter
3. **Protect integration:** run sync against fixture with `CLAUDE.md`; file unchanged
4. **Prune dry-run:** legacy files listed (including `.cursorrules` and optional `imported/`); protect files absent; `pruneDryRunDone` set in state
5. **Prune execute:** legacy archived under `.myrules-backup/`; myrules deployed; refuses if dry-run not done
6. **Gitignore init:** `myrules init` appends deploy artifact patterns without duplicating entries
7. **Sync state:** state file written on sync; `myrules status` reads it
8. **Export reverse mapping:** deployed mdc/md correctly map back to `rules/user/` and `rules/project/`
9. **Cross-platform:** run `sync.sh` on Unix and `sync.ps1` on Windows against same fixture

## Known Limitations

1. Cursor user preferences require per-project deploy (no global file-backed User Rules).
2. Rules are prompt context on both platforms, not hard enforcement.
3. Each project must run sync after cache pull — not automatic.
4. Prune is destructive to legacy rule files (mitigated by backup); unsuitable for shared team repos without careful review.
5. Codex not included in v1.

## Decision Log

| Decision | Choice |
|----------|--------|
| Canonical format | Platform-neutral Markdown in `rules/` |
| Edit workflow | Hybrid: primary edit in cache; export for local hotfixes |
| Deploy layers | User + project templates; protect project memory |
| v1 platforms | Cursor + Claude |
| Machine cache | `~/.myrules/` global clone |
| Skill manifest | External git refs in `skills-manifest.yaml` |
| Claude project deploy | `.claude/rules/myrules-*.md` (not `CLAUDE.md`) |
| Implementation | Skill + scripts (not standalone CLI) |
| Legacy rules | MyRules primary source; opt-in prune with backup |
| Cursor user rules | Per-project `myrules-user-*.mdc` alwaysApply |
| Deploy artifacts | Gitignored in consumer projects by default |
| Prune scope | Includes `.cursorrules` and `.cursor/rules/imported/**` |
| Sync state | `.myrules-sync-state.json` per consumer project |
| skills-manifest | External skills only; MyRules installed via bootstrap copy |

## Next Step

After approval of this spec, invoke **writing-plans** to produce `docs/superpowers/plans/2026-07-02-myrules.md`.
