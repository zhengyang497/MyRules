# Article: Vibe Coding 最大陷阱 — AI 说完成了 ≠ 需求满足

- **Source**: https://www.xiaohongshu.com/explore/6a5a048d0000000001000316 （小红书笔记；Codex / Claude Code 使用经验）
- **Date**: 2026-07-25
- **Status**: merged (2026-07-25 into `rules/user|project`)
- **Target files**: behavior, communication, planning, testing

## Core ideas (你的归纳)

- AI 说「完成了」不代表需求真的完成；即使最强模型也有这个边界。
- AI 擅长：写改代码、修 bug、实现**明确**功能；「代码能跑」≠「产品需求被满足」。
- 常见缺口：用户真实意图、使用场景、隐含逻辑、边界情况 —— 追问后才会暴露遗漏。
- Agent 边界：执行力很强的工程师，**还不能完全替代产品经理**。
- Vibe Coding 正确分工：**你定义需求与验收；AI 提升执行效率**。

## Executable principles

1. 改代码前先做需求理解，不直接动手。
2. 强制回答：理解的目标、用户真正要解决的问题、涉及模块、隐藏需求与风险。
3. 有歧义先提问，确认后再编码。
4. 声称完成前，对照原始需求追问：是否完全符合、有无遗漏、真实使用是否有问题 —— 用证据回答，不是感觉。

## Candidate rule lines (English, for merge-queue)

See `merge-queue/into-planning.md`, `into-testing.md` (2026-07-25 abstract).
Skipped: "agent is not a PM" slogan (Golden test fail — does not change concrete behavior beyond existing clarify/verify lines).

## Merge notes

- Overlaps heavily with `agent-controllability.md` and merge-queue `into-behavior` / `into-testing` / `into-communication`（验证门、完成时附证据）.
- Also overlaps Reddit 笔记里的「先采访再执行」与 AGENTS.md 固定偏好。
- Prefer strengthening existing candidates rather than duplicating full prompt blocks into deployable rules.
