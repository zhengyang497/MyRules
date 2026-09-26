# MyRules 反向同步（capture-on-sync）设计

**Date:** 2026-09-26
**Status:** Draft for review
**Scope:** sync 自动回流 + 发布卡点；不动 push.js / git 分发模型
**上游决策:** 方案 A（sync 时自动回流，capture-on-sync）已获批准；方案 B（聚合 reconcile）、方案 C（软链接直编）被否决。

## Summary

手改发生在干活现场——「跳回缓存改」逆人性，堵不住源头。本设计把回流做成
**自动**：被手改的可反查产物在下一次 sync 时自动写回 `~/.myrules` 对应源文件，
然后照常部署、state 对齐。发布（`push.js`）成为唯一需要人做的事，并且躲不掉
——捕获让缓存变 dirty，下次 sync 会在 pull 闸门直接拒绝，直到 push。

三条支柱：

1. **捕获**：sync 发现 reversible 产物被手改 → 自动写回缓存源（保留源的
   frontmatter，只换正文），打印捕获清单：`Captured 2 edit(s) from wiki → run push.js to publish`。
2. **覆盖面**：凡 manifest 里有 `dest → src` 映射的都反查（rules、method 短
   规则、`docs/方法/*`、board 脚本、技能包）。真正不可逆的只有**组合产物**
   （agent 角色包、hook 散文/脚本、hooks.json、AGENTS 管理块——源是 JS meta /
   多文件合成），照旧告警并说明原因。
3. **两道安全闸**：
   - **乐观并发**：只有「你的改动基于当前缓存版本」（项目基线哈希 = 缓存现
     产出哈希）才捕获；缓存已被别的项目/机器改过 → 拒绝捕获、大声报告，
     绝不 ping-pong。
   - **发布卡点**：捕获让缓存变 dirty → 下次 sync 在 `push.js` 之前直接拒绝。

## 1. 目标与非目标

**目标**

- 项目里顺手改的 skill / 规则 / method 文件，下次 sync 自动回流缓存，不需要
  记住任何反向命令。
- 捕获绝不覆盖项目文件、绝不覆盖缓存里已被别人（另一个项目 / 另一台机器 /
  手工）推进过的版本。
- 「漏发布」不可能静默发生：忘 push = sync 拒跑（现有 dirty 闸门复用）。

**非目标**

- 组合产物的反向解析（见 §6）。
- 自动 commit / 自动 push——发布必须由人执行 `push.js`，捕获产生的改动要
  人在 push 前看得见（push 的 git diff 即审阅窗口）。
- 跨机同步仍走 GitHub push/pull，不变。
- capture 历史持久化、status 里的 pending 计数（YAGNI）。

## 2. 总体语义：capture-on-sync

sync 的项目阶段（syncOne）在**部署 pass 之前**新增一个**捕获 pass**
（`tools/sync/lib/capture.js`）：

1. 构建反查映射（§3），按**缓存源**分组部署产物（一个源 → 最多 4 个平台拷贝）。
2. 对每组，检查每个部署拷贝的状态（哈希语义沿用 drift 的三元组）：
   - `current` = 磁盘内容哈希
   - `baseline` = `state.deployedHashes[key]`（上次 sync 部署的内容哈希）
   - `desired` = 缓存源按体裁转换后将产出的内容哈希
3. 判定（§4）→ **捕获**或**拒绝**。捕获：写回缓存源、打印清单。
4. 照常进入部署 pass。捕获后 `desired == current`，writeTracked 干净写入；
   其他平台拷贝（还在 baseline）被正常更新到新内容，state 对齐。

幂等：捕获完成后再 sync，无 drift、无捕获、无输出。项目文件、缓存、state
三者收敛到同一内容。

## 3. 反查映射层与体裁转换

新增 `tools/sync/lib/reverse-map.js`（`export.js` 的 `diffSkills` / `skillSourceMap`
逻辑迁入这里，export 与 capture 共用一个映射层）。

**映射来源**（destRel → { sourceRel, kind }）：

| 条目形态 | 映射 | backfill（写回缓存） |
|---|---|---|
| 单文件 `src`/`dest`（rules、method 短规则、`docs/方法/*`、board 脚本） | `dest ↔ src` | 见体裁规则 |
| 目录 `srcDir`/`destDir`（skillPack、project-method） | `destDir/rel ↔ srcDir/rel` | 逐字节 |
| manifest 显式单文件（`project-method/templates/*` ← `method/core/templates/`） | 登记表 | 逐字节 |

**体裁规则**（backfill）：

- **逐字节类**（skill 全部文件、`docs/方法/*`、`scripts/*.mjs`、kind 为
  raw 的条目）：部署内容 = 源内容，写回即复制。skill 的 SKILL.md YAML 头是
  内容的一部分，不剥。
- **frontmatter 类**（`rules/*/*.md`、method 短规则源 `.mdc`）：**保留源文件
  的 frontmatter 块，只替换正文**。正文取法：`.mdc` 拷贝剥 Cursor 头
  （`stripCursorFrontmatter`），`.md` 拷贝即正文。源无 frontmatter 时整文替换。
  - 规则源的 `agents:` / `runtimes:` frontmatter 是语义字段（决定进哪些
    sub-agent 包），**永远保留**；在项目现场改 frontmatter 不是本设计支持的
    场景，要改就去缓存改。
- **不做跨体裁猜测**：一个源的 4 个平台拷贝正文必然一致（transform 只增删
  frontmatter）；写回后由部署 pass 自然再生各平台形态。

**排除**（不进映射，即不可捕获）：

- `instanceOwned: 'preserve'` 的条目（instanceLanding 语义：实例自己的文件，
  sync 从不写，也从不回流）。
- 组合产物（§6）。
- 缓存 `method/skills/` 里没有同名源的项目私有技能（不是托管产物）。

**用户级部署目标**同样在映射内：`~/.claude/rules/`、`~/.config/opencode/rules/`、
`~/.dsh/rules/` 下的 `myrules-user-*` 反查 `rules/user/<topic>.md`。手改这些
文件会在**任一项目**的下一次 sync 时被捕获回用户级源（它们是共享产物，基线
哈希记在各项目 state 里，判据与项目文件相同）。

## 4. 冲突检测（乐观并发）

对每组（一个缓存源 + 全部平台拷贝）：

1. **干净组**：所有拷贝 `current == desired` → 无动作。
2. **缓存前进组**：拷贝 `current == baseline`，但 `desired` 变了 → 正常部署
   更新（现有行为，非捕获）。
3. **手改组**：存在拷贝 `current` 既不等于 `desired` 也不等于 `baseline` → 尝试捕获，条件全满足才捕获：
   - **基线匹配**：`baseline` 存在且 `baseline == desired`——你的手改基于
     当前缓存版本。`baseline != desired` 说明缓存在你之后又改过（别的项目
     捕获过 / 别的机器 push 过 / 手工改过缓存）→ **拒绝**，报告冲突。
   - **无基线**（state 丢失、老 state、第一次见这文件）→ **拒绝**，保守。
   - **平台一致**：手改的多个拷贝**正文彼此一致**才捕获；两个平台改出不同
     内容 → **拒绝**（无法自动裁决谁对），报告两边路径。
   - **单拷贝捕获**：只有一个拷贝被改 → 捕获它，其余平台由部署收敛。
4. **拒绝时的行为**：文件照旧保留（永不覆盖），告警升级为冲突语气，列出
   涉及路径与「缓存版本 ≠ 你的基线」的原因，给出人工处置建议（对照缓存源
   手工合并 → push，或 `--force` 放弃本地改动）。
5. **ping-pong 防线**：捕获只在 `baseline == desired` 时发生，且捕获后
   baseline 立即更新为新产出——两个项目先后改同一文件，只有先 sync 的那个
   能捕获；后 sync 的必然 `baseline != desired` 被拒。不可能来回覆盖。

同一次 `--all` run 内多项目：按 registry 顺序处理，先捕获者改写缓存源，后
项目的同源改动自然落入第 3 条拒绝路径（baseline ≠ desired）。这是有意的：
同一 run 内两个项目改同一文件 = 真冲突，必须人裁决。

## 5. 发布卡点（hard gate）

- 捕获写入缓存 → 缓存 dirty。**下次 sync 在现有 pull 闸门处直接拒绝**
  （`git.isDirty(cacheDir)` → 报错退出），这是已存在的行为，捕获自动搭上
  这道闸，不新增机制。
- 闸门报错文案升级：`…has uncommitted changes (possibly captured edits). Run node tools/sync/push.js to publish, or resolve manually.` ——明说
  「可能有捕获的改动」和解法。
- 同一次 run 内：闸门在 run 开头检查一次；本 run 内的捕获不影响同 run 后续
  项目（pull 本来就只做一次）。
- `push.js` 不变（上一轮已修「干净工作区也必须 push」的 bug）：捕获产生的
  改动由 `push.js` 一次性 commit + push，commit diff 就是审阅窗口。

**失败处理表**（新增行加粗）：

| 情况 | 行为 |
|---|---|
| **手改可反查产物，基线匹配** | **自动捕获入缓存，打印清单，照常部署** |
| **手改可反查，缓存已前进 / 无基线 / 平台分歧** | **拒绝捕获，冲突告警，文件保留** |
| 手改组合产物 | 告警保留（永不覆盖），指引改缓存源 |
| **捕获后未 push 再 sync** | **pull 闸门拒绝，提示 push.js** |
| `--no-capture` | 跳过捕获 pass，退回「告警 + export 手动」模式 |

## 6. 不可逆产物与告警

保持现状语义（drift = 永不覆盖，每次告警），sync 告警分两档：

- **可捕获**（reversible）：不告警——被静默捕获 + 打印捕获清单（§7）。
- **不可逆**（irreversible）：agent 角色包（`transformForAgent` 多源合成 +
  frontmatter 生成）、hook 脚本 / hook 散文（源是 `hooks/*/*.js` 的 meta +
  handle）、`hooks.json` 条目、AGENTS.local.md / `~/.dsh/AGENTS.md` 管理块
  （多源装配）——告警文案注明「合成产物无反查通道，改 `~/.myrules` 源后
  push，或 --force 接受缓存版」。

（`export.js` 保留全量报告模式供人预览任何差异，不受这两档影响。）

拒绝捕获的冲突文件用冲突语气单独列出（不属于上面任何一档）。

## 7. CLI、逃生阀与工具关系

| 工具 | 定位 |
|---|---|
| `sync.js` | 部署 + **自动捕获**（默认开启）；`--no-capture` 退回告警模式 |
| `export.js` | **预览**：报告差异（不变）；`--apply` 手动写回（与 capture 共用 reverse-map） |
| `push.js` | 唯一发布动作：commit + push（不变） |
| `status.js` | 不变（pending capture 计数为非目标） |

同步日志输出（捕获清单在部署报告之前）：

```
Captured 2 edit(s) into ~/.myrules (run push.js to publish):
  .cursor/skills/writing-for-the-reader/SKILL.md -> method/skills/writing-for-the-reader/SKILL.md
  .claude/rules/myrules-testing.md -> rules/project/testing.md (body only, frontmatter preserved)
```

**文档**：`skills/myrules/REFERENCE.md`（Edit workflow 改为「项目里改 → sync
捕获 → push 发布」；Safety rules / 失败处理表同步）、`COMMANDS.md`（export
降级为预览工具）。`manifest.js` skillPack 注释更新。

## 8. 测试与验证

**单元**（`tests/`，node:test）：

- `reverse-map.test.js`：映射生成（单文件 / 目录 / 显式登记 / preserve 排除 /
  私有技能排除）、体裁 backfill（frontmatter 保留、.mdc 剥头、逐字节类）。
- `capture.test.js`：捕获三条件（基线匹配 / 无基线拒绝 / 平台分歧拒绝）、
  单拷贝捕获后他平台收敛、缓存前进不捕获、`--no-capture`、幂等（二次 sync
  零动作）、ping-pong（两项目先后改同一源，后者被拒）。
- 既有 drift 测试不受影响（capture pass 在 drift 之前把可捕获文件消解掉，
  不可逆产物仍走 drift）。

**集成**：sync run 捕获 → 缓存 dirty → 再 sync 被闸门拒绝 → push → sync 收敛
（端到端一条）。

**真机验证**（wiki 项目，模式同 2026-09-25 的五步闭环）：手改 skill → sync
自动捕获（不再需要 export --apply）→ 二次 sync 被闸门拦 → push → sync 全绿 →
现场还原。

**回归**：`npm test` 全量通过（现 282 条基线）。

## 决策记录

| 决策 | 理由 |
|---|---|
| 自动捕获默认开启 | 用户场景是「顺手改」，任何需要记命令的方案都会漏 |
| 捕获条件 = baseline == desired | 唯一能证明「你的改动基于当前缓存」的判据，天然防 ping-pong |
| 平台分歧拒绝而非择优 | 两个平台改出不同内容是真冲突，自动裁决=静默覆盖的变种 |
| frontmatter 保留、只换正文 | `agents:`/`runtimes:` 是语义字段，现场改正文才是主场景 |
| 不自动 commit/push | push 的 diff 是捕获改动唯一审阅窗口；发布必须人做 |
| 复用 dirty 闸门做卡点 | 机制已存在且已验证，零新增状态 |
| `export` 保留 | 预览与手动回流逃生阀；与 capture 共用映射层，无重复逻辑 |
| `--no-capture` 逃生阀 | 极端场景（想让手改停在项目里不扩散）有退路 |
| `--force` 跳过捕获 | `--force` 的既有语义是丢弃本地改动；捕获默认开启后二者互斥，`--force` = 明确要缓存版。`--no-capture` 才是「保留本地改动但不回流」的开关 |
