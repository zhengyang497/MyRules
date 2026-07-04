# Article: Lesson 0005 — 风险分级：不是所有改动都值得你细看

- **Source**: `learn-maintain-wiki/lessons/0005-risk-tiering.html`
- **Date**: 2026-07-05
- **Status**: abstracted (revised per `rules/meta/authoring.md`)
- **Target files**: `ai-behavior`, `prohibitions` only — not output-standards or testing

## Audience split（元规则：先分清写给谁）

| 内容 | 归属 | 理由 |
|------|------|------|
| 三档框架、速查 5 问、小测验、项目 Tier 3 路径表 | **本文 + wiki** | 教**人**分配注意力；删掉不会让 agent 更错 |
| 批量改已有数据须先列清单 | **可部署** | 具体动作；对应文中 merge 相似条目场景 |
| 按代码路径后果分级，不按任务意图放松 | **可部署** | 对应 Q2「优化删除」；删掉 agent 可能因意图词放松 |
| sole-copy 数据 vs 可重建缓存 | **可部署** | 对应 Q4；删掉 agent 可能因「清空/删除」动词过度或不足警惕 |
| 「提案时标明 Tier 1/2/3」 | **不部署** | 汇报格式；golden test 不通过 |
| 「动手前 classify tier」空框架 | **不部署** | 占位规则，authoring.md 反面教材 |
| Tier 2 方案/diff 检查点 | **不单独部署** | Lesson 1/2 技能 + agent-controllability 已覆盖「验证门」 |
| 验证撤回/备份链路 | **不部署** | 人的演练清单；agent 侧已折进「未验证 restore = 不可逆」一句 |
| 项目路径（`fs.rs`、`buildAnalysisPrompt`…） | **`.myrules-context.md`** | 项目专属，不进全局 rules |

## Core ideas（中文笔记）

Harness 第三块：**注意力分配**——Guides/Sensors 挡不住时，按风险分级决定要多盯多少。

**两个维度 → 三档：**

| 维度 | 问什么 |
|------|--------|
| 影响范围 | 错了波及多大？ |
| 可逆性 | git revert / 重建够不够？ |

| 档位 | 条件 | 人该做什么 |
|------|------|------------|
| Tier 1 | 只读或完全可逆 | 扫一眼结果 |
| Tier 2 | 中等范围，git 可撤 | 方案 + diff 两检查点 |
| Tier 3 | 大范围或难撤 | **动手前**批准，不能事后才审 |

**课里真正可执行的 agent 原则（英文，供 merge）：**

1. Judge blast radius by **code paths and data touched**, not task wording — a path that deletes or overwrites sole-copy user data stays high-risk even for "optimize" or "cleanup".
2. Batch scan-and-apply over **existing** user data (merge, dedupe, migrate, bulk delete): list affected items first, wait for approval — never one-shot without a pause.
3. Before delete/clear/overwrite: sole-copy user data or unverified restore path → irreversible → approval before acting; regenerable cache rebuilt from a documented source may be lower risk.
4. Small diff ≠ low risk (schema migration, 2-line data script can be Tier 3).

**与 agent-controllability 去重：**

- 不新增「不可逆前等人确认」——**加强**已有 merge-queue 那条（补：批量已有数据、schema、sole-copy、意图词不降级）。
- 不新增 testing/output 条目——验证撤回是操作者习惯，不是 agent 测试义务。

**项目 Tier 3 缺口（人做，不写进全局 rule）：**

对 wiki 项目：prompt 代码、`fs.rs` 删移、`migrate-schema`、依赖/环境配置 — 查 Guide/Sensor 是否已覆盖；无则优先补。

Reference: `learn-maintain-wiki/reference/blast-radius-reversibility-checklist.html`

## Candidate rule lines

See `merge-queue/into-ai-behavior.md` and `into-prohibitions.md` — **3 candidates total** (was 11).

## Merge notes

- Fold 0005 into existing agent-controllability confirmation line; do not duplicate Tier framework in deployable files.
- Per-project Tier 3 paths → consumer `.myrules-context.md`.
