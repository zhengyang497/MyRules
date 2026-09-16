# MyRules

Personal AI **rules**, **Cursor hooks**, and an **external skill subscription
list**, synced across devices, platforms (Cursor + Claude), and projects via
this GitHub repo.

Content lives in `~/.myrules/` (a clone of this repo). `sync.js` deploys
generated artifacts into each project and into `~/.cursor/` / `~/.claude/` —
those outputs are not the source of truth.

Each sync writes channels from the same cache sources:

- **Rules** — `rules/user/` + `rules/project/` → `.cursor/rules/` and
  `.claude/rules/` (always loaded in the main session). Files with `runtimes:`
  frontmatter stay in role bundles only.
- **Sub-agents** — filtered by `agents:` and `.myrules-runtime.json`.
  `agent`: planner / implementer / reviewer. `project`: researcher /
  implementer / reviewer / publisher.
- **Method pack** — `method/` → `docs/方法/myrules-*.md`, method short rules,
  `project-method` skill, hosted board scripts. Updated every sync.

## What gets synced

MyRules manages **rules**, **hooks**, **method pack**, and **external skill
subscriptions** in the cache (`~/.myrules/`), then deploys generated files into
each project and into `~/.cursor/` / `~/.claude/`.

Full content map (sources, deploy targets, and notes):
[`skills/myrules/REFERENCE.md`](skills/myrules/REFERENCE.md).

**Separate from the hosted pack:**

- **`skills/myrules/`** — bootstrap skill copied into each project by
  `install-skill.js` (not listed in `skills-manifest.js`).
- **`<project>/.myrules-runtime.json`** — `agent` or `project`. Commit it.
- **`<project>/.myrules-context.md`**, `docs/能力/**`, board/ledger instance
  files — the project's own books. Sync never overwrites them.

Copy-once `templates/project-method/` is abolished. Method files live in
`method/` and are deployed by sync.

## First use in a project

### Step 1 — Import MyRules skill

Ask the Agent:

> **「从 GitHub 安装 MyRules skill」**  
> **「导入 MyRules，仓库是 zhengyang497/MyRules」**

```sh
node "<clone>/tools/sync/install-skill.js" --project "<workspace>"
```

**Commit** `.cursor/skills/myrules/` (and `.claude/skills/myrules/` when
applicable).

### Step 2 — Arrange (picks a runtime and syncs)

> **「布置普通仓库」** — ordinary Agent, main session may write code  
> **「布置 Project 仓库」** — Cursor Projects coordinator (the Project seat, not every local session), default 探路

Vague **「布置仓库」** / **「布置项目工作法」** / **「按方法论初始化」** must
ask which runtime. Do not default to agent.

Arrange writes `.myrules-runtime.json` and empty instance shelves, then runs
sync.

### Step 3 — Daily sync

> **「sync my rules」** / **「同步规则」**

Fails until the repo is arranged. After that, the same phrase updates rules,
hooks, role packs, and the hosted method pack.

If the user says **「帮我设置 MyRules」**, bootstrap (if needed) then ask
runtime then arrange.

See [`skills/myrules/SKILL.md`](skills/myrules/SKILL.md) for the agent-oriented
workflow.

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
