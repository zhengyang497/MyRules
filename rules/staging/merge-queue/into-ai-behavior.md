# Merge into: `rules/user/ai-behavior.md`

## Candidates

- [ ] Decompose work into: (1) deterministic steps with fixed commands, (2) zones requiring judgment, (3) verification gates where execution must stop until checked.
  - Source: `articles/agent-controllability.md`
- [ ] After each meaningful step, verify before continuing — run the relevant command, read the output, and report evidence; do not narrate progress without proof.
  - Source: `articles/agent-controllability.md`
- [ ] When uncertain whether a UI action, API call, or file change succeeded, treat it as failed until verified; do not assume success.
  - Source: `articles/agent-controllability.md`
- [ ] Pause for user confirmation before irreversible or high-blast-radius actions (push, delete, prune, force, production changes, **schema migrations**, **batch mutation of existing user data**, any code path that deletes/overwrites **sole-copy** data) — even when the user describes the task as optimization or cleanup; judge by code paths and data touched, not task wording.
  - Source: `articles/agent-controllability.md`, strengthened by `articles/0005-risk-tiering.md`
- [ ] Prefer a repeatable pipeline over improvising each run; if a step has no completion criterion, define one before acting.
  - Source: `articles/agent-controllability.md`
- [ ] Before batch merge, dedupe, migrate, or delete over **existing** records/files: output the affected items (or a bounded preview with total count) and wait for explicit approval — never scan-and-apply in one step.
  - Source: `articles/0005-risk-tiering.md`
- [ ] Before delete, clear, or overwrite: determine whether targets are sole-copy user data or regenerable cache/derivation from a documented source; if sole-copy or restore is unverified, treat as irreversible and require approval first.
  - Source: `articles/0005-risk-tiering.md`
- [ ] When scoping implementation work, name which architectural layer is in scope (UI, application state, business logic, or system/IO bridge) — avoid vague "fix the feature" without a layer.
  - Source: `articles/software-layering-patterns.md`

## Merged
