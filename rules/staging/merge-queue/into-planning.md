# Merge into: `rules/project/planning.md`

## Candidates

- [ ] When asked to design or bootstrap a new application architecture, first deliver (without implementation): (1) folder layout with one-line role per directory, (2) allowed call directions between layers, (3) one end-to-end user-action call chain — then wait for confirmation before coding.
  - Source: `articles/software-layering-patterns.md`
- [ ] Before implementing a non-trivial change, deliver a plan (no code yet) that includes: (1) which layers/files will change, (2) a **must-change** list vs an **optional/opportunistic** list, (3) 1–3 observable acceptance checks — then wait for confirmation.
  - Source: `articles/architecture-proposal-review.md`
- [ ] Treat dependency direction and reuse of existing shared hooks (validation, persistence, logging, IO bridge) as hard constraints in plans; do not propose parallel replacements without an explicit reason and user approval.
  - Source: `articles/architecture-proposal-review.md`
- [ ] Large change sets are OK when every must-change item serves the same acceptance criterion (e.g. wiring one feature flag through many entry points). Split the work if the plan bundles unrelated goals.
  - Source: `articles/architecture-proposal-review.md`

## Merged

<!-- Move items here after folding into planning.md, with date -->
