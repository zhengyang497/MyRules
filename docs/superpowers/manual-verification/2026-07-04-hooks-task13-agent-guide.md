# MyRules Hooks — Task 13 手动验证指南（给临时项目 Agent）

> **读者**：在**临时/空白项目**里工作的 Cursor Agent。  
> **目的**：确认 MyRules 部署的 Cursor hooks **真的会被 Cursor 调用**，而不只是文件生成正确。  
> **自动化测试做不到的事**：`node --test` 只验证 sync 写出的文件和 JSON；**只有 Cursor 运行时**才能证明 hook 在 `sessionStart` / `sessionEnd` 时刻生效。

---

## 0. 开始前：确认你的角色与边界

| 你能做 | 你不能代替用户做 |
|--------|------------------|
| 创建临时目录、跑 `install-skill` / `sync` | 在 Cursor 里「新建 Agent 会话」触发 `sessionStart` |
| 检查磁盘上的文件、`hooks.json` 内容 | 在 UI 里打开 **Customize → Hooks** 或 Hooks 输出通道 |
| 用命令行**单独运行** hook 脚本做冒烟测试 | 结束 Cursor 会话以触发 `sessionEnd` |
| 读取 `~/myrules-activity-log.md`（若 shell 有权限） | 若 hook 报错，**以 Hooks 输出通道的原文为准**（不要猜原因） |

**失败原则**：任一步不符合「通过标准」，停止后续步骤，收集文末「失败报告模板」中的信息，交给用户或 MyRules 维护者。

---

## 1. 变量（先把路径填对）

在执行任何命令前，确定下面三个路径（Windows 用反斜杠或引号包裹均可）：

| 变量 | 含义 | 示例 |
|------|------|------|
| `MYRULES_REPO` | 本机 MyRules 仓库根目录（含 `tools/sync/`） | `D:\llm wiki\MyRules` |
| `SCRATCH_PROJECT` | **临时验证项目**根目录（不要选 MyRules 仓库本身） | `D:\temp\myrules-hooks-verify` |
| `USER_HOME` | 当前用户主目录 | Windows: `%USERPROFILE%`；macOS/Linux: `$HOME` |

**硬性要求**：`SCRATCH_PROJECT` 必须是一个**独立**目录（空目录或新建均可），**不能**是 `MYRULES_REPO`。

---

## 2. 阶段 A — Agent 全自动（部署 + 文件检查 + 脚本冒烟）

### A1. 准备临时项目并部署

在 shell 中执行（把路径换成你的实际值）：

```bash
# 若目录不存在则创建
mkdir -p "<SCRATCH_PROJECT>"

node "<MYRULES_REPO>/tools/sync/install-skill.js" --project "<SCRATCH_PROJECT>"
node "<MYRULES_REPO>/tools/sync/sync.js" --project "<SCRATCH_PROJECT>"
```

**通过标准（A1）** — 以下路径必须存在：

| 范围 | 必须存在的文件 |
|------|----------------|
| 项目级 | `<SCRATCH_PROJECT>/.cursor/hooks.json` |
| 项目级 | `<SCRATCH_PROJECT>/.cursor/hooks/myrules-session-start-context.js` |
| 用户级 | `<USER_HOME>/.cursor/hooks.json` |
| 用户级 | `<USER_HOME>/.cursor/hooks/myrules-session-log.js` |

**检查项目级 `hooks.json`**（内容应类似，不必逐字节一致）：

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "node .cursor/hooks/myrules-session-start-context.js" }
    ]
  }
}
```

**检查用户级 `hooks.json`** 应包含 `sessionEnd` 且 command 指向 `myrules-session-log.js`（路径通常是 `node hooks/myrules-session-log.js`，相对 `~/.cursor/`）。

---

### A2. 创建 sessionStart 测试用的上下文文件

在临时项目根写入：

**文件**：`<SCRATCH_PROJECT>/.myrules-context.md`

**内容**（可原样使用）：

```markdown
# MyRules Hooks 验证

这是 Task 13 手动验证用的占位内容。
若 sessionStart hook 生效，Agent 应能在会话开始时看到这段文字。
```

此文件**不会**被 gitignore；它是给 hook 读的「状态/上下文」源文件。

---

### A3. Hook 脚本 CLI 冒烟（不经过 Cursor，但可快速排除脚本本身坏了）

在 `<SCRATCH_PROJECT>` 下执行：

**session-start-context**（应输出含 `additional_context` 的 JSON）：

```bash
cd "<SCRATCH_PROJECT>"
echo {} | node .cursor/hooks/myrules-session-start-context.js
```

**通过标准（A3-start）**：
- 退出码为 `0`
- stdout 是合法 JSON，且包含 `"additional_context"` 字段，其值含 `MyRules Hooks 验证`

**session-log**（应往主目录日志追加一行）：

```bash
echo {"workspace_roots":["<SCRATCH_PROJECT>"],"duration_ms":999,"reason":"task13-smoke"} | node "<USER_HOME>/.cursor/hooks/myrules-session-log.js"
```

**通过标准（A3-end）**：
- 退出码为 `0`
- stdout 为 `{}`（或空对象 JSON）
- `<USER_HOME>/myrules-activity-log.md` 末尾新增一行，含 `task13-smoke` 和 `999ms`

> 若 A3 失败，**先修脚本/Node 环境问题**，不要进入阶段 B。Cursor 只会调用同样的脚本。

---

### A4. 阶段 A 小结（Agent 输出给用户）

向用户汇报：

```
[Task 13 / 阶段 A] 完成
- sync 部署：通过 / 未通过
- 文件存在性：通过 / 未通过
- CLI 冒烟 sessionStart：通过 / 未通过
- CLI 冒烟 sessionLog：通过 / 未通过
- 临时项目路径：<SCRATCH_PROJECT>
```

若阶段 A 全部通过，请用户配合阶段 B。

---

## 3. 阶段 B — 需要用户在 Cursor 中操作（Agent 引导 + 事后检查）

以下步骤**必须由用户在 Cursor IDE 中完成**。Agent 的职责是：**逐步说明做什么、然后检查磁盘/日志结果**。

### B1. 验证 sessionStart（上下文注入）

**请用户执行：**

1. 用 Cursor **打开文件夹** `<SCRATCH_PROJECT>`（必须是阶段 A 里 sync 过的那个目录）。
2. **新建一个 Agent 会话**（新 Composer / Agent 聊天，不要复用旧会话）。
3. 打开 **Customize → Hooks**，或底部面板的 **Hooks 输出通道**。
4. 确认 `session-start-context`（或 `myrules-session-start-context.js`）**无报错**。
5. 在新会话里问 Agent：「请复述 `.myrules-context.md` 里的标题和第一句意思。」

**通过标准（B1）**：
- Hooks 输出通道里该 hook **没有 error**
- Agent 的回答能体现 `.myrules-context.md` 中的内容（例如提到「MyRules Hooks 验证」）

**未通过时**：让用户复制 Hooks 输出通道里该 hook 的**完整错误原文**（不要 paraphrase）。

---

### B2. 验证 sessionEnd（活动日志）

**请用户执行：**

1. **结束**刚才用于 B1 的 Agent 会话（关闭 Composer / 结束 session，具体 UI 以当前 Cursor 版本为准）。
2. 等待数秒，让 `sessionEnd` hook 跑完。

**Agent 检查**（shell 可读主目录时自行执行；否则请用户打开文件）：

```bash
# Windows PowerShell 示例：看日志最后 5 行
Get-Content "<USER_HOME>/myrules-activity-log.md" -Tail 5
```

**通过标准（B2）**：
- 最新一行（或接近最新）包含：
  - ISO 时间戳（形如 `2026-07-04T...`）
  - 临时项目**文件夹名**（`SCRATCH_PROJECT` 的 basename，不是完整路径）
  - `...ms | ...` 格式的时长
  - 一个 `reason` 状态（具体值依 Cursor 版本而定，不为空即可）

示例行格式（与 hook 实现一致）：

```
- 2026-07-04T02:30:00.000Z | myrules-hooks-verify | 12345ms | completed
```

---

### B3. 再次确认 Hooks 输出通道无残留错误

**请用户执行：** 再次打开 Hooks 输出通道，浏览与本次会话相关的条目。

**通过标准（B3）**：
- 没有针对 `myrules-session-start-context.js` 或 `myrules-session-log.js` 的 **error** 条目

---

## 4. 最终结论模板（Agent 填好后交给用户）

```markdown
## Task 13 手动验证报告

- 日期：
- MYRULES_REPO：
- SCRATCH_PROJECT：
- 阶段 A（Agent 自动）：通过 / 失败（哪一步：A1/A3-start/A3-end）
- 阶段 B1 sessionStart：通过 / 失败 / 用户未执行
- 阶段 B2 sessionEnd：通过 / 失败 / 用户未执行
- 阶段 B3 无报错：通过 / 失败

### 失败详情（如有）
- Hooks 输出通道原文：（粘贴）
- 相关文件片段：（hooks.json / 日志末尾）
- 已尝试的排查：

### 总体结论
- [ ] Task 13 通过，hooks 在 Cursor 中可用
- [ ] Task 13 未通过，需回到 MyRules 修复
```

---

## 5. 常见问题（Agent 快速查）

| 现象 | 可能原因 | Agent 动作 |
|------|----------|------------|
| sync 后没有 `.cursor/hooks/` | cache 里还没有 hook 源、或 sync 报错 | 读 sync 终端 stderr；确认 `~/.myrules/hooks/` 或 cache 中有 seed hooks |
| A3-start 输出 `{}` | `.myrules-context.md` 不在项目根，或 `CURSOR_PROJECT_DIR` / cwd 不对 | 确认文件路径；在 `<SCRATCH_PROJECT>` 下跑命令 |
| B1 hook 有 error | Node 不在 PATH、脚本路径错、JSON 解析失败 | 把 Hooks 通道**原文**贴进失败报告；对比 A3 是否通过 |
| B2 日志无新行 | session 未真正结束、或用户级 hooks.json 未生效 | 确认 B1 时 Cursor 读的是 `~/.cursor/hooks.json`；让用户再结束一次会话 |
| 项目 hook 有了但用户 hook 没有 | 只 sync 了项目、用户级 deploy 失败 | 确认 `<USER_HOME>/.cursor/hooks.json` 存在；重跑 sync |

---

## 6. 参考：两个 seed hook 在验什么

| Hook | 事件 | 作用 |
|------|------|------|
| `session-start-context` | `sessionStart` | 若项目根有 `.myrules-context.md`，把内容注入 Agent 的 `additional_context` |
| `session-log` | `sessionEnd` | 往 `~/myrules-activity-log.md` 追加一行（时间 \| 项目名 \| 时长 \| 原因） |

源文件在 MyRules 仓库：`hooks/project/session-start-context.js`、`hooks/user/session-log.js`。  
设计说明见：`docs/superpowers/specs/2026-07-03-myrules-hooks-design.md`。

---

## 7. 给用户的复制粘贴指令（可选）

若用户只想一句话让 Agent 开始，可在**临时项目**里发送：

> 请阅读 MyRules 仓库中的 `docs/superpowers/manual-verification/2026-07-04-hooks-task13-agent-guide.md`，按阶段 A 全自动执行；阶段 B 逐步指导我操作 Cursor，最后填写验证报告。MyRules 仓库路径是：`<MYRULES_REPO>`，当前临时项目就是本工作区。
