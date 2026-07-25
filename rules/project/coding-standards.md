---
agents: [implementer]
---

# Coding Standards

- Match existing naming and import style.
- Prefer reuse; write the minimum code the task needs (no unrequested features, single-use abstractions, or speculative config).
- Keep dependency direction clean: UI may call logic; logic must not import UI. Application IO goes through the project's bridge layer. Prefer extending an existing shared path over adding a parallel one.
