# Article: 软件分层思想 — 从脸脑记手到通用架构惯例

- **Source**: `learn-maintain-wiki` 架构共读（arc 6–7，2026-07-06/07）+ 常见软件工程分层惯例
- **Date**: 2026-07-08
- **Status**: abstracted
- **Target files**: `coding-standards` (primary), `ai-behavior` (architecture proposals), `planning` (new-project skeleton)

## Audience split（元规则：先分清写给谁）

| 内容 | 归属 | 理由 |
|------|------|------|
| SoC、MVC、分层架构、前后端分离等名词与对照表 | **本文** | 教**人**建立地图；删掉不会让 agent 自动更守层 |
| 脸→脑→手、调用链样板（点文件/搜索/保存 A·B） | **本文 + learn-maintain-wiki** | 项目样板；路径与模块名是 trading-review-wiki 专属 |
| 「脑不调脸」作为**默认** + 何时可破例 | **本文** | 判断框架；需结合项目技术栈 |
| 新项目开场 prompt（先要目录树+依赖方向+一条调用链） | **本文 + planning 候选** | 指挥 agent 设计架构时的流程约束 |
| `lib/` 不 import `components/` | **可部署** (`coding-standards`) | 具体禁令；删掉 agent 更易把逻辑塞进 UI 或反过来 |
| 读写盘/系统能力走固定桥接层 | **可部署** (`coding-standards`) | 具体禁令；删掉易出现散落 `readFile` / 硬编码路径 |
| store 只存状态，复杂逻辑放 lib | **可部署** (`coding-standards`) | 具体禁令；删掉易出现「胖 store」 |
| 下任务时标明动哪一层（UI / state / logic / IO） | **可部署** (`ai-behavior`) | 可观察；删掉范围声明更易模糊 |
| 提案新架构时先交调用链再写代码 | **可部署** (`planning`) | 与 agent-controllability「验证门」同族；可合并去重 |

## Core ideas（中文笔记）

### 一句话总括

这些名字不同，核心都是：**把「会变的东西」和「不该乱变的东西」分开，并规定谁可以叫谁。**

### 与脸脑记手的对应

| 常见说法 | 脸脑记手 / trading-review-wiki | 干什么 |
|----------|-------------------------------|--------|
| **关注点分离** (SoC) | 脸 / 脑 / 记 / 手 整包 | 界面、逻辑、状态、系统 IO 各管各的 |
| **MVC** | View≈脸，Model≈记+盘，Controller≈脑 | 老三板斧，名字不同 |
| **分层架构** | 脸→脑→commands→Tauri；脑内上→中→下层 | 上层只能调下层，别倒挂 |
| **前后端分离** | 桌面端：React≈前，Tauri/Rust≈后 | 网页则是浏览器 vs 服务器 API |
| **API / 边界** | `commands/fs` 等桥接层 | 只通过约定的门通信 |
| **单一职责** | 一个模块干一类事 | 反例：巨型 `utils.ts`、组件里百行逻辑 |
| **依赖方向** | 脑不调脸；底层不调上层 ingest | 稳定的少依赖易变的 |
| **展示 vs 持久化** | A 链直写 `.md` vs B 链 persist→JSON→`.llm-wiki/` | 要不要整理格式再过脑 |
| **队列 / 异步** | `ingest-queue`、活动面板 | 慢活别堵 UI |
| **人机闸门** | ingest→待审阅（可选） | 全自动里留人眼节点 |

### 「脑不调脸」是否通用？

- **不是宇宙定律**，但是前端 / 桌面 App 里**非常值得当默认**的规则。
- **适用**：React/Vue 桌面或网页、Tauri/Electron、要长期维护、agent 协作。
- **不必教条**：小 demo、纯后端/CLI（没有「脸」）、同一文件内小组件私有逻辑（不 export 给全局 lib）。
- **更准确**：**逻辑层默认不依赖 UI 层**；只有能说出理由时才破例。

### 指挥 agent 时的实用句

| 别说 | 改说 |
|------|------|
| 改一下保存 | 改**脑**里保存逻辑；写盘走**手桥** |
| 加个设置页 | **脸**加页；配置进**记**；逻辑放**脑** |
| ingest 不对 | 是**上层流程**（ingest）还是 **LLM 调用**（llm-client）？ |

### 新项目先要地图，不要先要代码

让 agent **只输出**（确认后再实现）：

1. 文件夹结构 + 每目录一句职责  
2. 允许谁调谁（例：脸→脑→手；脑×脸）  
3. 一个最简用户操作的调用链  

硬性格式可写入 planning / ai-behavior 候选（见 merge-queue）。

## Executable principles（给人用）

1. 架构讨论用「层」说话，比「改那个功能」更不易范围失控。  
2. 用一个操作验收架构（点保存、点搜索…），链对不上就重画。  
3. agent 方案出现「lib import 组件」「store 里写 ingest」「到处 readFile」要警惕。  
4. 常规方向可默认，具体文件名必须以目标项目为准。

## Candidate rule lines (English)

See `merge-queue/into-coding-standards.md` and `merge-queue/into-ai-behavior.md` (layer-scoping bullets).

## Merge notes

- Overlaps: `articles/agent-controllability.md`（验证门、先定义完成标准）、`articles/0005-risk-tiering.md`（注意力分配）、`rules/project/planning.md`（范围与计划）。
- `rules/project/coding-standards.md` currently has only two lines — layering candidates are a natural fit for `agents: [implementer]` (and possibly `planner` for skeleton requests).
- Do **not** deploy trading-review-wiki-specific paths (`ingest.ts`, `wiki-store`) into global MyRules; keep in article or per-project `.myrules-context.md`.
- Chinese narrative stays here; formal merged rules stay **English** per staging README.
