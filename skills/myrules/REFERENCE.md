# MyRules Reference

Vocabulary (used throughout this skill):

- **cache** — `~/.myrules/`; sole source of truth for rules, hooks, and
  `skills-manifest.js`
- **artifacts** — generated `myrules-*` rules, hook scripts, and `hooks.json`
  entries in projects and `~/.cursor/`; never edit by hand
- **bootstrap** — install this skill into the project before sync phrases work

## Content map

| Kind | Edit in cache | Deployed artifacts | Notes |
|------|---------------|-------------------|-------|
| Rules | `rules/user/*.md`, `rules/project/*.md` | `.cursor/rules/myrules-*.mdc`, `.claude/rules/myrules-*.md` | One topic per file; `project/` may use `agents:` frontmatter |
| Sub-agents | same sources (filtered by `agents:`) | `.cursor/agents/myrules-*.md`, `.claude/agents/myrules-*.md` | **One-way deploy** — edit cache sources, not agent files; `export` does not reverse-merge agents |
| Hooks | `hooks/user/*.js`, `hooks/project/*.js` | Cursor: `hooks.json` + `myrules-*.js`; Claude: `myrules-hook-*.md` convention docs only | See seed hooks `session-log`, `session-start-context` |
| External skills | `skills-manifest.js` | `~/.cursor/skills/<name>/`, `~/.claude/skills/<name>/` | Never list `myrules` here |
| Bootstrap skill | `skills/myrules/*` | Project `.cursor/skills/myrules/` (and `.claude/skills/myrules/`) | Via `install-skill.js` |
| Rule authoring (meta) | `rules/meta/*.md` | *(not deployed)* | Read in cache before editing `user/` / `project/` |
| Project context | — | `<project>/.myrules-context.md` | User writes per project; not synced |

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
6. Deploy project rules + project hooks + sub-agent bundles into the target project(s)
7. Append the MyRules block to the project `.gitignore` (first time only)
8. Register the project in `~/.myrules/.registry.json`

There is no separate `init` step — first sync and later updates use the same
command.

## Platform notes

- **Cursor user rules:** deployed as per-project `.cursor/rules/myrules-*.mdc`
  with `alwaysApply: true` (not Cursor Settings UI).
- **Claude user rules:** `~/.claude/rules/myrules-user-*.md`; project rules in
  `.claude/rules/myrules-*.md`.
- **Sub-agents:** three role bundles (`planner`, `implementer`, `reviewer`) from
  `rules/user/` (all) + `rules/project/` (filtered by `agents:` frontmatter).
  Agent file bodies load only when a sub-agent is delegated — they do not bloat
  the main session context. On Claude, delegated sub-agents may also load the
  same `.claude/rules/` set as the parent session (v1 accepts this duplication).
- **Hooks:** Cursor runs deployed `.js` scripts via `hooks.json`. Claude receives
  generated markdown convention files only — follow them manually; no automatic
  trigger.

## Protect — never read, write, or delete these

- `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`
- `AGENTS.md`
- Claude auto memory under `~/.claude/projects/**/memory/**`
- Any `.cursor/rules/*` or `.claude/rules/*` file that does **not** start with
  `myrules-`, unless the user has explicitly confirmed `--prune-legacy-rules`
  after reviewing a `--dry-run` list
- Do not hand-edit `.cursor/hooks.json` or `~/.cursor/hooks.json` to manage
  MyRules hooks — edit sources under `~/.myrules/hooks/` and sync instead.
  (Non-MyRules entries in those JSON files are preserved by the merge logic.)

## Safety rules

- `sync` skips (and reports) any `myrules-*` **rule or hook file** that was
  hand-edited since the last deploy, instead of overwriting it. For rules,
  suggest `export` first; for hooks, edit the source in `~/.myrules/hooks/` and
  re-sync — use `--force` only when the user explicitly wants to discard local
  edits to deployed **artifacts**.
- `export.js` reverse-maps **rules only** (not hooks or sub-agent bundles).
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
| Cache repo has uncommitted changes | Abort before `git pull`; instruct `push.js` or manual resolve |
| `git pull` not fast-forward | Abort; report conflict, do not auto-merge |
| Deployed **artifact** locally modified (drift) | Skip that file, report it; suggest `export` or `--force` |
| Transform target not writable | Fail with path and permission hint |
| Legacy rules + no prune flag | Deploy myrules only; print legacy count hint |
| Prune without matching dry-run | Refuse; instruct `--dry-run --prune-legacy-rules` |
| Legacy set changed since dry-run | Refuse; fingerprint mismatch — fresh dry-run required |
| External skill clone/update fails | Continue rules deploy; report failed skill names |
| `push` with nothing staged | No-op, not an error |
