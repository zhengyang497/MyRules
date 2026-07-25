# Article: Andrej Karpathy 的 LLM 编程行为准则（CLAUDE.md）

- **Source**: https://github.com/multica-ai/andrej-karpathy-skills
- **Date**: 2026-07-25
- **Status**: merged (2026-07-25 into `rules/user|project`)
- **Target files**: behavior, coding-standards, communication

## 原文

> Behavioral guidelines to reduce common LLM coding mistakes. Merge with
> project-specific instructions as needed.
>
> **Tradeoff:** These guidelines bias toward caution over speed. For trivial
> tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Refactor X" -> "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer
rewrites due to overcomplication, and clarifying questions come before
implementation rather than after mistakes.

## Core ideas（中文归纳）

四条原则，本质是**让 LLM 编程从"自信地写"转向"有约束地写"**：

1. **先想再写** - 明说假设、不藏着困惑、有更简单方案就说出来
2. **最小实现** - 只写被要求的，不做投机性抽象
3. **手术式改动** - 只动该动的，不顺手"改善"周边代码
4. **目标驱动** - 把任务转成可验证的成功标准，循环到通过

## 与现有 MyRules 的重叠分析

| Karpathy 条目 | 现有规则 | 重叠程度 |
|---------------|----------|----------|
| 1. Think Before Coding | `communication.md`: "push back on weak assumptions and offer an alternative" | 部分重叠；Karpathy 更强调"明说假设"和"不静默选择" |
| 2. Simplicity First | `behavior.md`: "Minimize scope of changes" | 重叠；Karpathy 更具体（不做投机抽象、200 行能 50 行就重写） |
| 3. Surgical Changes | `behavior.md`: "Minimize scope of changes" + "Read surrounding code before editing" | 强重叠；Karpathy 的"每行改动可追溯到用户请求"是更严格的表述 |
| 4. Goal-Driven Execution | merge-queue `into-behavior.md`: 验证门候选 + `into-testing.md` | 部分重叠；Karpathy 的"转成可验证目标"是 agent-controllability 的实操版 |

## Candidate rule lines (English, for merge-queue)

See `merge-queue/into-behavior.md`, `into-coding-standards.md`, `into-communication.md` (2026-07-25 abstract).

Skipped as duplicate / skill territory:
- "Match existing style" (already in formal `coding-standards.md`)
- Standalone "push back when simpler exists" (already merged into `communication.md`)
- Full red-green TDD loops for every fix (superpowers `tdd` / existing testing candidates cover the verify bar without restating the skill)

## Merge notes

- Overlaps with superpowers / existing rules: 强重叠 `behavior.md`（Minimize scope / Read before editing）、`communication.md`（push back on weak assumptions）、`articles/agent-controllability.md`（验证门、先定义完成标准）、Fable5 防过度工程。
- Conflicts or open questions: Karpathy 的"bias toward caution over speed"与 `communication.md` 的"简单执行类任务直接做"存在张力 - 新候选注明 trivial 任务仍用判断直接执行。
- 这是一篇高星文章（196k+ stars），但 golden test 仍适用：只有比现有规则更严格或更具体时才合并，否则只是重复。
