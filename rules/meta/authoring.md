# MyRules rule authoring

How to write, prune, and merge rules in the **cache**. This file does **not**
sync to consumer projects - read it when editing `~/.myrules/rules/`.

Formal deployable rules live only in `rules/user/*.md` and `rules/project/*.md`.
Drafts live in `rules/staging/`.

## Golden test (keep or delete)

For every line you add or keep, ask:

> If I delete this line, is the agent **more likely to make a mistake**?

- **Yes** -> keep.
- **No** -> delete. It only competes for attention with rules that matter.

Anthropic's warning applies here too: bloated rule files cause agents to ignore
the instructions that actually matter.

## Stricter standard (after real failures)

Prefer Addy Osmani's bar over guessing:

- **Add** a constraint only after a **real agent failure** you have seen.
- **Remove** a constraint only when the model is strong enough that the rule
  seems redundant.
- In a mature file, **every line should trace to a mistake that actually happened**.

"Preventive" rules for imagined failures usually add noise. Exception: catastrophic,
irreversible outcomes (e.g. deleting unrecoverable data) - prefer **Sensors**
(automatic checks) over guide-only hope, and note that you are intentionally
breaking the "seen it first" bar.

## Dual poles (do not patch one incident into a mandate)

A real failure is necessary, not sufficient. Patching only the complaint you just heard **over-corrects**: the new line keeps that lesson and makes the opposite failure easier.

Seen 2026-08-13 on `rules/user/communication.md`: three successive patches from three complaints (too slogan-like → never be short; catalog answers → every explainer must be four steps; coined labels → definition outranks brevity). Each lesson was real. Together they removed any length ceiling. Proposing "always answer short" after "too long" is the same failure in the other direction.

Before adding, widening, or deleting a line:

1. Re-read the **whole target file**, not only the paragraph you are editing.
2. Name the **opposite** failure that file already records, or that you have already seen. If you cannot name it, you are not ready to patch — write both poles down first.
3. The new sentence must still make that opposite failure **harder**, not easier. If one sentence cannot hold both poles, stop; do not append a one-way patch.
4. Do not promote one incident into a file-wide mandate ("all explanations", "never compress", "always four sections"). Scope the constraint to the class of situation where it failed.
5. Prefer **replacing a cluster of one-way patches** with one dual-pole paragraph over adding a fourth patch.

Invalid: "never write short" or "always write short".
Valid: a line that forbids slogans/jargon catalogs **and** forbids expanding a settled answer into a template essay.

Deleting a line is the same test in reverse: do not drop "no slogans" because the last answer was too long.

## 规则正文怎么写（语体）

可下发的规则写成中文。按中文组织句子，不要先写成英文再译。信、达、雅要同时成立，不是互斥的：意思要准，句子要顺，读起来像中文写成的说明。专业判断、术语、分点都可以留。

整句检查，不查单词。词都认得，仍可能是翻译腔或说明书腔，例如把几层意思挤进一句、用括号当字段目录、用「和 X 一样……两端读同一份」这种英文提纲节奏。也不要为了通顺改成聊天口吻：不要用凑、搁、点头、别另起炉灶这类口头禅替换准确说法。

结构可以分点；分点里的句子仍用通顺书面中文，不要把分点写成决议稿，也不要写成口语速记。不要用「句子宜短」当标准，那会收成碎句。

规则正文是模型会跟着学的样本。语体含糊，回复也会含糊。活约束仍写在 `communication.md`；本文件管的是**改规则时**怎么落笔。

2026-08-19 见过的双极：说明书长句不像中文；改成大白话又不专业。新句子必须让这两头都更难发生。

反例：「和股票代码表一样，放项目下的 `.llm-wiki` 里一份 JSON（开不开、页路径、预算），桌面和命令行读同一份。」
正例：「放在项目的 `.llm-wiki` 下，和股票代码表同类，不进 wiki 正文。设置里改完，桌面导入和命令行都读这一份。」

## What belongs in deployable rules (`user/` / `project/`)

`rules/user/` holds personal rules that apply to **all** roles (communication,
behavior baseline). `rules/project/` holds project-specific rules that can be
scoped to sub-agent roles via frontmatter.

### `agents` frontmatter (`project/` only)

Optional YAML at the top of `rules/project/*.md` files:

```yaml
---
agents: [implementer, reviewer]
---
```

| `agents` value | Rules channel (alwaysApply) | Agents channel (sub-agent bundles) |
|----------------|----------------------------|----------------------------------|
| omitted | Deployed, full load | **Skipped** - sync warns; add explicit `agents:` |
| `all` | Deployed, full load | Included in planner, implementer, and reviewer |
| `[planner]` etc. | Deployed, full load | Only in matching role bundle(s) |

Frontmatter is stripped before rules deploy. User rules never use `agents:` - all
`rules/user/*.md` files are included in every sub-agent bundle.

Sub-agent roles (fixed): **planner**, **implementer**, **reviewer**. One `sync`
writes rules to `.cursor/rules/` / `.claude/rules/` and agents to
`.cursor/agents/` / `.claude/agents/`.

Good lines are:

- **Specific** - which files, which commands, which workflow.
- **Actionable** - a clear next step ("propose a plan and wait for confirmation").
- **Justified** - why silence is dangerous (e.g. no tests, silent failure).

Bad lines (placeholder rules):

- "Write high-quality, maintainable, readable code."
- "Be careful with prompts."
- Anything that would not change agent behavior if removed.

## Guide vs Sensor

| | Guide (rule text) | Sensor (automatic check) |
|--|-------------------|---------------------------|
| Role | Convince the agent to do something | Block or fail regardless of intent |
| Example | "Run tests before claiming done" | `npm test` in CI; `node --test` in MyRules |
| Risk | Agent may skip | Harder to skip |

If the project already has a Sensor (build fails on type errors, sync refuses
when cache is dirty, tests must pass), do not rely on a vague guide alone.
Either name the exact command (`npm run build` must be green) or lean on the
Sensor.

MyRules Sensors (not rules): `sync.js` drift skip, dirty-cache abort, prune
fingerprint gate, `node --test` in this repo.

## Prune expired rules

Delete guide lines when:

- The bug is fixed in code and cannot recur.
- The workflow changed and the line is obsolete.
- The line is marked expired in staging notes.

Stale rules are like stale comments - they crowd out what still matters.

## Size

Keep each deployable `rules/user/*.md` and `rules/project/*.md` file **lean**
(practical target: under ~300 lines per file). If growing, split by topic
(`behavior.md`, `communication.md`, …) or move narrative to
`rules/staging/articles/`.

## Harness habit

When an agent makes a mistake while you work:

1. Fix the immediate issue.
2. **Do not** open the matching rule file and append a patch in the same turn.
   Write both poles (this failure **and** the opposite one) first. Then engineer
   a dual-pole line — or replace a one-way cluster — so the mistake is less
   likely to recur **and** less likely to cause the opposite mistake.
3. Capture source in `rules/staging/articles/` if helpful.
4. Merge into `user/` or `project/` when polished - not every note belongs in
   deployable rules. Meta constraints (how to edit rules) go in this file, not
   in `communication.md` / `behavior.md`.

## Staging workflow

```
Article / incident
  -> rules/staging/articles/<slug>.md
  -> rules/staging/merge-queue/into-*.md
  -> rules/user/*.md or rules/project/*.md
  -> push.js -> sync.js
```

Do **not** put meta-authoring content into `merge-queue` for `behavior.md`
unless it is also a live coding constraint. This file (`meta/authoring.md`) is
the home for "how to write rules."

## MyRules vs AGENTS.md / CLAUDE.md

Consumer projects use **MyRules deploy artifacts** (`myrules-*`), not hand-edited
`AGENTS.md` or `CLAUDE.md` (see Protect list in skill `REFERENCE.md`).

Auto-loading for synced projects = `myrules-*.mdc` from the cache. "Auto生效"
means: edit cache -> push -> sync - not a manual memory-export drag each session.

## Quick checklist before merge

- [ ] Golden test passed for each new line
- [ ] Dual-pole check: opposite failure named; new line still makes it harder
- [ ] Constraint scoped to the incident class, not widened to "always / never / all"
- [ ] Not a placeholder or duplicate of superpowers skills without a stricter personal bar
- [ ] Deduplicated against existing `user/` / `project/` files
- [ ] Expired lines from staging removed, not copied forward
- [ ] File still lean; split topic if needed
- [ ] 规则正文通过语体检查：信、达、雅；不是英文提纲，也不是口语速记
