# Article: 2026 Prompting — 吴恩达新课后只保留的 7 条

- **Source**: https://www.xiaohongshu.com/explore/6a5f51c10000000011017465 （Dudu橙的AI日记 @DuDu_Chen；提炼自 DeepLearning.AI《AI Prompting for Everyone》/ 吴恩达）
- **Date**: 2026-07-25
- **Status**: merged (2026-07-25 into `rules/user|project`)
- **Target files**: behavior, communication, planning, review

## Core ideas (你的归纳)

- 很多人还在背 2023 年的「咒语式」提示词；模型变了，Prompting 应从背咒语变成**工作方式设计**。
- 7 条其实是一条路线：从模糊需求 → 可验收结果，中间要处理推理方式、背景、中立提问、大纲、反馈、来源、评测。
- 一句话公式：**清晰任务 + 必要背景 + 中立提问 + 分阶段生成 + 反馈循环 + 来源约束 + 模型评测**。

## Executable principles

1. 别迷信 `step by step`；改用「认真检查任务、约束和未知项」（think hard），不必公开一大段思维过程；先结论与依据，再列出需确认的未知项。
2. 站到接指令一侧，固定补齐 5 项：**任务、受众、背景、约束、交付格式**；信息不足先提问，不要自行假设。
3. 问题保持中立；别把偏好塞进问题（如「为什么 A 明显优于 B」）。先建评价维度，再列优势 / 风险 / 适用条件；证据不足要直说。
4. 不要直接写最终稿：大纲 → 批评 → 修改 → 展开要点 → 再修改 → 成稿。在大纲层改结构，成本远低于成稿层改句子。
5. 需求模糊时少堆指令、多要选项：先给 3–5 个方向（核心思路 / 场景 / 风险），用户反馈后再展开；用户的选择本身是高质量上下文。
6. 重要问题主动约束来源：优先官方文档、原始研究、监管机构、一手数据；标注日期；区分事实 / 观点 / 推断。
7. 接受锯齿状智能：写作强 ≠ 检索强，代码强 ≠ 图像理解强。重要任务用固定测试集（正常 / 边界 / 失败）对比多模型，不要凭单次回答选型。

## Candidate rule lines (English, for merge-queue)

See `merge-queue/into-communication.md`, `into-planning.md` (2026-07-25 abstract).
Skipped as duplicate / weak for deployable rules: one-shot model eval sets; full "think hard" prompt blocks (covered by existing verification candidates).

## Merge notes

- Overlaps: `agent-controllability.md`（验证 / 完成标准）、`architecture-proposal-review.md`（先计划再动手）、superpowers `brainstorming` / `verification-before-completion`。
- Meta vs deploy: 「怎么写 prompt」偏作者习惯；可进 `behavior` / `communication` 的是中立提问、信息不足先问、来源约束、验收前不宣称完成。
- Conflicts: 与「Fable5 手册劝删步骤清单」表面张力 —— 这里强调的是**工作流阶段**，不是给模型绑死旧式 step list；合并时写清区分。
