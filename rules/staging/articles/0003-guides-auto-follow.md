# Article: Lesson 0003 — 把你已经在做的事，变成自动生效的规则

- **Source**: `learn-maintain-wiki/lessons/0003-guides-that-agents-auto-follow.html`
- **Date**: 2026-07-05
- **Status**: merged (into `rules/meta/authoring.md`)
- **Target files**: meta only — not `user/` / `project/`

## Core ideas（中文笔记）

- Agent = Model + Harness；Guides = 动手前约束，Sensors = 动手后自动查（下一课）。
- 好规则已在 memory 里，但没放在自动加载位置 → 换对话/工具就失效。
- **黄金标准**：删掉这行，AI 会不会更容易犯错？
- **更严**：见过真错再加；每行能追溯到真实事故。
- Guide 说服 AI 做；Sensor 系统自动拦——能 Sensor 别只靠提醒。
- 过期规则（已修 bug）要删；占位符（「写好代码」）不要写。
- 自动加载的规则文件别太长（经验值 ~200–300 行）。

## Where it landed

Full authoring handbook: [`rules/meta/authoring.md`](../../meta/authoring.md)

Do **not** bulk-merge this lesson into `merge-queue/into-*.md` unless a line is
also a live coding constraint (e.g. overlaps with agent-controllability article).
