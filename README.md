# MyRules

Personal AI rules (preferences, prohibitions, output standards, testing/behavior
requirements) and a skill manifest, synced across devices, platforms
(Cursor + Claude), and projects via this GitHub repo.

## Setup on a new machine

```sh
git clone https://github.com/zhengyang497/MyRules.git ~/.myrules
```

## Use in a project

Copy `skills/myrules/` into the project's `.cursor/skills/myrules/` (and
`.claude/skills/myrules/` if using Claude there), then ask the agent to
"init my rules". See `skills/myrules/SKILL.md` for the full command
reference.

## Edit rules

Edit files under `rules/user/` or `rules/project/` in this repo, then run
`node tools/sync/push.js`. Other machines pick up the change with
`node tools/sync/sync.js --all` (or per-project `--project <dir>`).
