# 运行时：普通 Agent

人对着普通 Cursor Agent（主会话）。主会话可以写业务代码。

## 账记在哪

- 现行目标 = git 文首（`docs/能力/**`）和 `docs/设计目标检查清单.md`。
- 进行中的活 = git 看板卡 `docs/看板/items/item-N.md`。
- `.myrules-context.md` = 当前目的句。
- 怎么测写在当前卡上。

## 登记

登记 → `npm run board`（托管脚本 `scripts/myrules-board.mjs`）。页眉只经这条命令改。

常用命令：

- 摘要与当前项：`npm run board -- summary` / `npm run board -- next`
- 登记工作：`npm run board -- add --title "标题" [--body "说明"] [--focus]`
- 登记带落点：`npm run board -- add --title "改某目标" --placement 改承诺 --goal docs/能力/某功能/某功能设计目标.md --focus`
- 改状态或摘 focus：`npm run board -- patch --id item-N --status done --set focus=false`
- 启动本地看板：`npm run board:server`

人说登记、开一项、审计、改目的、标完成、写设计目标文首时，读 skill `project-method`。

没说登记，主会话直接改代码。不要先问要不要开卡。
