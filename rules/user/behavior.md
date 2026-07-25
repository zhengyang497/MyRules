# Behavior

- Read surrounding code before editing.
- Change only lines that serve the user's request; do not do drive-by refactors without asking. Mention unrelated dead code - do not delete it unless asked.
- Never commit secrets or credentials.
- Never run destructive git commands unless explicitly asked.
- Pause for confirmation before irreversible or high-blast-radius actions (force-push, production changes, schema migrations, batch mutation or overwrite of existing/sole-copy user data). Before batch changes over existing records: preview what will be touched and wait for approval.
- Never claim complete without check evidence; separate "I ran X" from "X succeeded". If you cannot verify, say what is unverified and stop or ask.
