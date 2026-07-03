---
name: myrules
description: Sync personal AI rules and skills from ~/.myrules/ to Cursor and Claude Code. Use when the user asks to init, sync, export, push, or prune MyRules, or says things like "sync my rules", "init my rules", "set up MyRules", or "update my rules everywhere".
---

# MyRules

NEVER deploy or edit rule files by hand. ALWAYS run the scripts in
`~/.myrules/tools/sync/`. The same command works on Windows (PowerShell) and
macOS/Linux (bash/zsh) — both expand `$HOME`, so no OS branch is needed.

## Commands

| User intent | Command |
|-------------|---------|
| **First-time / set up MyRules** (project skill not installed yet is OK) | `node "$HOME/.myrules/tools/sync/init.js" --project "<workspace>"` (or `bootstrap.js` — same behavior) |
| Set up / init this project | `node "$HOME/.myrules/tools/sync/init.js" --project "<workspace>"` |
| Sync latest rules into this project | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>"` |
| Sync every known project on this machine | `node "$HOME/.myrules/tools/sync/sync.js" --all` |
| Take over an old project's rules | 1) dry-run: `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --dry-run --prune-legacy-rules`, review the listed files, then 2) `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --prune-legacy-rules` |
| Force-overwrite a locally-edited myrules-* file | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --force` |
| See what changed locally vs the cache | `node "$HOME/.myrules/tools/sync/export.js" --project "<workspace>"` |
| Publish rule edits made in `~/.myrules/` | `node "$HOME/.myrules/tools/sync/push.js" -m "describe the change"` |
| Check sync status | `node "$HOME/.myrules/tools/sync/status.js" --project "<workspace>"` |

`init.js` automatically: clones `~/.myrules/` if missing, installs this skill into `.cursor/skills/myrules/` (and `.claude/skills/myrules/` when applicable), deploys rules, and registers the project. **Do not hand-copy SKILL.md** — always use `init.js`.

## If `~/.myrules/` does not exist yet (pre-skill fallback)

When this skill is **not** yet loaded in the project and the user asks to set up MyRules:

1. Clone: `git clone https://github.com/zhengyang497/MyRules.git "$HOME/.myrules"` (or read `manifest.repo` from the repo if you have a checkout)
2. Run: `node "$HOME/.myrules/tools/sync/init.js" --project "<workspace>"`

Step 2 installs this skill file into the project and deploys rules. After that, normal skill-driven commands apply.

When `init` installs the skill for the first time, remind the user to **commit** `.cursor/skills/myrules/` (and `.claude/skills/myrules/` if present) to git so teammates get the same Agent entry.

## Protect — never read, write, or delete these

- `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`
- `AGENTS.md`
- Claude auto memory under `~/.claude/projects/**/memory/**`
- Any `.cursor/rules/*` or `.claude/rules/*` file that does **not** start with `myrules-`, unless the user has explicitly confirmed `--prune-legacy-rules` after reviewing a `--dry-run` list

## Safety rules

- `sync` skips (and reports) any `myrules-*` file that was hand-edited since the last deploy, instead of overwriting it. Suggest `export` to the user in that case, rather than reflexively re-running with `--force`.
- `--prune-legacy-rules` always requires a preceding `--dry-run --prune-legacy-rules` against the *same* legacy file set. If the tool refuses, run the dry-run again and show the user the list before retrying.
- If `~/.myrules/` has uncommitted changes, `sync` refuses to pull. Tell the user to either run `push.js` first or resolve the changes manually — do not force-discard local edits in the cache repo.
