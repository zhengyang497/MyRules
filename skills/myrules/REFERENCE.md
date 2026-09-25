# MyRules Reference

Vocabulary (used throughout this skill):

- **cache** — `~/.myrules/`; sole source of truth for rules, hooks, method
  pack, and `skills-manifest.js`
- **artifacts** — generated `myrules-*` rules, hook scripts, `hooks.json`
  entries, and hosted method files in projects and `~/.cursor/`; never edit by hand
- **bootstrap** — install this skill into the project before sync phrases work
- **runtime** — `agent` or `project`, stored in project `.myrules-runtime.json`. Optional `instanceLanding: true` means this repo owns landing paths and board commands; sync still updates principles and identity short rules.

## Content map

| Kind | Edit in cache | Deployed artifacts | Notes |
|------|---------------|-------------------|-------|
| Rules | `rules/user/*.md`, `rules/project/*.md` | `.cursor/rules/myrules-*.mdc`, `.claude/rules/myrules-*.md`, `.opencode/rules/myrules-*.md`, `.dsh/rules/myrules-*.md` + `AGENTS.local.md` 管理块 | One topic per file; `project/` may use `agents:` / `runtimes:` frontmatter |
| Sub-agents | same sources (filtered by `agents:` and runtime) | `.cursor/agents/myrules-*.md`, `.claude/agents/myrules-*.md`, `.dsh/agents/myrules-*.md`（角色文件）+ `.dsh/roles-tool-rows.yml`（委派工具脚手架） | **One-way deploy** — edit cache sources, not agent files; `export` does not reverse-merge agents. agent runtime: planner/implementer/reviewer. project runtime: researcher/implementer/reviewer/publisher |
| Hooks | `hooks/user/*.js`, `hooks/project/*.js` | Cursor: `hooks.json` + `myrules-*.js`; Claude: `myrules-hook-*.md` convention docs only; dsh: `.dsh/rules/myrules-hook-*.md`（进管理块） | See seed hooks `session-log`, `session-start-context`, `subagent-start-worker` |
| External skills | `skills-manifest.js` | `~/.cursor/skills/<name>/`, `~/.claude/skills/<name>/`, `~/.dsh/skills/<name>/` | Never list `myrules` here; optional `path` extracts a monorepo subfolder |
| Bootstrap skill | `skills/myrules/*` | Project `.cursor/skills/myrules/` (and `.claude/skills/myrules/`, `.dsh/skills/myrules/`) | Via `install-skill.js` |
| Method pack | `method/core/`, `method/agent/`, `method/project/`, `method/skills/` | `docs/方法/myrules-*.md`, `.cursor/rules/myrules-method-*.mdc`, `.cursor/skills/project-method/`, `.{cursor,claude,dsh}/skills/<写作技能>/`, `scripts/myrules-board*.mjs` | **Hosted.** Updated every sync unless `instanceLanding` (see below). Core small-edit + session rules are alwaysApply on both runtimes, with per-runtime source variants (`method/agent/rules/` vs `method/project/rules/`, same deployed name); the coordinator seat-arbitration sentence ships only in the project variant. Coordinator short rule is project-only with `alwaysApply: false`. The four writing skills (`cohesion-coupling-diagnosis`, `rewriting-model-letter-form/-rules`, `writing-for-the-reader`) deploy to `.cursor/.claude/.dsh` skills dirs on both runtimes — prefer editing them in the cache; project copies are tracked artifacts (hand-edits are warned about on **every** sync and never overwritten — reverse them into the cache with `export --apply`). Instance files (goals, ledger notes, `.myrules-context.md`) are never overwritten. Copy-once templates are abolished |
| Rule authoring (meta) | `rules/meta/*.md` | *(not deployed)* | Read in cache before editing `user/` / `project/` |
| Project context | — | `<project>/.myrules-context.md` | Instance; published purpose. Not overwritten by sync |
| Runtime marker | — | `<project>/.myrules-runtime.json` | Commit this file. `agent` or `project`. Optional `instanceLanding: true`. Cloud clones read it |

**Adding a rule:** read `rules/meta/authoring.md` in the cache first, then create
`rules/user/topic.md` or `rules/project/topic.md`, push, sync.

**Adding a hook:** create `hooks/user/name.js` or `hooks/project/name.js` with
`meta` + `handle`, push, sync. Removing a hook source removes its deployed
script and `hooks.json` entry on the next sync.

**Gitignore:** personal `myrules-user-*` and non-method `myrules-*` rules stay
ignored. Method short rules use an allowlist (`!.../myrules-method-*`) so they
are committed. On **project** runtime, `.cursor/agents/myrules-*` are **not**
gitignored so the coordinator can dispatch by name after clone. User hooks stay
gitignored; cloud VMs re-sync via `.cursor/environment.json` `install`.

**Adding a rule:** read `rules/meta/authoring.md` in the cache first, then create
`rules/user/topic.md` or `rules/project/topic.md`, push, sync.

**Adding a hook:** create `hooks/user/name.js` or `hooks/project/name.js` with
`meta` + `handle`, push, sync. Removing a hook source removes its deployed
script and `hooks.json` entry on the next sync.

## Edit workflow (cache)

1. Edit source files in the **cache** (see content map).
2. Run `node "$HOME/.myrules/tools/sync/push.js" -m "..."` — **done** when exit 0.
3. Run `sync.js --project "<workspace>"` or `--all` on each machine — **done**
   when sync completion criteria pass (see `SKILL.md`).

## What `sync.js` does

On each run (for one project or `--all`):

1. Ensures `~/.myrules/` exists (clone from GitHub if missing)
2. Refuses to pull if the cache repo is dirty — see Safety rules
3. `git pull --ff-only` in the cache
4. Clone/update external skills listed in `skills-manifest.js`
5. Deploy user-level hooks once per run (to `~/.cursor/hooks/`)
6. Deploy project rules + project hooks + sub-agent bundles + **method pack** into the target project(s)
7. Append/refresh the MyRules block in the project `.gitignore` (runtime-specific)
8. Register the project in `~/.myrules/.registry.json` **with its runtime**

There is no separate copy-once method step — arrange writes instance files and
always syncs; later method edits are cache → push → sync.

**`instanceLanding`:** set `{ "runtime": "agent", "instanceLanding": true }` (or
`project`) in `.myrules-runtime.json` when this repo's board commands or goal
paths differ from the hosted pack. Sync then:

- still writes `docs/方法/myrules-项目工作法.md` and session/small short rules
- **preserve** (never overwrite, never delete): `.cursor/skills/project-method/`
  and `.claude/skills/project-method/`
- **drop** (do not write; delete if present): `myrules-method-agent` short
  rule, `docs/方法/myrules-runtime.md`, `scripts/myrules-board*.mjs`,
  `scripts/myrules-goal-ledger.mjs`

`--force` does not override preserve/drop. Arrange does not auto-set the flag.
A leftover unprefixed `docs/方法/项目工作法.md` is **not** the same thing —
those repos still get the full hosted pack.

## Platform notes

- **Cursor user rules:** deployed as per-project `.cursor/rules/myrules-*.mdc`
  with `alwaysApply: true` (not Cursor Settings UI).
- **Claude user rules:** `~/.claude/rules/myrules-user-*.md`; project rules in
  `.claude/rules/myrules-*.md`.
- **Sub-agents:** role bundles depend on `.myrules-runtime.json`. `agent` gets
  `planner`, `implementer`, `reviewer`. `project` gets `researcher`,
  `implementer`, `reviewer`, `publisher`. Sources are `rules/user/` (all) +
  `rules/project/` (filtered by `agents:` and optional `runtimes:`). Agent file
  bodies load only when a sub-agent is delegated. The coordinator method rule is
  deployed for `project` with `alwaysApply: false` (the Project seat, not every
  session). Coordinator-only bans are not deployed into OpenCode project
  instructions. sessionStart context injection skips subagents; subagentStart
  branches by worker role so publisher can edit published goals after a nod.
- **Hooks:** Cursor runs deployed `.js` scripts via `hooks.json`. Claude receives
  generated markdown convention files only — follow them manually; no automatic
  trigger.
- **dsh (DeepSeek Harness):** dsh has no rules directory — it only loads the
  `AGENTS.md`/`CLAUDE.md` chain. MyRules therefore: (1) archives per-topic rule
  files in `.dsh/rules/` (project) and `~/.dsh/rules/` (user); (2) assembles them
  into a **managed block** in `AGENTS.local.md` (project; dsh's local overlay —
  `AGENTS.md`/`CLAUDE.md` stay untouched) and `~/.dsh/AGENTS.md` (user, dsh's only
  user-global entry). Role packs deploy to `.dsh/agents/myrules-<role>.md` and are
  summoned by prompt assembly (stock `subagent` / Agent Teams `spawn_teammate`) or
  by named delegation tools from the `.dsh/roles-tool-rows.yml` scaffold that
  sync generates — MyRules never edits dsh profiles automatically. Hooks mirror
  their prose convention into `.dsh/rules/myrules-hook-*.md` (the official
  `dsh-hooks-claude-code` bridge auto-trigger is a documented follow-up).
  `sync` prints a warning when the combined blocks approach dsh's 64 KiB
  instruction budget (broader files are dropped first).

## Protect — never read, write, or delete these

- `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`
- `AGENTS.md` (dsh 的规则经 `AGENTS.local.md` 管理块注入，`AGENTS.md` 一个字节不碰；
  `~/.dsh/AGENTS.md` 仅管理 `<!-- myrules:begin/end -->` 块内，块外内容逐字保留)
- Claude auto memory under `~/.claude/projects/**/memory/**`
- `.myrules-context.md`, `README.md`, `docs/能力/**`, `docs/设计目标检查清单.md` body, `docs/看板/items/**`, `ledger/board/**`, `ledger/ops/**`, draft/STATUS contents once written
- Unprefixed `docs/方法/项目工作法.md` (legacy copy-once file)
- With `instanceLanding: true`: `.cursor/skills/project-method/**` and
  `.claude/skills/project-method/**` (preserve), now including `.dsh/skills/project-method/**`.
  Preserve semantics: existing copies are never overwritten; a target platform
  missing its copy is **gap-filled by mirroring the instance's own sibling copy**
  (not the cache version); if the instance deleted every platform copy, the
  deletion is respected and nothing is rebuilt. Hosted board scripts and the
  agent board short rule are dropped, not preserved.
- Any `.cursor/rules/*` or `.claude/rules/*` file that does **not** start with
  `myrules-`, unless the user has explicitly confirmed `--prune-legacy-rules`
  after reviewing a `--dry-run` list
- Do not hand-edit `.cursor/hooks.json` or `~/.cursor/hooks.json` to manage
  MyRules hooks — edit sources under `~/.myrules/hooks/` and sync instead.
  (Non-MyRules entries in those JSON files are preserved by the merge logic.)

## Safety rules

- `sync` skips (and reports) any hand-edited **artifact** — rule, hook, method
  file, or skill — on **every** run: it is never overwritten, not even by later
  syncs. Reverse channel: skills → `export.js --apply` writes the edit back into
  `method/skills/`; rules → `export.js` lists the diff, copy it back by hand.
  Hooks / method short rules / scripts / agent files have no export path — edit
  the source in `~/.myrules/` and push. Use `--force` only when the user
  explicitly wants to discard local edits to deployed **artifacts**.
- `export.js` reverse-maps **rules and method skill-pack files** (`--apply`
  writes skill edits back to the cache; rules stay report-only because their
  sources carry `agents:` / `runtimes:` frontmatter). It does not cover hooks
  or sub-agent bundles.
- `--prune-legacy-rules` always requires a preceding `--dry-run
  --prune-legacy-rules` against the *same* legacy file set. If the tool refuses,
  run the dry-run again and show the user the list before retrying.
- If `~/.myrules/` has uncommitted changes, `sync` refuses to pull. Tell the user
  to run `push.js` first or resolve changes manually — do not force-discard
  local edits in the cache. Machine-local state files (`.registry.json`,
  `.user-hooks-state.json`) must stay gitignored in the cache; if untracked
  copies block sync, add them to `~/.myrules/.gitignore` rather than committing
  them.

## Failure handling

| Condition | Behavior |
|-----------|----------|
| `~/.myrules/` missing | `sync.js` clones from `manifest.js` `repo` on first run |
| No runtime marker | Abort; tell user to 布置普通仓库 or 布置 Project 仓库 |
| Cache repo has uncommitted changes | Abort before `git pull`; instruct `push.js` or manual resolve |
| `git pull` not fast-forward | Abort; report conflict, do not auto-merge |
| Deployed **artifact** locally modified (drift) | Skip that file on **every** run (never overwritten); suggest `export` (skills: `--apply`) or `--force` |
| Transform target not writable | Fail with path and permission hint |
| Legacy rules + no prune flag | Deploy myrules only; print legacy count hint |
| Prune without matching dry-run | Refuse; instruct `--dry-run --prune-legacy-rules` |
| Legacy set changed since dry-run | Refuse; fingerprint mismatch — fresh dry-run required |
| External skill clone/update fails | Continue rules deploy; report failed skill names |
| `push` with nothing staged | No-op, not an error |
