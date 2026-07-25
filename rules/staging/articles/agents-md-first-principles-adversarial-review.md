# Article: AGENTS.md 实用技巧 — 第一性原理 + 对抗式审查

- **Source**: https://www.xiaohongshu.com/explore/6a45cb5d000000001102d6e1 （@xiaohua_888 / 1024；受「卡兹克」文章启发，写入项目 AGENTS.md）
- **Date**: 2026-07-25
- **Status**: merged (2026-07-25 into `rules/user|project`)
- **Target files**: behavior, planning, review, testing

## Core ideas (你的归纳)

- 两个实用手法：**第一性原理**（别一上来套惯例，从基本事实重推）与**对抗式审查**（写完自己挑刺找怪 bug）。
- 原作者建议：不必装 skill / 写 system prompt，需要时在 prompt 后加一句即可；本帖作者嫌懒、易忘，所以写进项目 `AGENTS.md` 当默认规则。
- 对 MyRules：同类内容更适合进 `rules/user|project` 或 staging→merge，而不是每次手敲。

## Executable principles

### 第一性原理

1. 动手前回到根本：这个任务到底要解决什么问题？别照搬「惯例 / 大家都这么做」。
2. 拆到最小、能验证的单元，逐个解决。
3. 每个决定说得出「为什么」，不只是「怎么做」。

### 对抗式审查（交付前必做）

1. 写完切换成最挑剔审查者：逻辑漏洞、事实对错、有没有更简单做法。
2. 主动列出最可能翻车的 3–5 点，改完再交。
3. 不接受「看起来没问题」—— 要验证过的证据。

## Candidate rule lines (English, for merge-queue)

See `merge-queue/into-behavior.md`, `into-communication.md`, `into-review.md` (2026-07-25 abstract).
Skipped as duplicate of existing decompose/verify candidates: "smallest verifiable units" alone.

## Merge notes

- Overlaps: `architecture-proposal-review.md`、`agent-controllability.md`、Reddit 笔记「自查 / 对抗审查」、MyRules `review.md` candidates。
- Good fit for `behavior` + `review`；第一性原理与 `planning`「先讲清问题再方案」同向。
- Note: MyRules Protect 列表避免手改消费者项目的 `AGENTS.md` / `CLAUDE.md` —— 同类约束应进 cache 的 `rules/*` 再 sync 为 `myrules-*`。
