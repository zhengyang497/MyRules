# Article: Agent 可控性 — 别在没验证时说「已完成」

- **Source**: 用户提供的短文（Agent 从「更聪明」转向「更可控」）
- **Date**: 2026-07-05
- **Status**: abstracted
- **Target files**: prohibitions, ai-behavior, testing, output-standards

## Core ideas (你的归纳)

- Agent 最大风险不是笨，而是**自信地失败**：看起来做完了，关键步骤没验证。
- 聊天机器人胡说影响小；Agent 可能已经点了按钮、改了文件、提交了代码。
- 「半会不会」最麻烦：能说得很完整，但关键节点没检查。
- 行业重心：**可控** > 更聪明。可靠 Agent 像生产线：确定步骤、必须检查的输出、必须停下等人确认的关卡。
- AI 编程后 review 压力上升：生成多 ≠ 证据多；最被低估的成本是**确认**。
- 高手拆任务：**确定步骤 + AI 判断 + 验证门**。

## Executable principles

1. 无验证依据不得声称完成。
2. 信息未齐不得下结论或总结。
3. 不得用解释代替运行/检查结果。
4. 任务拆成固定步骤、判断区、验证门；每步有完成标准。
5. 不可逆操作前必须等人确认。
6. 汇报完成时附证据（命令 + 结果），区分「做了」和「成功了」。

## Candidate rule lines (English)

See `merge-queue/into-*.md` — extracted from this article.

## Merge notes

- Overlaps: superpowers `verification-before-completion`, `brainstorming` (design before code). MyRules rules = personal stricter layer, not duplicate full superpowers text.
- Prefer strengthening existing four formal files over new topics.
