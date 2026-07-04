# MyRules

Personal AI **rules**, **Cursor hooks**, and an **external skill subscription
list**, synced across devices, platforms (Cursor + Claude), and projects via
this GitHub repo.

Content lives in `~/.myrules/` (a clone of this repo). `sync.js` deploys
generated artifacts into each project and into `~/.cursor/` / `~/.claude/` —
those outputs are not the source of truth.

## What gets synced

MyRules manages **rules**, **hooks**, and **external skill subscriptions** in
the cache (`~/.myrules/`), then deploys generated files into each project and
into `~/.cursor/` / `~/.claude/`.

Full content map (sources, deploy targets, and notes):
[`skills/myrules/REFERENCE.md`](skills/myrules/REFERENCE.md).

**Separate from the sync bundle:**

- **`skills/myrules/`** — bootstrap skill copied into each project by
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

This installs `.cursor/skills/myrules/` (and `.claude/skills/myrules/` when
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

See [`skills/myrules/SKILL.md`](skills/myrules/SKILL.md) for the agent-oriented
workflow (bootstrap steps, completion criteria, branch routing).

## Commands

See [`skills/myrules/COMMANDS.md`](skills/myrules/COMMANDS.md) for the full
command table (`install-skill`, `sync`, `export`, `push`, `status`, prune, and
force).

The same `node` invocations work on Windows (PowerShell) and macOS/Linux
(bash/zsh) — both expand `$HOME`. Quote paths that contain spaces.

## Edit content

All editable sources live under `~/.myrules/` (or this repo if you develop
directly in the cache — see below).

See [`skills/myrules/REFERENCE.md`](skills/myrules/REFERENCE.md) for the content
map and edit workflow (rules, hooks, `skills-manifest.js`, project context).

Workflow summary: edit in cache → `push.js` → `sync.js --all` or
`sync.js --project <dir>` on each machine.

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

After changing `skills/myrules/`, re-run `install-skill.js` in projects that
should pick up the updated agent instructions.

Manual hooks verification guide:
`docs/superpowers/manual-verification/2026-07-04-hooks-task13-agent-guide.md`
