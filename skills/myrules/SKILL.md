---
name: myrules
description: Sync personal AI rules, Cursor hooks, and external skill subscriptions from ~/.myrules/ to Cursor and Claude Code. Use when the user asks to sync, export, push, or prune MyRules, or says things like "sync my rules", "set up MyRules", or "update my rules everywhere".
---

# MyRules

NEVER deploy or edit MyRules-managed rule or hook files by hand in consumer
projects. ALWAYS run the scripts in `~/.myrules/tools/sync/` (or from a MyRules
repo checkout / shallow clone).

The same `node` commands work on Windows (PowerShell) and macOS/Linux (bash/zsh).
Both expand `$HOME`. On Windows, quote paths that contain spaces, e.g.
`node "D:\llm wiki\MyRules\tools\sync\sync.js" --project "<workspace>"`.

## What MyRules manages

MyRules keeps **three kinds of content** in the cache repo (`~/.myrules/`). All
are edited there, published with `push.js`, and deployed with `sync.js`.

| Kind | Edit in cache (`~/.myrules/`) | Deployed to (generated — do not treat as source) |
|------|-------------------------------|--------------------------------------------------|
| **Rules** | `rules/user/*.md`, `rules/project/*.md` | `.cursor/rules/myrules-*.mdc`, `.claude/rules/myrules-*.md` |
| **Hooks** | `hooks/user/*.js`, `hooks/project/*.js` | Cursor: `hooks.json` + `.cursor/hooks/myrules-*.js` (project) or `~/.cursor/hooks/` (user). Claude: prose docs `myrules-hook-*.md` in rules dirs (convention only — no auto execution) |
| **External skills** | `skills-manifest.js` (git refs list) | `~/.cursor/skills/<name>/`, `~/.claude/skills/<name>/` |

**Not in the cache repo:**

- **`skills/myrules/SKILL.md`** — this bootstrap skill; installed per project via
  `install-skill.js` into `.cursor/skills/myrules/` (and `.claude/skills/myrules/`).
  Do **not** list `myrules` in `skills-manifest.js`.
- **`<project>/.myrules-context.md`** — optional per-project context file read by
  the `session-start-context` hook (user writes it in each project; MyRules does
  not sync or gitignore it).

## What `sync.js` does

On each run (for one project or `--all`):

1. Ensures `~/.myrules/` exists (clone from GitHub if missing)
2. Refuses to pull if the cache repo is dirty (uncommitted or untracked files not
   covered by `.gitignore`) — see Safety rules
3. `git pull --ff-only` in the cache
4. Clone/update **external skills** listed in `skills-manifest.js`
5. Deploy **user-level hooks** once per run (to `~/.cursor/hooks/`)
6. Deploy **project rules + project hooks** into the target project(s)
7. Append the MyRules block to the project `.gitignore` (first time only)
8. Register the project in `~/.myrules/.registry.json`

There is no separate `init` step — first sync and later updates use the same
command. `init.js` is a deprecated alias for `sync.js`.

## First use in a project (two steps)

MyRules-specific phrases like **「sync my rules」** only work **after** this skill
is installed in the project. On a brand-new project, follow both steps in order.

### Step 1 — Import MyRules from GitHub (natural language)

The user says something like **「从 GitHub 安装 MyRules skill」** or **「导入
MyRules」**. They should **not** say「sync my rules」yet — without this skill,
Agent does not know that phrase.

Agent actions (no `~/.myrules` required):

1. Shallow-clone `https://github.com/zhengyang497/MyRules.git` (or use an
   existing checkout).
2. Run:
   `node "<clone>/tools/sync/install-skill.js" --project "<workspace>"`
3. Remind the user to **commit** `.cursor/skills/myrules/` (and
   `.claude/skills/myrules/` if present) to git.

`install-skill.js` only copies this skill into the project. It does **not** clone
`~/.myrules/` or deploy rules, hooks, or external skills.

### Step 2 — Sync (first time and every time after)

After the skill is loaded, the user says **「sync my rules」** or **「同步我的
规则」** (same phrase for rules, hooks, and external skills).

Run **one** of these (same script, same behavior):

| Situation | Command |
|-----------|---------|
| `~/.myrules/` already exists | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>"` |
| First sync, cache not cloned yet | `node "<clone>/tools/sync/sync.js" --project "<workspace>"` (reuse the step-1 clone, or shallow-clone again) |

### Optional one sentence

If the user says **「帮我设置 MyRules」** in one breath, Agent should still do
**step 1 then step 2** in order — import the skill first, then run `sync.js`.

## Commands (skill already installed)

| User intent | Command |
|-------------|---------|
| Import / install MyRules skill from GitHub (step 1) | `node "<myrules-clone>/tools/sync/install-skill.js" --project "<workspace>"` |
| Sync into this project (rules + hooks + external skills) | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>"` — or `node "<myrules-clone>/tools/sync/sync.js" --project "<workspace>"` when `~/.myrules/` does not exist yet |
| Sync every registered project on this machine | `node "$HOME/.myrules/tools/sync/sync.js" --all` |
| Take over an old project's rules | 1) dry-run: `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --dry-run --prune-legacy-rules`, review the listed files, then 2) `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --prune-legacy-rules` |
| Force-overwrite locally-edited myrules-* rules or hook scripts | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --force` |
| See which **rules** were edited locally vs the cache | `node "$HOME/.myrules/tools/sync/export.js" --project "<workspace>"` |
| Publish edits made in `~/.myrules/` (rules, hooks, manifest) | `node "$HOME/.myrules/tools/sync/push.js" -m "describe the change"` |
| Check sync status (includes hook counts) | `node "$HOME/.myrules/tools/sync/status.js" --project "<workspace>"` |

`status.js` prints JSON including `projectHooksDeployed`, `userHooksDeployed`,
`cacheDirty`, and per-project sync state.

## Edit content (in `~/.myrules/`)

1. Edit source files (see table below).
2. Run `node "$HOME/.myrules/tools/sync/push.js" -m "..."` to publish to GitHub.
3. Run `sync.js --project "<workspace>"` or `--all` on each machine to deploy.

| Goal | Where to edit |
|------|----------------|
| Personal rules (all projects) | `rules/user/*.md` — one topic per file |
| Project rule template (every synced project) | `rules/project/*.md` |
| User-level Cursor hook (all projects) | `hooks/user/*.js` — exports `meta` + `handle` |
| Project-level Cursor hook | `hooks/project/*.js` |
| Subscribe to external Agent skills | `skills-manifest.js` — `{ name, repo, ref }` entries only; never include `myrules` |
| Per-project session context (optional) | Write `<project>/.myrules-context.md` in that project (not in the cache repo) |

**Adding a new rule:** create `rules/user/topic.md` or `rules/project/topic.md`,
push, sync.

**Adding a new hook:** create `hooks/user/name.js` or `hooks/project/name.js`
following the existing seed hooks (`session-log`, `session-start-context`), push,
sync. Removing a hook source file removes its deployed script and `hooks.json`
entry on the next sync.

**Hooks on Cursor vs Claude:** Cursor runs deployed `.js` scripts via
`hooks.json`. Claude receives a generated markdown convention file only — the
Agent should follow it manually; there is no automatic trigger.

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
  edits to deployed artifacts.
- `export.js` reverse-maps **rules only** (not hooks).
- `--prune-legacy-rules` always requires a preceding `--dry-run
  --prune-legacy-rules` against the *same* legacy file set. If the tool refuses,
  run the dry-run again and show the user the list before retrying.
- If `~/.myrules/` has uncommitted changes, `sync` refuses to pull. Tell the user
  to run `push.js` first or resolve changes manually — do not force-discard
  local edits in the cache repo. Machine-local state files (`.registry.json`,
  `.user-hooks-state.json`) must stay gitignored in the cache; if untracked
  copies block sync, add them to `~/.myrules/.gitignore` (they ship in the repo
  template) rather than committing them.
