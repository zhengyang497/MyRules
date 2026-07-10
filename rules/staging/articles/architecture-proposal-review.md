# Article: 审 AI 架构方案 — 方向硬约束、范围看验收、效率看性价比

- **Source**: `learn-maintain-wiki` arc item 12（2026-07-10）+ 学习者归纳（个人项目下三者优先级）
- **Date**: 2026-07-10
- **Status**: abstracted
- **Target files**: `planning` (primary), `ai-behavior`, `review` (optional), overlaps `coding-standards` / `software-layering-patterns.md`

## Audience split（写给谁）

| 内容 | 归属 | 理由 |
|------|------|------|
| 三问口诀、必改/顺手拆法、大而同向 vs 大而发散 | **本文** | 教**人**审方案；删掉不会让 agent 自动变好 |
| 「个人项目效率可以最松」的价值判断 | **本文** | 给人用的优先级；不宜写成「允许低效代码」给 agent |
| 实现前先交：层/文件 + 必改 vs 顺手 + 验收 | **可部署** (`planning`) | 删掉 → agent 更易直接开写、绑大包 |
| 依赖方向 / 桥接 / 复用已有挂钩，禁止平行造轮子 | **可部署** (`coding-standards` 已有候选 + 本条补强) | 删掉 → 倒挂与重复校验器 |
| 范围用验收裁剪，不按「文件数少」炫技式最小化 | **可部署** (`ai-behavior`) | 与现有「Minimize scope」去重：改成 must/optional |
| Reviewer 查：方向倒挂、顺手改混进必改、未复用已有路径 | **可部署** (`review`) | 删掉 → 审稿只盯测试绿、不盯结构 |

## Core ideas（中文笔记）

### 共创顺序

```
目标 + 边界 + 层 → AI 交地图 → 人用三问放行 → 再写代码
```

### 三问与优先级（学习者定稿）

| 优先级 | 问 | 人话 | Agent 侧含义 |
|:---:|----|------|----------------|
| **1 硬** | 方向 | 有没有倒挂、绕桥、漏挂钩、平行造轮子？ | 结构底线，尽量不破 |
| **2 验收** | 范围 | 是一件事的多处挂点，还是好几件独立事绑一起？ | 用必改/顺手 + 验收裁剪；**大可以，发散不行** |
| **3 松** | 效率 | 有没有更小改法？ | 个人项目最松；明显绕远再打回——**不要**写成「禁止一切冗余」 |

### 大改动怎么判范围（人不靠数文件）

1. AI 交两列：**必改**（删了验收失败）vs **顺手**（重构/顺便）  
2. 问：同向多挂点，还是多目标搅在一起？  
3. 默认：先做必改并验收，再决定顺手列  

### 打回样例（给人用，不进 deployable）

| 方案 | 打回要点 |
|------|----------|
| 修排序 + 新 Service + Redis + 改 ingest | 发散；只动 `search` 打分 |
| 缺 summary → 重写聊天面板 + 新校验器 | 复用 `repairBlock`；别新造 |
| PDF 乱码 → 重写 ingest prompt | 字烂先查手/桥 |

## Executable principles（给人）

1. 方向保结构；范围保能验收；效率在个人项目可排最后。  
2. 大改可以；**发散的大改**不行。  
3. 审的是地图，不是逐行 diff。

## Candidate rule lines (English)

See merge-queue: `into-planning.md`, `into-ai-behavior.md`, `into-review.md`, and strengthen `into-coding-standards.md` if needed.

## Merge notes

- Overlaps: `software-layering-patterns.md`（层与桥）、`agent-controllability.md`（先定义完成标准）、现有 `planning.md`「decompose + acceptance」、`ai-behavior.md`「Minimize scope of changes」。
- **Dedup action**: replace or narrow「Minimize scope of changes」when merging — prefer must/optional + same acceptance criterion over blanket minimize.
- Do **not** deploy「efficiency is least important」as a license for sloppy work; keep that judgment in the article only.
- Trading-review-wiki paths (`repairBlock`, `search.ts`) stay in article examples; formal rules stay stack-agnostic.
