# Article: 递归删除解析成盘符根

- **Source**: 2026-09-15 Cursor 会话，清理仓库内 Mode M dump 联接目录时误删 D 盘
- **Date**: 2026-09-15
- **Status**: merged
- **Target files**: behavior

## Core ideas (your words)

- 事故命令：`cmd /c "rmdir /s /q \"d:\llm wiki\...\mode-m-dump-root\""`。嵌套引号加路径末尾 `\`，Windows 把目标解析成 `D:\`。`rmdir /s /q` 不进回收站。
- 仓库里的目录联接指向 `D:\llm-wiki-mode-m`。即使路径写对，把区外数据联进工作区再递归删，也容易伤到仓库外的唯一底库。
- 已有「未确认不得批量删除仅此一份用户数据」没拦住：模型把这件事当成打扫临时文件，跳过确认。再写一句「小心删除」不会更有效。
- 对面那头：禁止一切删除、每次删文件都问人、禁止路径里出现 `\"`、只准删白名单目录名。问多了规则会被跳过；白名单会挡住 `node_modules`、测试残留、agent 自己生成的临时目录。

## Executable principles

- 按「递归删除」这个动作约束，不按某一条命令、也不按引号写法。
- 先打印解析后的绝对路径，再决定删不删。盘符根、用户主目录、工作区外、目标是联接：停下问人。工作区内且三条都过：不必问。
- 工作区在 D 盘 ≠ 可以动 D 盘。
- 联接只删指针；不要把工作区外的目录联进工作区。
- 工作区外的递归删除，必须对方本轮点名了那条路径。

## Candidate rule lines (English, for merge-queue)

- Recursive delete: resolve and print FullName first; only proceed without asking if not a drive root/home, inside workspace, and not a ReparsePoint.
- Do not wrap recursive delete in `cmd /c` with escaped quotes; use `-LiteralPath`; check variables non-empty.
- Delete junction/symlink pointers only; do not link extra-workspace dirs into the workspace.
- Extra-workspace recursive delete only if the user named that path this turn.

## Merge notes

- Overlaps: `behavior.md` 已有「未经明确确认，不得批量删除或覆盖仅此一份的用户数据」——保留，覆盖覆盖写和批量改记录；本条只管递归删除的路径核对。
- Conflicts: 与「工作区内不必问」并存。仅此一份的覆盖写仍要确认；递归删除以解析后的路径为准，不以「临时」自我分类为准。
- 规则拦不住命令本身。更硬的一层是 Shell hook（未在本轮部署）。
