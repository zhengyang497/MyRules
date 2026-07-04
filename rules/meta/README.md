# Rules meta（写规则手册）

这里放 **「怎么维护 MyRules 规则」** 的说明，不是发给每个项目的干活规矩。

| 目录 | sync 会部署到项目吗？ |
|------|----------------------|
| `rules/user/`、`rules/project/` | **会** → 每个项目的 `myrules-*.mdc` |
| `rules/staging/` | **不会** → 草稿、文章笔记 |
| `rules/meta/`（本目录） | **不会** → 只在内容库 `~/.myrules/` 里用 |

**主文件：** [`authoring.md`](authoring.md) — 编辑 `rules/user/` 或 `rules/project/` 前请先读。

定稿流程：文章笔记 → `staging/` → 合并进 `user/` 或 `project/` → `push.js` → `sync.js`。
