# MyRules

Personal AI rules (preferences, prohibitions, output standards, testing/behavior
requirements) and a skill manifest, synced across devices, platforms
(Cursor + Claude), and projects via this GitHub repo.

## First use in a project

MyRules uses **two steps**. Step 1 must happen before the Agent understands
phrases like「init my rules」.

### Step 1 — Import MyRules skill (natural language)

Ask the Agent:

> **「从 GitHub 安装 MyRules skill」**  
> **「导入 MyRules，仓库是 zhengyang497/MyRules」**

Do **not** start with「init my rules」— without the skill, Agent does not know
that command.

The Agent should shallow-clone this repo and run:

```sh
node "<clone>/tools/sync/install-skill.js" --project "<workspace>"
```

This only installs `.cursor/skills/myrules/` (and `.claude/skills/myrules/` when
applicable). **Commit** those paths to git so teammates share the same Agent
entry.

### Step 2 — Init rules (MyRules commands)

After the skill is in the project, ask the Agent:

> **「init my rules」**  
> **「初始化我的规则」**

The Agent runs `init.js`, which clones `~/.myrules/` if needed, deploys rules,
and registers the project.

If the user says **「帮我设置 MyRules」** in one sentence, the Agent should still
do step 1 then step 2 in order.

See `skills/myrules/SKILL.md` for the full agent-oriented command reference.

## Commands

The same `node` invocations work on Windows (PowerShell) and macOS/Linux
(bash/zsh) — both expand `$HOME`.

| User intent | Command |
|-------------|---------|
| Import MyRules skill into a project (step 1) | `node "<myrules-clone>/tools/sync/install-skill.js" --project "<workspace>"` |
| Init rules in a project (step 2) | `node "$HOME/.myrules/tools/sync/init.js" --project "<workspace>"` |
| Sync latest rules into this project | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>"` |
| Sync every known project on this machine | `node "$HOME/.myrules/tools/sync/sync.js" --all` |
| Take over an old project's rules | 1) dry-run: `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --dry-run --prune-legacy-rules`, review the listed files, then 2) `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --prune-legacy-rules` |
| Force-overwrite a locally-edited myrules-* file | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --force` |
| See what changed locally vs the cache | `node "$HOME/.myrules/tools/sync/export.js" --project "<workspace>"` |
| Publish rule edits made in `~/.myrules/` | `node "$HOME/.myrules/tools/sync/push.js" -m "describe the change"` |
| Check sync status | `node "$HOME/.myrules/tools/sync/status.js" --project "<workspace>"` |

## Edit rules

Edit files under `rules/user/` or `rules/project/` in this repo, then run
`node tools/sync/push.js`. Other machines pick up the change with
`node tools/sync/sync.js --all` (or per-project `--project <dir>`).

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
