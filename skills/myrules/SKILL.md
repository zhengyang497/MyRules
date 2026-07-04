---
name: myrules
description: >
  Sync MyRules cache to Cursor/Claude projects. Use for bootstrap (install skill then sync),
  sync/export/push/prune/status, or when the user says「sync my rules」「同步我的规则」
  「设置 MyRules」「导入 MyRules」「从 GitHub 安装 MyRules」.
---

# MyRules

**Edit the cache; deploy via scripts; never hand-edit artifacts.**

| Term | Meaning |
|------|---------|
| **cache** | `~/.myrules/` — rules, hooks, `skills-manifest.js` |
| **artifacts** | Generated `myrules-*` files in projects / `~/.cursor/` — do not edit |
| **bootstrap** | Install this skill before sync phrases work |

Details: [`REFERENCE.md`](REFERENCE.md). Commands: [`COMMANDS.md`](COMMANDS.md).

Protect list and safety rules: [`REFERENCE.md`](REFERENCE.md#protect--never-read-write-or-delete-these).

## Bootstrap (new project)

Phrases like **「sync my rules」** only work **after** this skill is in the
project. On a brand-new project, run both steps in order.

### Step 1 — bootstrap: install skill

User says **「从 GitHub 安装 MyRules skill」**, **「导入 MyRules」**, or similar.
They should **not** say「sync my rules」yet.

1. Shallow-clone `https://github.com/zhengyang497/MyRules.git` (or use an
   existing checkout).
2. Run `node "<clone>/tools/sync/install-skill.js" --project "<workspace>"`.
3. Remind the user to **commit** `.cursor/skills/myrules/` (and
   `.claude/skills/myrules/` if present).

`~/.myrules/` is **not** required for this step. `install-skill.js` copies this
skill directory only — it does not deploy rules, hooks, or external skills.

**Done when:** `.cursor/skills/myrules/SKILL.md` exists (and
`.claude/skills/myrules/SKILL.md` when Claude is in scope).

### Step 2 — sync

After the skill is loaded, user says **「sync my rules」** or **「同步我的规则」**.

Run one command from [`COMMANDS.md`](COMMANDS.md) (sync row), then verify:

**Done when all of:**

1. `sync.js` exits 0
2. `status.js --project "<workspace>"` exits 0
3. Status JSON: `cacheDirty` is `false` (or absent/`null` if cache not yet created)
4. No drift warnings in sync output (if stderr reports skipped myrules files,
   stop and tell the user — suggest `export` or `--force` after confirmation)
5. Status JSON: `lastSyncAt` is set and recent

### One-shot setup

If the user says **「帮我设置 MyRules」**, still do **step 1 then step 2** in
order.

## Branch routing

| User intent | Read | Done when |
|-------------|------|-----------|
| Daily sync | [`COMMANDS.md`](COMMANDS.md) → sync | Sync completion criteria above |
| Edit cache content | Read `~/.myrules/rules/meta/authoring.md`, then [`REFERENCE.md`](REFERENCE.md) content map + [`COMMANDS.md`](COMMANDS.md) push + sync | `push.js` exit 0 + sync criteria |
| Local artifact edits | [`COMMANDS.md`](COMMANDS.md) → export or `--force` | User confirms before `--force` |
| Take over legacy rules | [`COMMANDS.md`](COMMANDS.md) → prune (dry-run first) | Dry-run fingerprint matches before real prune |
| Check status | [`COMMANDS.md`](COMMANDS.md) → status | Show status JSON to user |
