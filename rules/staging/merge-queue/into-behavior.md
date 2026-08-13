# Merge into: `rules/user/behavior.md`

## Candidates

- [ ] Before implementing, search the codebase to understand how similar work is done today; do not assume APIs or patterns exist without finding them in the project.
  - Source: `articles/behavioral-guidelines-six-rules.md` (Think before coding)
- [ ] Remove imports, variables, or functions that **your** changes made unused; do not delete pre-existing dead code unless asked.
  - Source: `articles/behavioral-guidelines-six-rules.md` (Surgical changes); tightens existing surgical / scope line

## Merged

- [x] 2026-07-25 — Folded (deduped/tightened) into `rules/user/behavior.md`: scope/surgical edits, irreversible pause + batch/sole-copy gates, decompose + verify + progress audit, no false completion, layer scoping, first-principles + act-when-confirmed, autonomous turn follow-through, adversarial self-review, session handover.
  - Sources: `agent-controllability.md`, `0005-risk-tiering.md`, `software-layering-patterns.md`, `architecture-proposal-review.md`, `agents-md-first-principles-adversarial-review.md`, `fable5-prompting-handbook-delete-to-clarify.md`, `reddit-claude-prompt-collaboration-patterns.md`, `karpathy-llm-coding-guidelines.md`, user request (2026-07-10)
  - Replaced vague `Minimize scope of changes` with surgical / must-change wording.
