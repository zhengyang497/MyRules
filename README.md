# MyRules

Personal AI **rules**, **Cursor hooks**, and an **external skill subscription
list**, synced across devices, platforms (Cursor + Claude), and projects via
this GitHub repo.

Content lives in `~/.myrules/` (a clone of this repo). `sync.js` deploys
generated artifacts into each project and into `~/.cursor/` / `~/.claude/` —
those outputs are not the source of truth.

## What gets synced

| Content | Source in `~/.myrules/` | Deploy target |
|---------|-------------------------|---------------|
| Rules | `rules/user/`, `rules/project/` (Markdown) | `.cursor/rules/myrules-*`, `.claude/rules/myrules-*` |
| Hooks | `hooks/user/`, `hooks/project/` (Node.js) | Cursor: `hooks.json` + `myrules-*.js` scripts. Claude: prose convention docs only |
| External skills | `skills-manifest.js` (git URL list) | `~/.cursor/skills/<name>/`, `~/.claude/skills/<name>/` |

**Separate from the above:**

- **`skills/myrules/SKILL.md`** — bootstrap skill copied into each project by
  `install-skill.js` (not listed in `skills-manifest.js`).
- **`<project>/.myrules-context.md`** — optional per-project file for the
  `session-start-context` hook; you write it in each project yourself.

## First use in a project

MyRules uses **two steps**. Step 1 must happen before the Agent understands
phrases like「sync my rules」.

### Step 1 — Import MyRules skill (natural language)

Ask the Agent:

> **「从 GitHub 安装 MyRules skill」**  
> **「导入 MyRules，仓库是 zhengyang497/MyRules」**

Do **not** start with「sync my rules」— without the skill, Agent does not know
that command.

The Agent should shallow-clone this repo and run:

```sh
node "<clone>/tools/sync/install-skill.js" --project "<workspace>"
```

This only installs `.cursor/skills/myrules/` (and `.claude/skills/myrules/` when
applicable). **Commit** those paths to git so teammates share the same Agent
entry.

### Step 2 — Sync (first time and every time after)

After the skill is in the project, ask the Agent:

> **「sync my rules」**  
> **「同步我的规则」**

The Agent runs `sync.js` (from `~/.myrules/` if it exists, otherwise from the
same GitHub clone used in step 1). That clones `~/.myrules/` when missing,
pulls latest, updates external skills, deploys rules and hooks, and registers
the project. The same phrase covers the first deploy and all later updates.

If the user says **「帮我设置 MyRules」** in one sentence, the Agent should still
do step 1 then step 2 in order.

See `skills/myrules/SKILL.md` for the full agent-oriented command reference.

## Commands

The same `node` invocations work on Windows (PowerShell) and macOS/Linux
(bash/zsh) — both expand `$HOME`. Quote paths that contain spaces.

| User intent | Command |
|-------------|---------|
| Import MyRules skill into a project (step 1) | `node "<myrules-clone>/tools/sync/install-skill.js" --project "<workspace>"` |
| Sync into a project (rules + hooks + external skills) | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>"` — or from a clone when `~/.myrules/` does not exist yet |
| Sync every known project on this machine | `node "$HOME/.myrules/tools/sync/sync.js" --all` |
| Take over an old project's rules | 1) dry-run: `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --dry-run --prune-legacy-rules`, review the listed files, then 2) `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --prune-legacy-rules` |
| Force-overwrite a locally-edited myrules-* rule or hook file | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --force` |
| See what **rules** changed locally vs the cache | `node "$HOME/.myrules/tools/sync/export.js" --project "<workspace>"` |
| Publish edits made in `~/.myrules/` | `node "$HOME/.myrules/tools/sync/push.js" -m "describe the change"` |
| Check sync status (includes hook counts) | `node "$HOME/.myrules/tools/sync/status.js" --project "<workspace>"` |

## Edit content

All editable sources live under `~/.myrules/` (or this repo if you develop
directly in the cache — see below).

| Goal | Edit |
|------|------|
| Personal rules | `rules/user/*.md` |
| Project rule template | `rules/project/*.md` |
| User-level hooks (all projects) | `hooks/user/*.js` |
| Project-level hooks | `hooks/project/*.js` |
| External skill subscriptions | `skills-manifest.js` |

Workflow: edit → `node tools/sync/push.js -m "..."` → on other machines
`node tools/sync/sync.js --all` (or `--project <dir>`).

**Hooks:** Cursor executes deployed scripts automatically. Claude gets markdown
convention files only (no automatic trigger). Seed examples:
`hooks/project/session-start-context.js`, `hooks/user/session-log.js`.

**External skills:** add `{ name, repo, ref }` to `skills-manifest.js`. Do not
include `myrules` — that skill is installed per project via step 1.

**Project context file:** optional `.myrules-context.md` at a project root for
session-start context injection.

## Developing MyRules itself

The simplest way to develop this repo without hitting Windows symlink
permission issues: clone it directly to the cache location instead of
maintaining a separate checkout.

```sh
# instead of a separate dev checkout + symlink to ~/.myrules,
# just develop directly where sync expects the cache to live:
git clone git@github.com:zhengyang497/MyRules.git "$HOME/.myrules"
cd "$HOME/.myrules"
node --test tests/
```

Push from there as usual (`node tools/sync/push.js -m "..."`) — no symlink,
no admin rights, no Developer Mode required.

After changing `skills/myrules/SKILL.md`, re-run `install-skill.js` in projects
that should pick up the updated agent instructions (or copy the file manually).

Manual hooks verification guide:
`docs/superpowers/manual-verification/2026-07-04-hooks-task13-agent-guide.md`
