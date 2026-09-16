---
name: myrules
description: >
  Sync MyRules cache to Cursor/Claude projects. Use for bootstrap (install skill),
  arranging a repo for ordinary Agent or Cursor Projects (always includes sync),
  daily sync/export/push/prune/status, or when the user says「sync my rules」
  「同步我的规则」「同步规则」「设置 MyRules」「导入 MyRules」
  「从 GitHub 安装 MyRules」「布置普通仓库」「布置 Project 仓库」
  「按 Agent 工作法初始化」「按 Project 工作法初始化」
  「布置仓库」「布置项目工作法」「按方法论初始化」.
---

# MyRules

**Edit the cache; deploy via scripts; never hand-edit artifacts.**

| Term | Meaning |
|------|---------|
| **cache** | `~/.myrules/` — rules, hooks, method pack, `skills-manifest.js` |
| **artifacts** | Generated `myrules-*` files in projects / `~/.cursor/` — do not edit |
| **bootstrap** | Install this skill before sync/arrange phrases work |
| **runtime** | `agent` or `project` in `.myrules-runtime.json` |

Details: [`REFERENCE.md`](REFERENCE.md). Commands: [`COMMANDS.md`](COMMANDS.md).

Protect list and safety rules: [`REFERENCE.md`](REFERENCE.md#protect--never-read-write-or-delete-these).

## Three phrases

| User says | Do |
|-----------|----|
| **同步规则** / **sync my rules** / **同步我的规则** | Sync. If there is no runtime marker, **fail** and tell them to arrange first. Do not guess. |
| **布置普通仓库** / **按 Agent 工作法初始化** | `init-project-method.js --runtime agent` then it **must sync**. |
| **布置 Project 仓库** / **按 Project 工作法初始化** | `init-project-method.js --runtime project` then it **must sync**. |

Vague **「布置仓库」「布置项目工作法」「按方法论初始化」** — ask: 普通 Agent 还是 Project. Do **not** pick Agent automatically. After they pick, run the matching arrange (arrange includes sync).

**「帮我设置 MyRules」** = bootstrap (if skill missing) → ask runtime → arrange (includes sync).

Already arranged for the same runtime: refuse, tell them to sync. `--force` rewrites hosted method files only, never instance ledger/goals.

「把这个仓库改成 Project / 改成普通」: change `.myrules-runtime.json`, then sync. Instance files stay.

## Bootstrap (new project)

User says **「从 GitHub 安装 MyRules skill」**, **「导入 MyRules」**, or similar.

1. Shallow-clone `https://github.com/zhengyang497/MyRules.git` (or use an existing checkout).
2. Run `node "<clone>/tools/sync/install-skill.js" --project "<workspace>"`.
3. Remind the user to **commit** `.cursor/skills/myrules/` (and `.claude/skills/myrules/` if present).

Do **not** deploy the method pack in this step.

**Done when:** `.cursor/skills/myrules/SKILL.md` exists (and `.claude/skills/myrules/SKILL.md` when Claude is in scope).

## Sync

After the skill is loaded **and** the repo is arranged, user says **「sync my rules」** / **「同步我的规则」** / **「同步规则」**.

```text
node "$HOME/.myrules/tools/sync/sync.js" --project "<workspace>"
```

**Done when all of:**

1. `sync.js` exits 0
2. `status.js --project "<workspace>"` exits 0
3. Status JSON: `cacheDirty` is `false` (or absent/`null` if cache not yet created)
4. No drift warnings in sync output (if stderr reports skipped myrules files,
   stop and tell the user — suggest `export` or `--force` after confirmation)
5. Status JSON: `lastSyncAt` is set and recent

If `.myrules-runtime.json` is missing and the registry has no runtime (and this is not a legacy unprefixed `docs/方法/项目工作法.md` repo): **non-zero exit**. Tell them to 布置普通仓库 or 布置 Project 仓库.

## Arrange ordinary repo (`runtime=agent`)

```text
node "$HOME/.myrules/tools/sync/init-project-method.js" --runtime agent --project "<workspace>"
```

Creates the instance skeleton if missing, writes `.myrules-runtime.json`, then **syncs**.

**Done when:** runtime marker is `agent`, `docs/方法/myrules-项目工作法.md` exists, agent short rule exists, **no** coordinator "don't write code" rule, roles are planner/implementer/reviewer.

Do not tell them they must `board add` first.

## Arrange Project repo (`runtime=project`)

```text
node "$HOME/.myrules/tools/sync/init-project-method.js" --runtime project --project "<workspace>"
```

Creates empty goal shelves + ledger + merges `.cursor/environment.json` install, then **syncs**. Print the first-message file at the end.

**Done when:** coordinator charter exists, ledger schema exists, coordinator short rule exists, roles are researcher/implementer/reviewer/publisher, **no** agent "main session may write code" short rule.

## Branch routing

| User intent | Read | Done when |
|-------------|------|-----------|
| Daily sync | [`COMMANDS.md`](COMMANDS.md) → sync | Sync completion criteria above |
| 布置普通仓库 | [`COMMANDS.md`](COMMANDS.md) → init `--runtime agent` | Arrange agent criteria above (includes sync) |
| 布置 Project 仓库 | [`COMMANDS.md`](COMMANDS.md) → init `--runtime project` | Arrange project criteria above (includes sync) |
| Switch runtime | Write `.myrules-runtime.json`, then sync | Hosted files match the new runtime; instance files remain |
| Edit cache content | Read `~/.myrules/rules/meta/authoring.md`, then [`REFERENCE.md`](REFERENCE.md) content map + [`COMMANDS.md`](COMMANDS.md) push + sync | `push.js` exit 0 + sync criteria |
| Local artifact edits | [`COMMANDS.md`](COMMANDS.md) → export or `--force` | User confirms before `--force` |
| Take over legacy rules | [`COMMANDS.md`](COMMANDS.md) → prune (dry-run first) | Dry-run fingerprint matches before real prune |
| Check status | [`COMMANDS.md`](COMMANDS.md) → status | Show status JSON to user |
