# Rules meta（写规则手册）

这里放「怎么维护 MyRules 规则」，不是发给项目的干活规矩。`sync` 不会部署本目录。

写作手册只回答四件事，细则见 [`authoring.md`](authoring.md)：

1. 三把尺子：黄金测试、见过再写、双极
2. 语体
3. 放在 `user/` 还是 `project/`
4. 改完怎么走

事故原委放 `staging/articles/`。同步安全放 skill 的 `REFERENCE.md`。

定稿：文章笔记 → `staging/` → 合并进 `user/` 或 `project/` → `push.js` → `sync.js`。
