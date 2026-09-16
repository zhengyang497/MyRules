# MyRules Commands

The same `node` commands work on Windows (PowerShell) and macOS/Linux (bash/zsh).
Both expand `$HOME`. On Windows, quote paths that contain spaces, e.g.
`node "D:\llm wiki\MyRules\tools\sync\sync.js" --project "<workspace>"`.

Scripts live in `~/.myrules/tools/sync/` when the **cache** exists, or in a
MyRules repo clone / shallow clone otherwise.

| User intent | Command |
|-------------|---------|
| Import / install MyRules skill from GitHub (**bootstrap**) | `node "<myrules-clone>/tools/sync/install-skill.js" --project "<workspace>"` |
| 布置普通仓库 / 按 Agent 工作法初始化 | `node "$HOME/.myrules/tools/sync/init-project-method.js" --runtime agent --project "<workspace>"` — ends with sync. Same runtime already arranged: refuse unless `--force` (hosted method pack only; never overwrite instance files) |
| 布置 Project 仓库 / 按 Project 工作法初始化 | `node "$HOME/.myrules/tools/sync/init-project-method.js" --runtime project --project "<workspace>"` — ends with sync |
| 布置仓库 / 布置项目工作法 / 按方法论初始化 | **Ask** 普通 Agent or Project. Do not default. Then run the matching `--runtime` command |
| Sync into this project (rules + agents + hooks + method pack) | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>"` — fails if there is no runtime marker |
| Refresh external skills from GitHub (then keep local copies if fetch fails) | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --update-skills` |
| Sync every registered project on this machine | `node "$HOME/.myrules/tools/sync/sync.js" --all` — each project uses its own runtime |
| Take over an old project's rules | 1) dry-run: `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --dry-run --prune-legacy-rules`, review the listed files, then 2) `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --prune-legacy-rules` |
| Force-overwrite locally-edited myrules-* rules or hook scripts | `node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>" --force` |
| See which **rules** were edited locally vs the cache | `node "$HOME/.myrules/tools/sync/export.js" --project "<workspace>"` |
| Publish edits made in `~/.myrules/` (rules, hooks, method pack, manifest) | `node "$HOME/.myrules/tools/sync/push.js" -m "describe the change"` |
| Check sync status (includes hook counts) | `node "$HOME/.myrules/tools/sync/status.js" --project "<workspace>"` |

`status.js` prints JSON including `projectHooksDeployed`, `userHooksDeployed`,
`agentsDeployed`, `agentHashes` (per role), `cacheDirty`, `lastSyncAt`, and
per-project sync state.

`init.js` is a deprecated alias for `sync.js` — use `sync.js` only.
Copy-once project-method templates are **gone**. Method files are hosted and
updated by sync.
