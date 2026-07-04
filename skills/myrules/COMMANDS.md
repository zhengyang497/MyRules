# MyRules Commands

The same `node` commands work on Windows (PowerShell) and macOS/Linux (bash/zsh).
Both expand `$HOME`. On Windows, quote paths that contain spaces, e.g.
`node "D:\llm wiki\MyRules\tools\sync\sync.js" --project "<workspace>"`.

Scripts live in `~/.myrules/tools/sync/` when the **cache** exists, or in a
MyRules repo clone / shallow clone otherwise.

| User intent | Command |
|-------------|---------|
| Import / install MyRules skill from GitHub (**bootstrap** step 1) | `node "<myrules-clone>/tools/sync/install-skill.js" --project "<workspace>"` |
| Sync into this project (rules + hooks + external skills) | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>"` — or `node "<myrules-clone>/tools/sync/sync.js" --project "<workspace>"` when `~/.myrules/` does not exist yet |
| Sync every registered project on this machine | `node "$HOME/.myrules/tools/sync/sync.js" --all` |
| Take over an old project's rules | 1) dry-run: `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --dry-run --prune-legacy-rules`, review the listed files, then 2) `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --prune-legacy-rules` |
| Force-overwrite locally-edited myrules-* rules or hook scripts | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --force` |
| See which **rules** were edited locally vs the cache | `node "$HOME/.myrules/tools/sync/export.js" --project "<workspace>"` |
| Publish edits made in `~/.myrules/` (rules, hooks, manifest) | `node "$HOME/.myrules/tools/sync/push.js" -m "describe the change"` |
| Check sync status (includes hook counts) | `node "$HOME/.myrules/tools/sync/status.js" --project "<workspace>"` |

`status.js` prints JSON including `projectHooksDeployed`, `userHooksDeployed`,
`cacheDirty`, `lastSyncAt`, and per-project sync state.

`init.js` is a deprecated alias for `sync.js` — use `sync.js` only.
