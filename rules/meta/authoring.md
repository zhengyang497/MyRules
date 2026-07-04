# MyRules rule authoring

How to write, prune, and merge rules in the **cache**. This file does **not**
sync to consumer projects — read it when editing `~/.myrules/rules/`.

Formal deployable rules live only in `rules/user/*.md` and `rules/project/*.md`.
Drafts live in `rules/staging/`.

## Golden test (keep or delete)

For every line you add or keep, ask:

> If I delete this line, is the agent **more likely to make a mistake**?

- **Yes** → keep.
- **No** → delete. It only competes for attention with rules that matter.

Anthropic's warning applies here too: bloated rule files cause agents to ignore
the instructions that actually matter.

## Stricter standard (after real failures)

Prefer Addy Osmani's bar over guessing:

- **Add** a constraint only after a **real agent failure** you have seen.
- **Remove** a constraint only when the model is strong enough that the rule
  seems redundant.
- In a mature file, **every line should trace to a mistake that actually happened**.

"Preventive" rules for imagined failures usually add noise. Exception: catastrophic,
irreversible outcomes (e.g. deleting unrecoverable data) — prefer **Sensors**
(automatic checks) over guide-only hope, and note that you are intentionally
breaking the "seen it first" bar.

## What belongs in deployable rules (`user/` / `project/`)

Good lines are:

- **Specific** — which files, which commands, which workflow.
- **Actionable** — a clear next step ("propose a plan and wait for confirmation").
- **Justified** — why silence is dangerous (e.g. no tests, silent failure).

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

Stale rules are like stale comments — they crowd out what still matters.

## Size

Keep each deployable `rules/user/*.md` and `rules/project/*.md` file **lean**
(practical target: under ~300 lines per file). If growing, split by topic
(`prohibitions.md`, `ai-behavior.md`, …) or move narrative to
`rules/staging/articles/`.

## Harness habit

When an agent makes a mistake while you work:

1. Fix the immediate issue.
2. **Engineer the fix into rules** so it is less likely to recur.
3. Capture source in `rules/staging/articles/` if helpful.
4. Merge into `user/` or `project/` when polished — not every note belongs in
   deployable rules.

## Staging workflow

```
Article / incident
  → rules/staging/articles/<slug>.md
  → rules/staging/merge-queue/into-*.md
  → rules/user/*.md or rules/project/*.md
  → push.js → sync.js
```

Do **not** put meta-authoring content into `merge-queue` for `prohibitions.md`
unless it is also a live coding constraint. This file (`meta/authoring.md`) is
the home for "how to write rules."

## MyRules vs AGENTS.md / CLAUDE.md

Consumer projects use **MyRules deploy artifacts** (`myrules-*`), not hand-edited
`AGENTS.md` or `CLAUDE.md` (see Protect list in skill `REFERENCE.md`).

Auto-loading for synced projects = `myrules-*.mdc` from the cache. "Auto生效"
means: edit cache → push → sync — not a manual memory-export drag each session.

## Quick checklist before merge

- [ ] Golden test passed for each new line
- [ ] Not a placeholder or duplicate of superpowers skills without a stricter personal bar
- [ ] Deduplicated against existing `user/` / `project/` files
- [ ] Expired lines from staging removed, not copied forward
- [ ] File still lean; split topic if needed
