# Merge into: `rules/project/coding-standards.md`

## Candidates

- [ ] Treat APIs and symbols found in this project's code as the only trusted source; if you cannot find an API in the repo, treat it as unavailable — do not assume it from training data or docs alone.
  - Source: `articles/behavioral-guidelines-six-rules.md` (Project facts > training data)
- [ ] Before adding new functionality, search the project for an existing implementation or shared hook to call; extend or reuse it instead of building a parallel path.
  - Source: `articles/behavioral-guidelines-six-rules.md` (Reuse first); tightens existing "Prefer reuse"
- [ ] If the solution grows much larger than needed (e.g. could be ~50 lines but is heading toward 200), simplify before finishing; skip unrequested features, abstractions, configurability, and error handling for impossible cases.
  - Source: `articles/behavioral-guidelines-six-rules.md` (Simplicity first); tightens existing minimum-code line

## Merged

- [x] 2026-07-25 — Folded (deduped/tightened) into `rules/project/coding-standards.md`: layering/dependency direction, shared-hook reuse, minimum-code / anti-speculation.
  - Sources: `software-layering-patterns.md`, `architecture-proposal-review.md`, `karpathy-llm-coding-guidelines.md`
