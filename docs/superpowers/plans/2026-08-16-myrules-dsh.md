# MyRules 支持 dsh（DeepSeek Harness）— 修改方案

> **For agentic workers:** 按任务逐项实施（`- [ ]` 勾选跟踪）。每个任务先写失败测试再实现，最后跑全量 `node --test tests/`。
> 文中「dsh 约定」已对照官方文档核实（截至 2026-08，dsh 仍标注 developer preview，接口可能破坏性变更，落地前请按锁定版本复核）。

**目标：** 让 MyRules 把 **rules / skills / hooks / method pack / 角色包（sub-agents）** 五条渠道同步部署到 dsh，与现有 Cursor、Claude、OpenCode 三个平台并列。

**一句话结论：** MyRules 的架构（manifest 配置 + paths/transform/deploy 分平台分支）天然可扩展，接入 dsh 不需要重构。渠道差异各有归宿：**规则**因 dsh 无规则目录，多一步「AGENTS.md 管理块拼接」；**角色包**映射为官方命名委派工具（`dsh-tool-subagent` 实例）；**hooks** 走官方 Claude Code 桥（需事件映射与输出适配）；**skills / method pack** 只是加部署目标。

---

## 1. dsh 约定核对表（verified）

| 概念 | dsh 的做法 | 来源 |
|---|---|---|
| 用户级常驻指令 | 固定的 `$DSH_HOME/AGENTS.md`（默认 `~/.dsh/AGENTS.md`），**唯一入口，无 local 覆盖层** | [agent-instructions README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/context/agent-instructions/README.md) |
| 项目级常驻指令 | 从项目根（最近的含 `.git` 祖先）到会话 cwd 的路径链上，每层目录的 `AGENTS.md`、`CLAUDE.md` 全部加载（宽→窄排序）；`AGENTS.local.md`、`CLAUDE.local.md` 作为叠加覆盖层 | 同上 |
| **不支持** | 小写文件名候选、`.claude/rules/`、`@path` 导入、任意 glob —— 官方明确「Candidate semantics stay intentionally small」 | 同上（Known Limitations） |
| 指令预算 | 整条基线消息 `maxBytes` 默认 **65,536 字节**；超预算时先整体丢更宽的文件，再截最窄的文件 | 同上 |
| 指令刷新 | touch 驱动：会话中 `read`/`write`/`edit` 触达后增量注入；**外部改动不自动生效**（无 watcher），resume 时对账 | 同上 |
| Skills | 发现根（优先级从高到低）：`<project>/.dsh/skills` → `<project>/.agents/skills` → `$DSH_HOME/skills`（`~/.dsh/skills`）→ `$DSH_AGENTS_HOME/skills`（`~/.agents/skills`）。格式：一层深的 `<name>/SKILL.md` 目录包或 `<name>.md` 扁平文件；名字 kebab-case；frontmatter 认 `disable-model-invocation`、`user-invocable`（默认都 true）。**实时监听、免重启** | [skills 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md) |
| Hooks | **官方能力族 `packages/hooks`**：共享引擎 `hook-protocol` + 两个桥接插件 `@deepseek-ai/dsh-hooks-claude-code` / `@deepseek-ai/dsh-hooks-codex`——**直接复用 Claude Code `hooks.json`（或 settings 的 `hooks` 键）的命令钩子**，在 session 启动、prompt 到达、工具前后、停止、子代理起止时触发；可拦截 prompt/工具、注入上下文、强制续跑。仅支持 shell 命令处理器（CC 30 个事件中支持 7 个）；`SessionStart`/`UserPromptSubmit` 只消费 **JSON `additionalContext`**（裸 stdout 不算）；`configPath` 是 **process 级**、启动时读一次 | [packages/hooks 能力族](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/hooks/README.md)、[hooks-claude-code README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/hooks/hooks-claude-code/README.md) |
| Profile / 插件 | profile 树 = 各 bundle 补丁 → `cordis.patch.yml` → `--patch overlays`；**CLI/手写改动由 HMR watcher 热加载**（`ChangeResult` 含 `applied`/`restart-required`/`overridden`/`failed`，仅部分变更需重启）；`installBundle` 支持 **npm / 本地路径 / git / tarball**（包须带 bundle 补丁，否则安装回滚）；`ctx.configEditor.edit()` 可程序化改配置 | [boot 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/boot.md)、[cordis-primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md) |
| Agent 预设 | `dsh-agent-preset`：用 Cordis YAML 声明**命名组合**（`id/name/description/plugins`），会话择一；是「整会话的组合选择」，不是派工目标（角色派工仍归 tool-subagent 实例）；该包自带 creator 技能 `cordis-plugin-development` 等 | [agent-preset README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/agent-preset/README.md) |
| Agent Teams（实验） | `@deepseek-ai/dsh-experimental-agent-team`：Lead + **具名常驻队友**（`spawn_teammate`，fresh/fork）、持久消息邮箱（Steer 投递、离线入队）、共享任务 DAG（`blockedBy` 依赖 + `writeScopes` 提示 + CAS 乐观锁）、`waitForChange`/`interrupt`。**名册 = 一次对话**（`TeamId` = 根 `SessionId`，Lead 会话日志为唯一真源）；队友名字 lower-kebab-case 精确匹配、**工具集固定**（无 model/工具裁剪）；实验特性默认关闭，需插件页启用 | [agent-team 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md) |
| 自定义子代理 | 没有 `.claude/agents/` 式**文件定义** agent，但有一等公民的**命名委派目标**：`@deepseek-ai/dsh-tool-subagent` 按「一个委派目标一个实例」挂载，各有独立 `toolName`；实例配置 `persona`（角色人格，注入子代理 system prompt）、`toolFilter`（`{allow/deny}` 工具清单，**真实强制**：被禁工具在子代理里直接消失且拒绝执行）、`maxDepth`（递归深度，禁工人再派）。官方原话："another persona, tool filter, or depth cap requires another distinctly named tool" —— **「每角色一个命名委派工具」就是 dsh 的官方模式** | [tool-subagent README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/tool-subagent/README.md)、[subagent 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md)、[tools 子系统（ToolRestriction）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md) |
| 插件配置 | 一切扩展走 cordis 插件（`cordis.yml` / `cordis.patch.yml`，按 profile：web/desktop/headless），配置面见 config-catalog | [config-catalog](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/config-catalog.md) |
| 斜杠命令 | 插件注册的人机命令 + skill 的 `/name` 直呼（手打 `/skill-name` 注入该 skill 正文） | [commands 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/commands.md)、[brooks-lint dsh-setup](https://github.com/hyhmrright/brooks-lint/blob/main/docs/dsh-setup.md) |

---

## 2. 五条渠道在 dsh 的落点

| MyRules 渠道 | Cursor | Claude | OpenCode | **dsh（本方案）** |
|---|---|---|---|---|
| Rules（常驻） | `.cursor/rules/*.mdc` | `.claude/rules/*.md` | `.opencode/rules/*.md` + `opencode.json` instructions | `.dsh/rules/myrules-*.md`（落盘留档）**+ 拼接进 `AGENTS.md` 管理块**（真正生效的载体） |
| 用户 Rules | 并入项目 | `~/.claude/rules/` | `~/.config/opencode/rules/` | `~/.dsh/rules/`（留档）+ `~/.dsh/AGENTS.md` 管理块 |
| Skills（订阅 + bootstrap + project-method） | `.cursor/skills/` | `.claude/skills/` | 借用 `.claude/skills/` | `.dsh/skills/` + `~/.dsh/skills/` |
| 角色包（planner/implementer/…） | `.cursor/agents/*.md` | `.claude/agents/*.md` | `.opencode/agents/*.md` | **命名委派工具（一等公民，不降级）**：角色文件 `.dsh/agents/myrules-<role>.md` + 每角色一个 `dsh-tool-subagent` 实例（`persona`=角色正文、`toolFilter`=只读强制、`maxDepth`=1）；project runtime 可用 Agent Teams `spawn_teammate` 队友（P-C，见决策 2） |
| Hooks | `.cursor/hooks.json` 自动触发 | 散文惯例（`myrules-hook-*.md`） | 不部署 | **官方 `dsh-hooks-claude-code` 桥自动触发**（CC hooks.json 子集；事件映射见决策 3）；桥不支持的事件保留散文惯例 |
| Method pack | `docs/方法/*` + method 短规则 + skill + scripts | 同左 | 同左 | 同左，新增 dsh 目标：method 短规则 → `.dsh/rules/`（进管理块），`project-method` skill → `.dsh/skills/project-method/` |

---

## 3. 关键设计决策

### 决策 1（规则渠道）：`AGENTS.md` 管理块 —— 推荐

dsh 只认 `AGENTS.md`/`CLAUDE.md` 文件链，没有规则目录、没有 instructions glob。两个可行方案：

- **方案 A（推荐，零机器配置）**：MyRules 在 `<project>/AGENTS.md` 与 `~/.dsh/AGENTS.md` 中维护一个**带标记的管理块**（`<!-- myrules:begin -->` … `<!-- myrules:end -->`），块内拼接所有规则正文。块外的用户内容永远不读不写。
  - 优点：任何机器、任何 profile 开箱即用；机制与 `gitignore.js` 的管理块完全同构（该模块就是现成模板：`MARKER` + `blockEndIndex` + 归一化比较）。
  - 缺点：动了保护清单里的 `AGENTS.md`。需要把保护语义从「整文件只读」放宽为「管理块之外只读」。
- **方案 B（更干净，但要一次机器级配置）**：部署 `<project>/MYRULES.md`，并通过 `cordis.patch.yml` 给 `@deepseek-ai/dsh-agent-instructions` 的 `instructionFileCandidates` 加一个候选名。代价：每个 profile 都要打补丁、要重启、且 patch 有**静默失败**的坑（override 式条目缺 `insert:` 时只给 loader warning，看起来像成功）；用户级入口依旧是固定 `~/.dsh/AGENTS.md`，躲不开管理块。
  - 结论：B 只解决项目侧、还引入插件补丁，Phase 1 不采用，留作 Phase 3 备选。

**管理块实现要点：**
- 每主题仍有独立落盘件 `.dsh/rules/myrules-<topic>.md`（项目）/ `~/.dsh/rules/myrules-user-<topic>.md`（用户）——它们是**留档与漂移/回流（export）的载体**，沿用 `drift` 追踪器与 `export.js` 反向映射，与其它平台完全一致。
- 管理块是**由这些落盘件拼接出的投影**：每个主题一节 `## myrules: <topic>`，顺序按文件名排序（method 短规则、hook 散文同理，一并进块）。
- 漂移语义：块外内容永不触碰；块内被手改 → 报 drifted、跳过重写（`--force` 才覆盖块内）。
- 预算意识：`maxBytes` 65,536 管的是「用户全局 + 项目链」整条基线，而且**先丢更宽的文件**（即 `~/.dsh/AGENTS.md` 会先于项目 `AGENTS.md` 被丢）。sync 输出里对「用户块 + 项目块 > 55KB」给警告。

### 决策 2（角色包）：映射为 dsh 命名委派工具 —— 一等公民，禁止降级为 skill

**角色包不是「可按需阅读的说明文」，而是「独立上下文 + 权限约束 + 按名召唤」的派工单元**，skill 的按需加载语义与之冲突，因此不采用 skill 化（本方案修订前的降级提议作废）。dsh 提供了语义完全对应的原生机制：

**语义映射（角色包 → `dsh-tool-subagent` 实例）**

| MyRules 角色包字段 | dsh 命名委派工具 | 说明 |
|---|---|---|
| 角色名（planner/implementer/…） | 独立 `toolName`（如 `subagent_planner`） | 模型按名召唤，与今天 `.cursor/agents/` 体验一致 |
| `description` | 角色工具的用途说明 | 写入规则块的「角色工具表」+ 角色文件 frontmatter |
| 角色正文（`composeAgentBody` + `WORKER_FOOTERS`） | `persona` | 注入子代理 system prompt 的 `deployment:persona-prefix`，等价于角色定义 |
| `readonly: true` | `toolFilter: { deny: [...] }` | **真实强制**：write/edit/shell 等工具在子代理中消失且拒绝执行——比 Cursor 的 `readonly: true`（模型自律）更硬 |
| `model: "inherit"` | 不配 `agentOptions` | 默认继承路由 |
| 工人不得再派工 | `maxDepth: 1` | 子代不能再起孙代（`0` 是禁止该工具本身派工） |
| 派工返回结果 | `backgroundMode: one-shot`（默认） | 前台等待结果，即现有「派工卡 → 工人交回」语义 |

**两条投递路径（同一语义，任选其一；6a 先行，6b 是目标形态）：**

- **P-A 纯配置（零代码，Phase 1）**：sync 生成并维护 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 的 **MyRules 托管块**（带标记管理块，机制同 `gitignore.js`），每角色一行 `@deepseek-ai/dsh-tool-subagent` 配置（`provider: spawn` + `toolName` + `persona` + `toolFilter` + `maxDepth`）。角色正文仍落盘 `.dsh/agents/myrules-<role>.md`（留档/漂移/回流），patch 由角色文件生成。条目写法遵循 Loader（`cordis-plugin-include`）语义，以 `dsh plugin add`/`ctx.configEditor` 产出的条目为样例，勿凭空手写。
  - 注意事项：① `persona` 是内联文本（YAML 块标量），正文中的 `{{` 会触发 Loader 的 `!!js`/模板插值语义，生成器必须转义；② 改角色/规则 → 重写 patch → **HMR watcher 热加载即可生效**（boot 子系统明确 CLI/手改由 watcher 应用；`ChangeResult` 中少数情形标 `restart-required` 才需重启）；③ `toolFilter` 的工具名必须在该部署真实存在，未知名会 **fail loud**（`tools.restrict` 明确拒绝 unknown names）——deny 清单要按平台核对（shell 工具 Windows 上是 `pwsh`、别处是 `bash`）；④ patch 由 Loader 合成（bundle 补丁 → `cordis.patch.yml` → `--patch overlays`），写后**必须校验**（社区实测存在静默跳过的失败模式）；可用 `ctx.configEditor.edit()` 同源的 Loader 路径做程序化改写。
- **P-B 自研插件（目标形态，Phase 2）**：MyRules 发布一个小型 cordis 插件（`dsh plugin add` / `installBundle` 安装到各 profile——官方支持 **npm / 本地路径 / git / tarball**；包须带 bundle 补丁，否则安装自动回滚），启动时读取 `.dsh/agents/myrules-<role>.md`，用 `defineTool` + `ctx.tools.register` 为每个角色注册命名委派工具，`execute` 内调 `ctx.subagents.start('spawn', { persona, toolFilter, maxDepth, prompt: 角色正文 + 任务 })`。dsh 的 `dsh-agent-preset` 包自带 creator 技能（`cordis-plugin-development` 等），可让 dsh 会话内的 agent 按官方流程编写该插件。
  - 相对 P-A 的增益：角色保持**文件形态**（改角色/规则无需重写 patch）；`toolFilter` 的 deny 集合在运行时按实际注册工具计算（根治跨平台工具名问题）；工具 `description` 可用角色的 `description`（比 stock 工具的通用措辞更利于模型选角）。
  - 另注：`dsh-agent-preset` 的命名组合（preset）是**会话级组合选择**（如 coordinator 席位可做成一个 preset），不是派工目标；角色派工一律走 tool-subagent 实例。
- **P-C Agent Teams 队友（project runtime 协作派工；实验特性）**：`spawn_teammate` 把角色包变成**具名常驻队友**——`name`=角色名（lower-kebab-case，`implementer`/`reviewer`/`publisher` 恰好合法）、`description`=`roleMeta.description`、`prompt`=角色正文 + 派工卡、`context: fresh`（新工人，任务书须完整）或 `fork`（继承 coordinator 上下文接续干活）。持久消息回报、共享任务 DAG（依赖/写范围提示/CAS）、`waitForChange`/`interrupt`——与 MyRules 项目工作法的「派工卡 → 工人交回 → 看板」**同构度极高**，适合 project runtime 的 coordinator 席位（参考实际会话的用户验证结论）。
  - 限制（如实声明）：队友**工具集固定**，readonly 角色（researcher/reviewer）**无法工具级强制**——只能靠角色正文的工人纪律文本，或整个会话用「仅可查看」权限预设；模型路由默认继承，不可按队友指定；名册与队友记忆**只在当前对话内**持久（`TeamId`=根 `SessionId`，新对话=新名册、名字释放）；experimental，插件默认关闭需手动启用；共享 checkout 无文件锁，靠 `writeScopes` 提示协调。
  - **自动引用问题**（参考会话讨论的落点）：DSH **不会**自动读 `.claude/agents/` 等角色文件——要「真自动」必须把组队规则写进 AGENTS.md 管理块：**组建 teammate 前先 `read` `.dsh/agents/myrules-<role>.md`，把正文完整放入 `prompt`**（见 Task 6d）。
  - 与 P-A/P-B 的分工建议：agent runtime 的一次性派工走命名委派工具（`toolFilter` 硬约束 + one-shot 返回结果）；project runtime 的 coordinator 常驻协作走 Teams（消息/看板/等待语义）。两条并存，`.dsh/agents/` 角色文件是共同来源。

**附加语义说明：** dsh 的子代理在**同一 workspace** 创建，会自动获得自己的 `~/.dsh/AGENTS.md` + 项目 AGENTS.md 链基线（即规则管理块）。角色正文仍按其它平台的完整形态内嵌规则分节（自包含、且不依赖基线预算未被截断），接受与基线的少量重复。

### 决策 3（hooks）：走官方 `dsh-hooks-claude-code` 桥，真自动触发（修订：不再是「Phase 2 可选」）

官方 `packages/hooks` 能力族可以直接跑 **Claude Code 格式的 `hooks.json`**（或 settings 文件的 `hooks` 键）里的 shell 命令钩子。MyRules 现有 hook 源（`meta.event` + `handle`）可以真实部署到 dsh，只需两件适配：**事件名映射**和**输出形状适配**。

**事件映射（MyRules `meta.event` → 桥支持的 CC 事件）：**

| MyRules hook | meta.event | dsh 桥事件 | 落地形态 |
|---|---|---|---|
| `session-start-context`（注入 `.myrules-context.md`） | `sessionStart` | `SessionStart` ✅ | 钩子输出 **JSON `additionalContext`**（裸 stdout 无效；wrap 脚本转换 `handle()` 返回值） |
| `subagent-start-worker`（放行工人） | `subagentStart` | `SubagentStart` ✅ | 语义降为「可注入上下文」（observe 性质；拦截放行语义在 dsh 无对应），可顺带注入工人纪律 |
| `session-log`（会话结束记活动日志） | `sessionEnd` | `SessionEnd` ❌ **桥不支持**（23 个未支持事件之一） | 保留散文惯例进规则块；或 Phase 3 用原生插件挂 `agent/turn-stopping` 等扩展点 |

**部署形态：**

1. 每个 profile 组合里挂一行 `@deepseek-ai/dsh-hooks-claude-code`，`configPath` 指向 MyRules 生成的用户级 hooks 配置（**CC schema**，与现有 `.cursor/hooks.json` 的 Cursor schema 不同，需新增转换目标）；命令串用 **`$CLAUDE_PROJECT_DIR` 环境变量**（每 run 解析到会话 workspace）引用项目内脚本，不要用 parse-time 的 `${CLAUDE_PROJECT_DIR}`。
2. hook 脚本部署到 `.dsh/hooks/myrules-*.js`（项目）与 `~/.dsh/hooks/`（用户），CLI 包装层把 `handle()` 的返回值转换为 CC 输出（`hookSpecificOutput.additionalContext` 等）。
3. 注意桥的**限制**（写进 REFERENCE）：`configPath` process 级、启动读一次（暂无 per-project 发现与热重载）；同事件串行执行；配置读失败只告警不阻塞；`Stop` 拦截会强制续跑（要自限）；`transcript_path` 恒为空。
4. 桥不支持的事件继续走散文惯例（进 AGENTS.md 管理块），与 Claude 平台体验一致。
5. 插件安装走官方 `dsh plugin add` / `installBundle`（支持本地路径、git、tarball）；组合行写入 `cordis.patch.yml` 后由 **HMR watcher 热加载**（不必重启；少数变更为 `restart-required`）。patch 写法以 Loader 语义为准，MyRules 侧必须做**写后校验**（社区实测存在静默跳过的失败模式）。

---

## 4. File Map

| 路径 | 动作 | 职责 |
|---|---|---|
| `manifest.js` | 修改 | `platforms` 加 `"dsh"`；新增 `dsh` 配置块；`bootstrap.dsh.skillDir`；`method.files` 增 dsh 目标 |
| `tools/sync/lib/paths.js` | 修改 | dsh 路径解析器 |
| `tools/sync/lib/transform.js` | 修改 | `transformForDsh`；`transformForAgent` 加 `platform: 'dsh'`（产出角色文件） |
| `tools/sync/lib/deploy.js` | 修改 | 规则落盘 `.dsh/rules/`（项目 + 用户）+ `isRuleStateKey` / `staleRuleCleanup` |
| `tools/sync/lib/dsh-instructions.js` | **新建** | AGENTS.md 管理块的构建与幂等 upsert（项目 + 用户） |
| `tools/sync/lib/deploy-agents.js` | 修改 | 角色包 → `.dsh/agents/myrules-<role>.md`（角色文件，含 description/readonly frontmatter） |
| `tools/sync/lib/dsh-roles-deploy.js` | **新建** | 由角色文件生成 `cordis.patch.yml` 管理块：每角色一个 `dsh-tool-subagent` 命名委派实例（P-A） |
| `tools/sync/lib/project-skill.js` | 修改 | bootstrap skill 目标 `.dsh/skills/myrules` |
| `tools/sync/lib/skills.js` | 修改 | 外部订阅 skill 增 `~/.dsh/skills` 目标 |
| `tools/sync/lib/hooks-deploy.js` | 修改 | hook 散文镜像到 `.dsh/rules/`（进块） |
| `tools/sync/lib/gitignore.js` | 修改 | gitignore 管理块加 `.dsh/rules/myrules-*` 等 |
| `tools/sync/lib/legacy.js` | 修改 | 扫 `.dsh/rules/` 非托管文件 |
| `tools/sync/lib/export.js` | 修改 | 反向映射扫描加 dsh 目录 |
| `tools/sync/lib/state.js` | 修改 | `deployedDshBlocks` 字段 |
| `tools/sync/sync.js` | 修改 | 接线（项目块在 method 之后；用户块进 `run`）；skill 安装自愈 |
| `tests/*` | 修改/新建 | 与任务一一对应；外加 cursor/claude/opencode 字节级回归快照 |
| `README.md`、`skills/myrules/SKILL.md`、`skills/myrules/REFERENCE.md`、`skills/myrules/COMMANDS.md` | 修改 | 文档面（含保护语义放宽说明） |

---

## 5. 任务分解

### Task 1：manifest 配置块 + 路径解析器

**文件：** `manifest.js`、`tools/sync/lib/paths.js`；测试 `tests/paths.test.js`

`manifest.js` —— `platforms: ["cursor", "claude", "opencode", "dsh"]`，新增：

```javascript
  dsh: {
    projectRulesDir: ".dsh/rules",
    userRulesDir: "~/.dsh/rules",
    extension: ".md",
    projectSkillsDir: ".dsh/skills",
    userSkillsDir: "~/.dsh/skills",      // 实际路径 $DSH_HOME/skills
    agentsFile: "AGENTS.md",             // 项目级（管理块宿主）
    userAgentsFile: "~/.dsh/AGENTS.md",  // 用户级（管理块宿主）
    blockBegin: "<!-- myrules:begin -->",
    blockEnd: "<!-- myrules:end -->",
  },
```

`bootstrap` 块加 `dsh: { skillDir: ".dsh/skills/myrules" }`；`method.files` 追加（与 cursor/claude 的 method 短规则一一对应）：

```javascript
      { src: "method/core/rules/myrules-method-small.mdc",   dest: ".dsh/rules/myrules-method-small.md",   runtimes: BOTH, kind: "dsh-rule" },
      { src: "method/core/rules/myrules-method-session.mdc", dest: ".dsh/rules/myrules-method-session.md", runtimes: BOTH, kind: "dsh-rule" },
      { src: "method/agent/rules/myrules-method-agent.mdc",  dest: ".dsh/rules/myrules-method-agent.md",  runtimes: ["agent"], kind: "dsh-rule", instanceOwned: "drop" },
      { src: "method/project/rules/myrules-method-coordinator.mdc", dest: ".dsh/rules/myrules-method-coordinator.md", runtimes: ["project"], kind: "dsh-rule" },
      { srcDir: "method/skills/project-method", destDir: ".dsh/skills/project-method", runtimes: BOTH, instanceOwned: "preserve" },
      // 三个 templates 同理追加 .dsh/skills/project-method/templates/*（与 .cursor/.claude 条目并列）
```

`deploy-method.js` 的 `contentForEntry` 把 `kind: 'dsh-rule'` 与 `'claude-rule'` 同等处理（`stripCursorFrontmatter`）。

`paths.js` 新增并导出：

```javascript
getDshProjectRulesDir(projectRoot)   // <project>/.dsh/rules
getDshUserRulesDir(homeDir)          // <home>/.dsh/rules
getDshProjectSkillsDir(projectRoot)  // <project>/.dsh/skills
getDshUserSkillsDir(homeDir)         // <home>/.dsh/skills
getDshProjectAgentsFile(projectRoot) // <project>/AGENTS.md
getDshUserAgentsFile(homeDir)        // <home>/.dsh/AGENTS.md
```

- [ ] 测试先行（`tests/paths.test.js` 追加 6 个用例）→ 失败 → 实现 → 通过 → commit

### Task 2：transform 层

**文件：** `tools/sync/lib/transform.js`；测试 `tests/transform.test.js`

- `transformForDsh(body)` → 原样返回（纯 markdown，同 Claude）。
- `transformForAgent({ ..., platform: 'dsh' })` → **角色文件**（`.dsh/agents/myrules-<role>.md` 的内容）：

```javascript
  } else if (platform === 'dsh') {
    // dsh 命名委派工具的角色文件：frontmatter 供 patch 生成器/插件读取
    return [
      '---',
      yamlLine('name', agentName),                    // myrules-planner 等
      yamlLine('description', roleMeta.description),
      `readonly: ${roleMeta.readonly === true}`,       // → toolFilter 的依据
      '---',
      '',
      body,
    ].join('\n');
  }
```

注意：该文件**不是 skill**，是角色定义（persona 的来源）；正文沿用 `composeAgentBody` 分节。

- [ ] 测试：dsh 角色文件含 `name:`、`description:`、`readonly: true`、正文分节；不产出 `model:`/`permissionMode:`/`mode:`/`permission:`；cursor/claude/opencode 输出不变（回归断言）。

### Task 3：规则落盘 `.dsh/rules/`（含用户目录）

**文件：** `tools/sync/lib/deploy.js`；测试 `tests/deploy.test.js`

完全镜像 opencode 分支的模式（对照 `deploy.js:79-107`）：

- `opts.dshUserDir`（测试覆盖，默认 `paths.getDshUserRulesDir()`）；`dshProjDir = paths.getDshProjectRulesDir(projectRoot)`。
- user 分类 → `~/.dsh/rules/myrules-user-<topic>.md`，state key `~dsh-user~/<name>`；**不再**像 opencode 那样复制进项目（dsh 的用户全局指令天然常驻，无需复制）。
- project 分类 → `.dsh/rules/myrules-<topic>.md`，state key `.dsh/rules/<name>`。
- `isRuleStateKey` 增加 `.dsh/rules/`、`~dsh-user~/`；`staleRuleCleanup` 增加 `dshUserDir` 参数并解析 `~dsh-user~/` 前缀。
- **先给现有 5 个 deploy 测试补 `dshUserDir` 假目录**（hermetic，独立 commit，同 opencode 计划 Step 0 的做法），再写失败测试、再实现。
- 加一条 cursor/claude/opencode 输出的**字节级快照回归测试**（本任务不动它们的输出）。

### Task 4：`dsh-instructions.js` —— AGENTS.md 管理块（核心新件）

**文件：** `tools/sync/lib/dsh-instructions.js`（新建）；测试 `tests/dsh-instructions.test.js`（新建）

接口：

```javascript
buildBlock({ title, sections })      // sections: [{ topic, body }] → 管理块文本（含 begin/end 标记）
upsertBlock(agentsFile, block, { force, priorHash })
  // → { wrote, drifted, blockHash }；块外内容逐字保留；块不存在则追加（空文件不加分隔）；
  // 块内被手改（≠ priorHash 且 ≠ 新块）→ drifted，跳过；force 才覆盖块内
deployProjectInstructions(projectRoot, opts)
  // 读 <project>/.dsh/rules/myrules-*.md（以磁盘生效内容为准：已写入或漂移保留的）
  // 每文件一节 `## myrules: <topic>`，按文件名排序 → upsert 进 <project>/AGENTS.md
deployUserInstructions(homeDir, opts)
  // 读 ~/.dsh/rules/myrules-user-*.md + myrules-hook-*.md → upsert 进 ~/.dsh/AGENTS.md
```

实现要点：

- 块边界检测照抄 `gitignore.js` 的 `blockEndIndex`/`normalizeBlock` 思路，标记换成 `manifest.dsh.blockBegin/blockEnd`。
- 块首放一行说明：`<!-- generated by myrules sync — edit ~/.myrules/rules/ or .dsh/rules/myrules-*.md, not this block -->`。
- 预算卫兵：拼好的块 + 用户块 > 55KB 时在返回值里给 `budgetWarning`，由 `sync.js` 打印。
- 测试覆盖：新建 AGENTS.md、用户已有内容不动、幂等 second run、手改块内 → drifted 且不覆盖、`--force` 覆盖、块内 `## myrules:` 分节正确、begin/end 标记唯一。

### Task 5：skills 三路接入（bootstrap / 订阅 / project-method）

**文件：** `tools/sync/lib/project-skill.js`、`tools/sync/lib/skills.js`、`manifest.js`；测试 `tests/project-skill.test.js`、`tests/skills.test.js`

- `project-skill.getDefaults` 加 `dshSkillDir: bootstrap.dsh?.skillDir || '.dsh/skills/myrules'`；`destinationSkillDirs` 在 `platforms.includes('dsh')` 时 push `<project>/.dsh/skills/myrules`。SKILL.md frontmatter（`name: myrules` / `description: >-`）与 dsh 格式兼容，无需转换。
- `skills.syncSkills` 的 `targetRoots` 数组加 `dshSkillsDir`（`~/.dsh/skills`）；克隆/子目录物化逻辑复用（产出 `<root>/<name>/SKILL.md`，正是 dsh 的目录包形态）。注意 dsh 的 `<name>` 必须 kebab-case：`superpowers`、`grill-me`、`myrules` 都合法。
- `sync.js` 的 `run` 把 `paths.getDshUserSkillsDir(homeDir)` 传入。
- **迁移自愈（必做）**：`isProjectSkillInstalled` 是 `dests.every(...)`，加了 dsh 目标会让所有已布置项目在升级后第一次 sync 直接抛错。在 `syncOne` 的检查前自愈：

```javascript
    if (!projectSkill.isProjectSkillInstalled(projectRoot, manifest)) {
      projectSkill.ensureProjectSkill(projectRoot, cacheDir, manifest); // 幂等 if_changed
    }
    if (!projectSkill.isProjectSkillInstalled(projectRoot, manifest)) { throw ... }
```

- [ ] 测试：destinationSkillDirs 含 dsh；syncSkills 结果含 `~/.dsh/skills/<name>`；自愈后不再抛错。

### Task 6：角色包 → dsh 命名委派工具（一等公民）

**文件：** `tools/sync/lib/deploy-agents.js`、`tools/sync/lib/dsh-roles-deploy.js`（新建）；测试 `tests/deploy-agents.test.js`、`tests/dsh-roles-deploy.test.js`（新建）

**6a. 角色文件落盘（两路径共用）**

- 目标：`<project>/.dsh/agents/myrules-<role>.md`，state key `.dsh/agents/<name>.md`；正文 = `transform.transformForAgent({ ..., platform: 'dsh' })` + `withWorkerFooter`。
- `transformForAgent` 的 `platform: 'dsh'` 产出**角色文件**（不是 SKILL.md）：frontmatter `name` / `description` / `readonly: true|false`（后两者供 patch 生成器与插件读取），正文沿用 `composeAgentBody`。
- 两个 runtime 都部署；`staleAgentCleanup` 覆盖 `.dsh/agents/`（文件级，现有逻辑可复用）。

**6b. P-A：`cordis.patch.yml` 管理块生成（`dsh-roles-deploy.js`）**

接口：

```javascript
buildRoleToolRow(roleId, roleFile)   // 读角色文件 → 一个 dsh-tool-subagent 配置行
  // { name: '@deepseek-ai/dsh-tool-subagent',
  //   config: { provider: 'spawn', toolName: `subagent_${roleId}`,
  //             persona: <YAML块标量：角色正文，{{ 转义>,
  //             toolFilter: readonly ? { deny: [...write/edit/shell 实名] } : undefined,
  //             maxDepth: 1 } }
upsertProfilesPatch({ profilesDir, rows, marker, force })
  // 对 $DSH_HOME/profiles/*/cordis.patch.yml 各写一个带标记的托管块（不触碰用户条目）；
  // 块外内容逐字保留；写后校验：重读 YAML，确认每个 toolName 都能解析（防静默失败）
deployRoleTools(cacheDir, projectRoot, opts)  // 角色文件 → rows → upsert；返回 { wrote, drifted, warnings }
```

- toolName 字符集对照现有 `subagent_fork`（snake 形态最稳）；实现时以 `dsh tool` / tool-catalog 复核。
- deny 清单生成规则：`readonly` 角色禁 `write`、`edit` 与 shell 工具（按平台实名：Windows `pwsh`、其它 `bash`；以该部署实际注册的工具表核对，未知名**不得**写入——`tools.restrict` 对 unknown names fail loud）。
- 角色工具表：把每个角色的 `description` 汇成一小节「角色工具表」并入 Task 4 的 AGENTS.md 管理块，保证模型知道何时召唤哪个角色（stock 工具描述是通用措辞）。
- 验收脚本（随 sync 输出）：逐 profile 解析 patch、断言行数与 toolName 集合 = 角色集合，失败即报错而非静默。

**6c. P-B：自研插件（Phase 2，目标形态）** —— `myrules-dsh-roles` cordis 插件：`defineTool` 每角色一个命名委派工具，`execute` → `ctx.subagents.start('spawn', { persona, toolFilter, maxDepth: 1, prompt: 角色正文 + 任务 })`；`toolFilter` 运行时按实际工具表计算；角色文件按需读取（免重启）。安装走 `dsh plugin add`（npm 或 `file:` 本地包）+ 每 profile 一行组合配置。6b 的 patch 生成器保留为无插件环境的回退。

**6d. Agent Teams 组队规则（project runtime 协作派工）**

- AGENTS.md 管理块新增「组队规则」小节（与角色工具表并列）：**组建 teammate（`spawn_teammate`）前必须先 `read` `.dsh/agents/myrules-<role>.md`，把正文完整放进 `prompt`**；命名沿用角色名（lower-kebab-case，精确匹配、对话内永久占坑）；fresh 队友的任务书由 coordinator 按「干什么 / 材料在哪 / 什么算干完 / 不许碰什么」四要素扩写（用户只需一句话）；派工卡对应 `team_task_create` + `writeScopes`，交回走 `send_message`，进度用 `wait_agent` 不轮询。
- 部署侧无新目标（角色文件 6a 已就位），只出规则块文案 + REFERENCE 说明。
- 限制写明：readonly 角色在 Teams 路线**无工具级强制**（队友工具集固定）——工人纪律兜底，或建议会话级「仅可查看」预设；名册/记忆对话级；experimental 需在插件页启用。

### Task 7：hooks 散文镜像 + gitignore / legacy / export / state

**文件：** `hooks-deploy.js`、`gitignore.js`、`legacy.js`、`export.js`、`state.js`；测试对应各文件

- `hooks-deploy.deployHooks` 在写 `claudeTarget` 旁加 `dshTarget`（`transformHookForClaude` 同款散文，可顺手改名为 `transformHookConvention`）：项目 hook → `.dsh/rules/myrules-hook-<name>.md`，用户 hook → `~/.dsh/rules/myrules-hook-<name>.md`；两者都会在 Task 4 的块装配中进管理块。stale 清理同步删。
- `gitignore.buildBlock` 追加（镜像现有三平台行）：

```javascript
    `.dsh/rules/${prefix}*`,
    `!.dsh/rules/${prefix}method-*`,
    // runtime !== 'project' 时再加（与 .cursor/agents 同分支）：
    `.dsh/skills/${agentPrefix}*/`,
```

  （`myrules-*` 不会误伤 bootstrap skill 目录 `myrules/`，也没有 method skill 落在该前缀下。）
- `legacy.scanLegacy` 加 `.dsh/rules/` 的非 `myrules-` `.md` 扫描（镜像 opencode 块）。
- `export.exportProject` 的 `scans` 加 `{ dir: dshProjDir, ext: manifest.dsh.extension }`、`{ dir: dshUserDir, ... }`（`opts.dshUserDir` 测试覆盖）。
- `state.DEFAULT_STATE` 加 `deployedDshBlocks: { projectHash: null, userHash: null }`。

### Task 8：sync 接线 + e2e + 文档

**文件：** `tools/sync/sync.js`、`tests/cli-sync.test.js`、`tests/e2e.test.js`、文档四件

- `syncOne`：在 `deployMethod.deployMethod` **之后**（块需要 method 短规则落盘后的内容）调用 `dshInstructions.deployProjectInstructions(...)`，结果并入 `state.writeState`（`deployedDshBlocks.projectHash`、`budgetWarning` 打印）。
- `run`：用户块放 `skipUserConfig` 同级新块 `skipUserAgentsBlock`，操作 `~/.dsh/AGENTS.md`，hash 存 `hooksState.readUserHooksState`（与 opencode 用户配置同文件，避免第二个机器级状态文件；与 opencode 计划同一取舍）。
- 测试 opts：`dshUserDir`、`agentsFile`/`userAgentsFile` 覆盖注入，全套 hermetic。
- e2e 断言：`.dsh/rules/myrules-testing.md` 存在；`AGENTS.md` 含 begin/end 块且块内含 `## myrules: testing` 与「角色工具表 / 组队规则」；`.dsh/skills/myrules/SKILL.md` 存在；`.dsh/agents/myrules-implementer.md` 存在且 `readonly: false`、`myrules-reviewer.md` 为 `readonly: true`；`cordis.patch.yml` 管理块含 `toolName: subagent_implementer` / `subagent_reviewer`，且校验脚本通过（逐 profile 解析成功、行数与角色集合一致）；prune 不碰 `AGENTS.md` 用户内容。
- 文档：README 平台清单与「dsh 特殊性」小节；`REFERENCE.md` 内容地图 + 保护语义放宽（`AGENTS.md`：块外只读）；`COMMANDS.md` 无新命令但补 dsh 说明；`SKILL.md` 提及 dsh。

### Task 9：Hooks 真自动触发（官方 `dsh-hooks-claude-code` 桥）

**文件：** `tools/sync/lib/hooks-deploy.js`（扩展）、`tools/sync/lib/dsh-hooks-config.js`（新建）；测试 `tests/dsh-hooks-config.test.js`（新建）

按决策 3 的映射，把 MyRules hook 部署成 dsh 真实触发的命令钩子：

1. **事件映射与转换**：`dsh-hooks-config.js` 读 hook 源（`meta.event`/`handle`），按映射表生成 **Claude Code schema** 的 hooks 配置（`{ "hooks": { "SessionStart": [{ "matcher": ..., "hooks": [{ "type": "command", "command": "..." }] }] } }`——注意与现有 `.cursor/hooks.json` 的 Cursor schema 是**两套格式**，`mergeHooksJson` 不可复用，需 CC 版合并器 + 同样的「只动自己条目」语义）：
   - `sessionStart` → `SessionStart`；`subagentStart` → `SubagentStart`；`sessionEnd` 等桥不支持事件 → 不进配置（走散文）。
   - 命令串引用 `$CLAUDE_PROJECT_DIR`（**每 run 的环境变量**）+ 部署路径 `.dsh/hooks/myrules-<name>.js`，不要用 parse-time 的 `${CLAUDE_PROJECT_DIR}`。
2. **输出适配**：CLI 包装层把 `handle()` 返回值转为 CC 输出契约（`hookSpecificOutput.additionalContext` 注入、`permissionDecision: deny` 拦截等）；`SessionStart` 只认 JSON `additionalContext`，裸 stdout 无效——包装层必须显式构造 JSON。
3. **配置落点**：用户级生成 `~/.dsh/hooks/myrules-hooks.json`（`configPath` 是 process 级、启动读一次，**没有 per-project 发现**——项目 hook 脚本路径经 `$CLAUDE_PROJECT_DIR` 每 run 解析，脚本本体随项目部署）。脚本部署目标：`.dsh/hooks/`（项目）/ `~/.dsh/hooks/`（用户），drift/stale 逻辑沿用现有 hooks-deploy 模式。
4. **挂桥**：每 profile 组合加一行 `@deepseek-ai/dsh-hooks-claude-code`（`configPath: ~/.dsh/hooks/myrules-hooks.json`，`pluginRoot`/`projectDir` 按需），随 Task 6 的 patch 管理块一起维护 + 写后校验。安装走官方 `dsh plugin add`（npm/本地/git/tarball）；改动由 HMR watcher 热加载。
5. **限制写进 REFERENCE**：`SessionStart` 是 detached（上下文可能错过首个请求）；同事件串行；配置读失败仅告警；`Stop` 拦截会强制续跑需自限；`transcript_path` 恒空；`SubagentStart` 仅 in-process 子代理、只注入不拦截。
6. **验收**：用真实 hook 事件而非干净启动——起一个会话，`SessionStart` 注入应出现（或 `grep -l hook $DSH_HOME/sessions/*/*/session.jsonl.zstd`）；`session-log` 场景确认走散文/或 Phase 3 原生插件。

**Phase 3 备选**：桥不支持的事件（如 `sessionEnd`）用原生小插件挂对应扩展点（如 `agent/turn-stopping`），获得完整 hooks 语义。

### Task 10（Phase 3，备选）：规则渠道一等公民化

- 方案 B 的 `instructionFileCandidates` 扩展（摆脱 AGENTS.md 管理块）；
- 自研轻量 dsh 插件：`ctx.systemPrompt.context` 直接注入 `.dsh/rules/*.md`（替代拼接）。
- （角色渠道的一等公民化已在 Task 6c 用命名委派工具解决，无需另立。）

---

## 6. 兼容性、迁移与已知缺口

1. **迁移**：升级后每个已布置项目跑一次 `install-skill.js`（Task 5 的自愈让 `sync` 也能自动补齐）；随后照常「同步规则」。
2. **保护清单**：`AGENTS.md` 从「整文件永不读写」放宽为「MyRules 管理块之外永不读写」——`protect.paths` 语义在 `REFERENCE.md` 明文更新；prune/export 永不触碰块外内容。
3. **指令预算**：`~/.dsh/AGENTS.md` + 项目链共享 64KB，且**更宽的先被丢**。MyRules 块偏大会导致用户全局指令（含 MyRules 用户规则）整块失效；sync 打印预算警告，规则正文宜保持精炼。
4. **生效方式差异**：dsh 指令是 touch 驱动 + resume 对账 —— sync 更新块后，已在跑的会话里 `read` 一次 `AGENTS.md` 或重开会话才看到新规则；skills 是实时监听，免重启。
5. **能力缺口与形态差异（如实声明）**：
   | 能力 | dsh 现状 | 本方案 |
   |---|---|---|
   | 常驻规则 | 只有 AGENTS.md 链 | 管理块（可用，形态不同） |
   | 命名子代理 | 无文件定义 agent，但有命名委派工具实例 | 每角色一个 `dsh-tool-subagent`（`persona` 注入角色正文），P-B 插件为免重启目标形态 |
   | readonly 角色 | `toolFilter` **真实强制**（被禁工具在子代理中消失且拒绝执行） | 比 Cursor/Claude 的 readonly 更硬，是增强不是缺口 |
   | readonly（Teams 队友路线） | 队友工具集固定，**无** toolFilter 入口 | 工人纪律文本兜底 + 建议会话配「仅可查看」预设；要硬约束走 tool-subagent 路线 |
   | 跨对话角色复用 | Teams 名册/记忆只在对话内（`TeamId`=根 `SessionId`，新对话重来） | 角色定义留在 `.dsh/agents/` 文件，新对话按组队规则重新引用 |
   | 工人禁再派 | 无对应概念 | `maxDepth: 1` 强制 |
   | 自动 hooks | **官方桥**（CC hooks.json 子集：SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop/SubagentStart/SubagentStop） | Task 9 真自动触发；桥不支持的事件（如 `sessionEnd`→`SessionEnd`）散文兜底，Phase 3 原生插件补全 |
   | hook 拦截/注入 | 桥支持 deny/ask/注入上下文/强制续跑 | 比「散文惯例」强，与 Cursor 自动 hooks 对齐 |
6. **patch 生效方式**：profile 树由 Loader 合成（bundle 补丁 → `cordis.patch.yml` → `--patch overlays`）；**CLI/手写改动由 HMR watcher 热加载**（boot 子系统明确此路径），仅 `ChangeResult` 标 `restart-required` 的情形需重启对应 profile。注意：`persona` 内联文本中的 `{{` 会触发 Loader 的 `!!js`/模板插值语义，生成器必须转义；`toolFilter` 未注册的工具名会让注册 fail loud，deny 清单按平台实名生成；patch 写后必须校验（社区实测有静默失败模式）。
7. **hooks 桥限制**：`configPath` process 级、启动读一次（无 per-project 发现、无热重载）；`SessionStart` 为 detached（上下文可能错过首个请求）；同事件串行执行；配置读失败仅告警；`Stop` 拦截无连击上限（钩子需自限）；`transcript_path` 恒为空串。
6. **版本风险**：dsh 是 developer preview，官方自述「compatibility-breaking changes」。skills 发现契约来自 `packages/skill/skill-filesystem`（2026-08），指令契约来自 `packages/context/agent-instructions`（2026-08）。落地时锁定 dsh 版本并复跑一次验证清单。

---

## 7. 参考资料

官方（deepseek-ai/deepseek-harness，master）：

- [packages/hooks 能力族（hook-protocol + Claude Code / Codex 桥）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/hooks/README.md)
- [dsh-hooks-claude-code（事件表、输出契约、限制清单 —— Task 9 的权威依据）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/hooks/hooks-claude-code/README.md)
- [dsh tool-subagent（命名委派工具：toolName/persona/toolFilter/maxDepth —— 角色包映射的官方机制）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/tool-subagent/README.md)
- [dsh agent-instructions（AGENTS.md/CLAUDE.md 加载、预算、限制）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/context/agent-instructions/README.md)
- [dsh skills 子系统（发现优先级、SKILL.md 契约）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md)
- [dsh tools 子系统（`ToolRestriction` 的 allow/deny 语义、工具注册）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md)
- [dsh subagent 子系统（provider 注册表、persona/toolFilter 能力位）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md)
- [dsh boot 子系统（profile 管理、installBundle、HMR/config-reload、configEditor）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/boot.md)
- [dsh agent-preset（命名组合、creator 技能）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/agent-preset/README.md)
- [dsh agent-team 子系统（具名队友、持久邮箱、任务 DAG、TeamId=SessionId —— P-C 的权威依据）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md)
- [Cordis Primer（Loader 配置、waterfall 语义）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)
- [dsh config-catalog（`dsh-agent-instructions` / `dsh-hooks-claude-code` 等配置面）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/config-catalog.md)
- [dsh commands 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/commands.md)

社区实测（补充，不作权威依据）：

- [Engram INSTALL-DSH（skills 根实操、hooks 桥实战与坑）](https://raw.githubusercontent.com/nagisanzenin/engram/master/INSTALL-DSH.md)
- [brooks-lint dsh-setup（技能根优先级表实测）](https://github.com/hyhmrright/brooks-lint/blob/main/docs/dsh-setup.md)

仓库内先例：[OpenCode 接入计划](2026-07-25-myrules-opencode.md)（平台分支模板）、`tools/sync/lib/gitignore.js`（管理块机制模板）

---

## 8. 实施注记（Phase 1 落地记录）

Task 1–8 已实现并通过全量测试（`node --test`：256 pass / 0 fail，其中 dsh 相关新增 48 例；cursor/claude/opencode 字节级快照零变化）。与原方案的两处偏差，均为「不破坏既有 harness 配置」的强化：

1. **项目侧管理块落在 `AGENTS.local.md`，不是 `AGENTS.md`**：e2e 里 `AGENTS.md`/`CLAUDE.md` 有「永不触碰」的保护断言（保护清单红线），且这两个文件被 Cursor/Claude/OpenCode 共享。`AGENTS.local.md` 是 dsh 的项目本地覆盖层（同目录候选，随指令链加载），由 MyRules 全权管理（用户已有内容时仅动管理块），保护清单语义无需放宽。用户级仍为 `~/.dsh/AGENTS.md`（dsh 唯一用户入口，无覆盖层）。
2. **`dsh-roles-deploy.js` 只生成 `.dsh/roles-tool-rows.yml` 脚手架，不自动改写 `cordis.patch.yml`**：引用未安装的 `@deepseek-ai/dsh-tool-subagent` 包会导致 profile Loader 失败——自动写入违反「不破坏」约束。装配是显式人工步骤（脚手架带 HOWTO 与 toolFilter 校验提示）；stock `subagent` / `spawn_teammate` + 组队规则开箱即用，不依赖装配。
3. Task 9（`dsh-hooks-claude-code` 桥真自动触发）为后续任务，本轮只落散文镜像（`.dsh/rules/myrules-hook-*.md` 进块）。
4. 兼容性：缓存 manifest 落后于代码（如从 GitHub 克隆的旧 manifest 无 `dsh` 块）时，所有 dsh 步骤优雅跳过；skill 安装检查对老项目（无 `.dsh/skills/myrules`）自动放行并尽力补齐。
