# Article: Fable5 官方提示词手册 — 核心建议是「删」

- **Source**: https://www.xiaohongshu.com/explore/6a2b8f8d000000001700adde （AI星球日记 / 陈兜兜Echo；声称提炼自 Anthropic《Prompting Claude Fable 5》等官方文档；含 15 条可复制提示词卡片）
- **Date**: 2026-07-25
- **Status**: merged (2026-07-25 into `rules/user|project`)
- **Target files**: behavior, communication, planning, review, testing

## Core ideas (你的归纳)

- 手册主旨不像「教你堆咒语」，更像**劝你删**：旧模型攒的步骤清单、永远先 X 后 Y、人设专家套话，在更强自主模型上常变成累赘。
- 新写法一句话：**给目标、给原因、给边界、给验收方法**，其余交给模型规划与验证。
- 作者纠错：二手报道里的 `/loop` 启动自主循环在原文十四节中未出现 —— 核实以官方文档为准。
- 提示词手艺从「写咒语」退回更老的能力：把事讲清楚（是什么、为何重要、做到什么算完）。
- 15 条按五类：行为风格、诚实与边界、协作与记忆、长任务稳定性、输入输出质量。其中**进度审计**被强调：官方承认会编造进度，该指令在内部测试中几乎消除虚假汇报。

## Executable principles (from cards + caption)

1. **防过度规划**：信息够就行动；不重推已确认事实、不翻案用户已定决策、不罗列不打算采用的选项；权衡时给推荐而非综述（思考块除外）。
2. **防过度工程**：不超任务加功能 / 重构 / 抽象；修 bug 不顺带大扫除；不为假想未来设计；只在系统边界做校验。
3. **结果先行**：完成后第一句回答「发生了什么 / 发现了什么」；靠取舍内容变短，而非碎片缩写与箭头链。
4. **检查点**：仅在不可逆 / 真正范围变更 / 仅用户能提供的信息时停下提问并结束回合；不以空承诺收尾。
5. **进度审计**：汇报前逐条对照本会话工具结果；只报有证据的工作；失败 / 跳过如实说；已验证则直说不打太极。
6. **子代理调度**：独立子任务并行委派，主线继续；子代理跑偏或缺上下文时介入。
7. **自主运行**：无人值守时不问「要不要我…」卡住；可逆且符合原请求的直接做；结束前若最后一段仍是计划 / 承诺则先用工具做完。
8. **上下文安抚**（若框架暴露 token 倒计时）：明确「上下文充裕，勿因限额停 / 总结 / 建议新会话」。
9. **给原因模板**：我在为【谁】做【更大任务】，产出要支撑【什么】；基于此：【请求】。

## Candidate rule lines (English, for merge-queue)

See `merge-queue/into-behavior.md`, `into-communication.md` (2026-07-25 abstract; progress-audit and checkpoint clauses strengthened existing candidates).
Skipped as duplicate of minimize-scope / planning acceptance: "no extra features", "goal+why+boundaries slogan" alone. Full 15 prompt cards stay in this article for lookup — not all belong in deployable rules. Verify Anthropic docs before any merge that quotes Fable5-specific wording.

## Merge notes

- **Verify source**: 「Fable 5」命名与 `/loop` 纠错说明二手解读风险；合并前应用 Anthropic 现行官方 docs 核对，勿把未核实卡片原样当事实写进正式规则。
- Strong overlap with `behavior.md`「Minimize scope」、`agent-controllability`、verification-before-completion；**进度审计**几乎可直接强化现有「完成须附证据」候选。
- Tension with Andrew Ng「分阶段大纲」：Ng 的阶段是**人机协作工作流**；Fable5 删的是**绑死模型的伪流程清单** —— merge 时写清，不要互相覆盖。
- 15 条全文不必都进 rules；按 Golden test 只留会改变行为的短句，长 prompt 可留在 article 备查或订官方 skill。
