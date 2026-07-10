# Merge into: `rules/project/review.md`

## Candidates

- [ ] When reviewing an implementation plan or diff, flag dependency-direction violations (logic importing UI, bypassing the IO/bridge layer, lower layers importing orchestration) and parallel reinvention of an existing shared path (validation, persistence, logging) as blocking issues — not style nits.
  - Source: `articles/architecture-proposal-review.md`
- [ ] If a change set mixes required work for the stated acceptance criteria with opportunistic refactors, call that out and recommend splitting; do not treat "many files" alone as failure when all files serve one criterion.
  - Source: `articles/architecture-proposal-review.md`

## Merged

<!-- Move items here after folding into review.md, with date -->
