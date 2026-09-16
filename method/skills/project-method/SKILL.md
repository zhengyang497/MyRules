---
name: project-method
description: >-
  Runs this project's working method. Use when the user says 登记, 先登记, 开一项, 标完成, 关卡, 收尾,
  改目的, 目的变了, 写文首, 目标审计, 项目目标审计, or mentions 看板卡, 改进清单, 设计目标, 目标册,
  口号进册, 检查清单, 一卡一页, 项目工作法, or borrows from another codebase.
  Do not treat this skill as a reason to create a board item, and do not require
  a board item before changing code. Bugfixes and follow-ups, if registered,
  go under the related old item as a sub-item, not a new parent card.
---

# 项目工作法

先读仓库根 `.myrules-runtime.json`。

- `agent`：读 [`docs/方法/myrules-项目工作法.md`](../../../docs/方法/myrules-项目工作法.md) 和 [`docs/方法/myrules-runtime.md`](../../../docs/方法/myrules-runtime.md)。登记走 `npm run board`（托管脚本）。主会话可以写代码。
- `project`：读工作法、runtime、[`docs/方法/myrules-coordinator.md`](../../../docs/方法/myrules-coordinator.md)。你若是主会话，就是 coordinator：禁止写业务代码；活看板在 `ledger/board/`；点头后派 publisher 出版 git 文首。

模板与逐步核对见 [reference.md](reference.md)。

人拍板意图和取舍。需要领号时会说「先登记」。你查代码事实、把口语收成标准条目。没说登记就不要开父项。人说审计时按流程五三阶段做。清单状态标的是针对这句的动作做到哪，不是抽查或审计结论。口号进册要人点头。看板卡和讨论文稿是记录不是规格。

## 第零步：看板不是改代码的入口

没人要求登记，直接动手。不要先问「要不要开卡」。目标不必有项目来承载。

人要登记时：

1. 修 bug、补刀、同一块功能的后续：找到相关旧项（进行中或已 done 都行），挂成子项。不要开一张同级新卡。
2. 人说「开一项」并且确实是一件新事：才开父项。只要标题和几句说明。不要预置三节。
3. 人只说「先登记」：先按第 1 条找旧项；没有相关旧项才开父项。登记完若人没说开始，停下。

### agent 分支

用 `npm run board -- add --title "..." [--body "..."] [--focus]`。不准手改卡片页眉。不要用 `--plan`。

### project 分支

在 `ledger/board/` 写卡。不要要求跑 `npm run board`。默认探路：没点头、没出版之前禁止派 implementer。

## 写进目标册时：三步判断

改目的、或收工发现碰到了目标，才问。不是登记手续。先问这句是目标还是做法。做法不要写进文首。口号可以进文首，状态标「口号」。

0. 这句是目标还是做法？目标是决定走向的拍板（人在场景中必须能断定什么，或业务硬边界）。换工程做法该能力或边界仍在 → 做法，只关卡，不改目标册。
1. 是否改了已经在册上的目标？→ 改那句或改状态，同一轮同步总表。
2. 是否多了一句目标（含口号）？→ 能挂进现有那篇就挂；否则才新开一篇。开不开项目是另一步。
3. 这摊只是做法？→ 只把项标完成，不新开设计目标。

拿不准就摊开选项等人拍。

### project 出版

draft 不是规格。人点头后同一轮派 publisher 写入 git 文首和总表。工人读文首，不读 draft 当目标。

## 按情况进流程

没有进行中卡的改代码，不走下面的流程三，直接动手（project 下由 coordinator 派 implementer，自己不写）。

| 情况 | 流程 |
|------|------|
| 目的或目标状态要改 | 流程一（先改文首和总表；口号可先入册；再扫 focus 和明显相关的进行中项） |
| 要借鉴另一个现成系统 | 流程二 |
| 已经挂在某张卡上的工作要收工 | 流程三（写在这张卡或子项；对照目标给证据；问碰到哪条、状态变了没有） |
| 设计目标里出现走查、日志或做法细节 | 流程四（搬回对应那张卡；口号留在文首） |
| 人要审计目标 | 流程五（done 项收尾 → 目标册内部 → 按状态对照现实） |

改了任何一篇已出版文首之后：

1. 把 `docs/设计目标检查清单.md` 对应行抄成与文首逐字相同，含状态。
2. 只看 focus，以及标题明显对着刚改那条目标的进行中项。不翻 done 卡。若改口作废了碰到的旧卡做法，加「已由 … 替代」。
3. 若已出版目的句变了，同步 `.myrules-context.md`。

标完成之前：问碰到了哪条目标、状态变了没有。没有碰到 → 只关卡。无论有没有，都写下收尾行。

## 空转自检

目的变了却先改业务代码、一次性重活却新开设计目标、没说登记却要求先过看板、修 bug 却开一张新父项、人没说登记却自行开卡、完成时只说编译过了或卡上没有收尾行、把做法细节写进文首、把切篇/字段/prompt 当成目标、把抽查或审计结论写进清单状态、读到旧卡过期口径未看替代行就当规格执行、人说审计却跳过收尾去对照代码、**coordinator 没点头就派 implementer**、**点了头却没把文首/总表出版到 git**，都是失败。停下来按对应流程重做。
