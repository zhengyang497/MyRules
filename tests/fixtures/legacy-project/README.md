# Legacy project fixture (documentation only)

This directory documents the shape of the synthetic project built at test
runtime by `tests/e2e.test.js` via `makeLegacyProject()`. No static files are
checked in — the test creates temp dirs with:

- `CLAUDE.md`, `AGENTS.md` (protected — must survive init/sync/prune)
- `.cursor/rules/old-style.mdc`, `.claude/rules/old-style.md`, `.cursorrules` (legacy prune targets)
- A local bare git cache repo with seed rules under `rules/user/` and `rules/project/`

See `tests/e2e.test.js` for the full init → sync → protect → dry-run prune → prune → export scenario.
