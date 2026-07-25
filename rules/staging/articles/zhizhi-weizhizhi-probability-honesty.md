# Article: 「知之为知之」— 概率诚实与认知边界

- **Source**: https://www.xiaohongshu.com/explore/6a597dab00000000220185c3 （小红书笔记；写入 soul.md / 系统提示的实践）
- **Date**: 2026-07-25
- **Status**: merged (2026-07-25 into `rules/user|project`)
- **Target files**: behavior, communication

## Core ideas (你的归纳)

- LLM 预训练是最大似然「猜下一个词」，不是「求真」→ 三大顽疾：幻觉、发散、迎合。
- 「知之为知之，不知为不知」不是简单禁止胡答，而是在推理链植入**认知边界检测**：区分参数记忆 / 逻辑推断 / 随机猜测，并标置信度。
- 目标：从讨好式对话转向证据式探索 —— 不确定时闭嘴，无知时求助（Chat → Trust）。
- 误读危险：粗暴理解成「不知道就说不知道」→ Agent 变成没脑子的复读机。
- 需要的是**概率诚实**：结论分三档 —— 确定事实 / 逻辑推断 / 猜测；猜测档必须请用户把关。「我不知道」应是协作开始，不是回避。

## Executable principles

1. 输出前做元认知校验：这条是记忆、推断，还是猜测？
2. 低置信 / 无证据时显式标明，并请求用户确认或提供材料；不要编造补全句式。
3. 不要用「不知道」逃避可做的检索、推理或工具验证；诚实 ≠ 消极。
4. 避免为了迎合用户偏好而放弃可验证的立场。

## Candidate rule lines (English, for merge-queue)

See `merge-queue/into-communication.md` (2026-07-25 abstract).
Skipped as duplicate of existing push-back / verify lines: standalone "I don't know starts collaboration" and "anti-sycophancy" slogans.

## Merge notes

- Overlaps: `agent-controllability.md`（无证据不宣称完成）、Andrew Ng 笔记「中立提问 / 来源约束」、Fable5「进度审计」。
- Slogan「知之为知之」可作 leading word 记在 meta；部署规则应写可执行的置信度 / 证据行为，避免空哲学句。
- Risk: 过度「不知则停」会与自主长任务冲突 —— 合并时对齐 Fable5 检查点（仅不可逆 / 范围变更 / 独有信息才停）。
