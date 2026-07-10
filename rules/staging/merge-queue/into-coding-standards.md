# Merge into: `rules/project/coding-standards.md`

## Candidates

- [ ] Do not import UI/view components (e.g. `components/`, pages, JSX widgets) from business-logic modules (`lib/`, `services/`, `domain/`). UI may call logic; logic must not call UI.
  - Source: `articles/software-layering-patterns.md`
- [ ] File-system, OS, or network IO from application logic must go through the project's designated bridge layer (e.g. `commands/`, `api/`, repository adapters) — not ad-hoc reads/writes scattered in UI components.
  - Source: `articles/software-layering-patterns.md`
- [ ] State stores hold state and thin setters only; business rules, parsing, and orchestration belong in `lib/` (or equivalent), not in store modules.
  - Source: `articles/software-layering-patterns.md`
- [ ] In layered codebases, lower layers must not import higher orchestration modules (e.g. utilities must not import top-level workflow files).
  - Source: `articles/software-layering-patterns.md`
- [ ] Prefer extending an existing shared hook (schema validation, repair pipeline, persist/auto-save, debug logging, designated IO bridge) over adding a parallel implementation for the same concern.
  - Source: `articles/architecture-proposal-review.md`

## Merged

<!-- Move items here after folding into coding-standards.md, with date -->
