# Article: Reddit Claude 热帖 — 5 类 AI 协作方式

- **Source**: https://www.xiaohongshu.com/explore/6a4cd60d0000000015025df4 （Brui | Building with AI @brui；整理自 r/ClaudeAI「What's your most-used Claude prompt…」及评论）
- **Date**: 2026-07-25
- **Status**: merged (2026-07-25 into `rules/user|project`)
- **Target files**: behavior, communication, planning, review

## Core ideas (你的归纳)

- 高频用户讨论的不是单句魔法 prompt，而是**怎么设计人机协作关系**。
- 五类互动：批判性伙伴、开局反问、规则文件固定偏好、自查复盘、长会话交接。
- 闭环可压成：反问 → 复述目标 → 分阶段执行 → 中间自查 → 交接 → 长期规则进文件复用。

## Executable principles

1. **批判性伙伴**：挑战假设、指出盲点、给替代视角；先审视再给方案，不要默认顺从包装。
2. **开局采访**：一次只问一个主题，直到能准确复述目标 / 限制 / 资源 / 交付标准；再写计划与阶段执行；禁止靠猜测往前冲。
3. **规则文件**：把长期偏好写入 `CLAUDE.md` / `AGENTS.md` / workflow / memory（对 MyRules：写入 `rules/user|project`），避免每次重训「新员工」。
4. **交付前自查**：对照原始要求列偏题 / AI 腔 / 缺例 / 可删表达；或从老板 / 客户 / 执行三视角挑方案漏洞；可加置信分与对抗审查环。
5. **长会话交接**：会话变慢 / 忘规则 / 乱改前，生成交接 md（在做什么、已完成、决策、必须遵守的规则、未决问题、下一步），新会话接着干。

## Candidate rule lines (English, for merge-queue)

See `merge-queue/into-behavior.md`, `into-communication.md`, `into-planning.md`, `into-review.md` (2026-07-25 abstract).
Skipped: "persist preferences in rules files" (meta about MyRules itself — belongs in `authoring.md` / workflow, not deployable project rules); critical-partner slogan alone (covered by strengthened comparison / push-back lines).

## Merge notes

- Overlaps: grill-me / grilling skills、`agent-controllability`、AGENTS.md 第一性原理帖、MyRules staging 本身就是「规则文件」实践。
- Handoff 与 superpowers / mattpocock `handoff` skill 同向 —— 部署规则写原则即可，细节可指到 skill。
- 规则文件示例列表（勿乱改无关文件、改前读结构、跑测试、勿自动提交等）多数已在现有 `behavior` / `testing` 候选中，合并时去重。
