---
name: myrules
description: Sync personal AI rules and skills from ~/.myrules/ to Cursor and Claude Code. Use when the user asks to init, sync, export, push, or prune MyRules, or says things like "sync my rules", "init my rules", or "update my rules everywhere".
---

# MyRules

NEVER deploy or edit rule files by hand. ALWAYS run the scripts in
`~/.myrules/tools/sync/`. The same command works on Windows (PowerShell) and
macOS/Linux (bash/zsh) — both expand `$HOME`, so no OS branch is needed.

## Commands

| User intent | Command |
|-------------|---------|
| Set up a new project | `node "$HOME/.myrules/tools/sync/init.js" --project "<workspace>"` |
| Sync latest rules into this project | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>"` |
| Sync every known project on this machine | `node "$HOME/.myrules/tools/sync/sync.js" --all` |
| Take over an old project's rules | 1) dry-run: `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --dry-run --prune-legacy-rules`, review the listed files, then 2) `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --prune-legacy-rules` |
| Force-overwrite a locally-edited myrules-* file | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --force` |
| See what changed locally vs the cache | `node "$HOME/.myrules/tools/sync/export.js" --project "<workspace>"` (thin CLI wrapper around `tools/sync/lib/export.js`) |
| Publish rule edits made in `~/.myrules/` | `node "$HOME/.myrules/tools/sync/push.js" -m "describe the change"` |
| Check sync status | `node "$HOME/.myrules/tools/sync/status.js" --project "<workspace>"` |

## If `~/.myrules/` does not exist yet

Ask the user for the MyRules GitHub URL (or read it from context) and run:

```
git clone <repo-url> "$HOME/.myrules"
```

Then proceed with `init.js`.

## Protect — never read, write, or delete these

- `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`
- `AGENTS.md`
- Claude auto memory under `~/.claude/projects/**/memory/**`
- Any `.cursor/rules/*` or `.claude/rules/*` file that does **not** start with `myrules-`, unless the user has explicitly confirmed `--prune-legacy-rules` after reviewing a `--dry-run` list

## Safety rules

- `sync` skips (and reports) any `myrules-*` file that was hand-edited since the last deploy, instead of overwriting it. Suggest `export` to the user in that case, rather than reflexively re-running with `--force`.
- `--prune-legacy-rules` always requires a preceding `--dry-run --prune-legacy-rules` against the *same* legacy file set. If the tool refuses, run the dry-run again and show the user the list before retrying.
- If `~/.myrules/` has uncommitted changes, `sync` refuses to pull. Tell the user to either run `push.js` first or resolve the changes manually — do not force-discard local edits in the cache repo.
