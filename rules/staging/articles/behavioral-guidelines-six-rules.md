# Article: 行为准则（六条）

- **Source**: user screenshot (2026-07-27)
- **Date**: 2026-07-27
- **Status**: abstracted
- **Target files**: `behavior` (primary), `coding-standards`, `planning`, `communication`

## Audience split（写给谁）

| 内容 | 归属 | 理由 |
|------|------|------|
| 六条口诀全文、与 Karpathy 对照 | **本文** | 教**人**建立地图；删掉不会让 agent 自动更守 |
| Project facts > training data | **可部署** (`coding-standards`) | 具体动作；删掉 agent 更易凭训练数据猜 API |
| Reuse first（先搜再写） | **可部署** (`coding-standards`) | 比现有 "Prefer reuse" 更具体 |
| Think before coding（搜现有实现、列选项、停问） | **可部署** (`behavior` / `communication`) | 部分已在 `communication.md`；补强「先搜再动手」 |
| Surgical / Simplicity / Goal-driven | **部分已合并** | 与 `karpathy-llm-coding-guidelines.md`（2026-07-25 merged）强重叠；仅保留更严或缺失的候选 |

## Core ideas（中文笔记）

### 1. Think before coding

不假设，不隐藏困惑。动手前先搜索理解现有实现；有多种解读时列出选项而非默默选一个；存在更简单方案时要说出来，该反对就反对；不确定就停下来问。

### 2. Project facts > training data

项目代码中搜到的 API 是唯一可信来源；搜不到的 API 视为不存在，不凭经验假设。

### 3. Reuse first

实现新功能前先搜索项目中是否有类似实现，找到就直接调用。

### 4. Surgical changes

只改需求要求的部分，不「顺手改进」相邻代码、注释或格式；不重构没坏的东西；匹配现有风格；你的改动产生的孤儿代码（unused import/变量）要清理，但不删已有的 dead code。检验标准：每一行变更都应直接追溯到用户的请求。

### 5. Simplicity first

能 50 行解决的不写 200 行；不做没被要求的功能/抽象/灵活性/可配置性；不为不可能的场景写错误处理；可读性 > 性能 > 巧妙性。自问：「资深工程师会说这太复杂了吗？」是的话就简化。

### 6. Goal-driven execution

将任务转为可验证目标（「修复 bug」→「写复现步骤，改完后验证消失」；「加功能」→「列出验收点，编译通过且每点可演示」）。多步任务陈述简要计划：`[步骤] -> 验证: [检查项]`；约束章节禁止的 API 不得在方案中出现。

## Overlap with existing MyRules

| 条目 | 正式规则 / 已合并文章 | 备注 |
|------|----------------------|------|
| 1 Think before coding | `communication.md`（assumptions / options） | 候选补强「先搜现有实现」 |
| 2 Project facts | *(无)* | **净新增** |
| 3 Reuse first | `coding-standards.md`「Prefer reuse」 | 候选补强「先搜索再实现」 |
| 4 Surgical | `behavior.md` | 候选补强孤儿代码清理 |
| 5 Simplicity | `coding-standards.md`「minimum code」 | 候选补强 senior-engineer 自检 |
| 6 Goal-driven | `planning.md`（acceptance / verifiable steps） | 候选补强计划格式 + 禁 API |

## Merge notes

- Overlaps: `articles/karpathy-llm-coding-guidelines.md`（已 merged 2026-07-25）；`trading-review-wiki` 本地 `invariants.mdc` / `task-layers.mdc` 是项目专属，不进全局 rules。
- Tension: 「谨慎」vs `communication.md`「简单照做直接执行」— 候选注明 trivial 任务仍直接做。
- Golden test: 只合并比现有行更具体、删了更容易犯错的条目。
