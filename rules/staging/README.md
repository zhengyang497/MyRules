# Rules staging

Draft rules live here. **Nothing under `rules/staging/` or `rules/meta/` is
deployed by `sync.js`.** Only `rules/user/*.md` and `rules/project/*.md` sync
to projects.

**Writing rules?** Read [`rules/meta/authoring.md`](../meta/authoring.md) first.

## Layout

```
rules/
├── meta/               ← how to write/maintain rules (not deployed)
│   ├── README.md
│   └── authoring.md
├── staging/            ← this directory
│   ├── README.md
│   ├── articles/
│   │   └── _template.md
│   └── merge-queue/
│       ├── into-behavior.md
│       ├── into-communication.md
│       ├── into-coding-standards.md
│       ├── into-planning.md
│       ├── into-review.md
│       └── into-testing.md
├── user/               ← deployed to projects
│   ├── behavior.md
│   └── communication.md
└── project/            ← deployed to projects
    ├── coding-standards.md
    ├── planning.md
    ├── review.md
    └── testing.md
```

## Workflow

1. **Capture** - Copy `articles/_template.md` -> `articles/<slug>.md`. Paste source link, core ideas, draft rule lines.
2. **Abstract** - Move polished candidates into the matching `merge-queue/into-*.md` file. Check `- [ ]` when ready to merge.
3. **Merge** - Ask Agent (or edit yourself): fold checked items into `rules/user/` or `rules/project/`. Deduplicate against existing lines, superpowers skills, and [`meta/authoring.md`](../meta/authoring.md).
4. **Publish** - `push.js` then `sync.js` on each machine.
5. **Close out** - Set article `status: merged`, move merge-queue items to "Merged" section with date.

## Status values (articles)

| Status | Meaning |
|--------|---------|
| `raw` | Notes captured, not yet abstracted |
| `abstracted` | Candidates live in merge-queue |
| `merged` | Folded into formal rules |

## Notes

- Formal rules stay in **English** (matches existing `rules/user/` and `rules/project/`).
- Chinese notes in `articles/` are fine.
- Subfolders under `user/` or `project/` are **not** deployed either - only flat `*.md` in those two dirs count.
