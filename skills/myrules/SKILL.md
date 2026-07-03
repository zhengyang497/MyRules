---
name: myrules
description: Sync personal AI rules and skills from ~/.myrules/ to Cursor and Claude Code. Use when the user asks to sync, export, push, or prune MyRules, or says things like "sync my rules", "set up MyRules", or "update my rules everywhere".
---

# MyRules

NEVER deploy or edit rule files by hand. ALWAYS run the scripts in
`~/.myrules/tools/sync/` (or from a MyRules repo checkout / shallow clone).
The same command works on Windows (PowerShell) and macOS/Linux (bash/zsh) — both
expand `$HOME`, so no OS branch is needed.

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

`install-skill.js` only installs this skill file into the project. It does **not**
clone `~/.myrules/` or deploy rules.

### Step 2 — Sync rules (first time and every time after)

After the skill is loaded, the user says **「sync my rules」** or **「同步我的
规则」**.

Run **one** of these (same script, same behavior):

| Situation | Command |
|-----------|---------|
| `~/.myrules/` already exists | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>"` |
| First sync, cache not cloned yet | `node "<clone>/tools/sync/sync.js" --project "<workspace>"` (reuse the step-1 clone, or shallow-clone again) |

`sync.js` clones `~/.myrules/` from GitHub when missing, then deploys rules and
registers the project. The same user phrase covers the first deploy and all later
updates — there is no separate `init` step.

`init.js` is a deprecated alias for `sync.js` (backward compatibility only).

### Optional one sentence

If the user says **「帮我设置 MyRules」** in one breath, Agent should still do
**step 1 then step 2** in order — import the skill first, then run `sync.js`.

## Commands (skill already installed)

| User intent | Command |
|-------------|---------|
| Import / install MyRules skill from GitHub (step 1) | `node "<myrules-clone>/tools/sync/install-skill.js" --project "<workspace>"` |
| Sync rules into this project (first time or update) | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>"` — or `node "<myrules-clone>/tools/sync/sync.js" --project "<workspace>"` when `~/.myrules/` does not exist yet |
| Sync every known project on this machine | `node "$HOME/.myrules/tools/sync/sync.js" --all` |
| Take over an old project's rules | 1) dry-run: `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --dry-run --prune-legacy-rules`, review the listed files, then 2) `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --prune-legacy-rules` |
| Force-overwrite a locally-edited myrules-* file | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --force` |
| See what changed locally vs the cache | `node "$HOME/.myrules/tools/sync/export.js" --project "<workspace>"` |
| Publish rule edits made in `~/.myrules/` | `node "$HOME/.myrules/tools/sync/push.js" -m "describe the change"` |
| Check sync status | `node "$HOME/.myrules/tools/sync/status.js" --project "<workspace>"` |

## Protect — never read, write, or delete these

- `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`
- `AGENTS.md`
- Claude auto memory under `~/.claude/projects/**/memory/**`
- Any `.cursor/rules/*` or `.claude/rules/*` file that does **not** start with `myrules-`, unless the user has explicitly confirmed `--prune-legacy-rules` after reviewing a `--dry-run` list

## Safety rules

- `sync` skips (and reports) any `myrules-*` file that was hand-edited since the last deploy, instead of overwriting it. Suggest `export` to the user in that case, rather than reflexively re-running with `--force`.
- `--prune-legacy-rules` always requires a preceding `--dry-run --prune-legacy-rules` against the *same* legacy file set. If the tool refuses, run the dry-run again and show the user the list before retrying.
- If `~/.myrules/` has uncommitted changes, `sync` refuses to pull. Tell the user to either run `push.js` first or resolve the changes manually — do not force-discard local edits in the cache repo.
