# 运行时：Cursor Project（coordinator）

长期拆活、探路、并行、云端：人对着 coordinator。coordinator 自己禁止写业务代码。

琐碎改动：本地普通 Agent 或编辑器直接改，不经过派工。coordinator 不是本仓库里每一个主会话。

## 闸门

闸门只认 `ledger/STATUS.md`。布置时默认探路。探路：禁止派 implementer，禁止开实现 PR，可派 researcher（只读）。可施工：可以派 implementer。人把 STATUS 改成可施工之前不要自行施工。不要因为已有已出版口号就当成可施工。

## 账记在哪

- 目标草稿在 `ledger/PURPOSE.draft.md` 与 `ledger/GOALS.draft.md`。条目标 `draft | 已点头待出版 | 已出版 → docs/…`。
- **现行规格只有已出版的 git 文首和总表**。draft 不是规格。工人读 git 文首，不读 draft 当目标。
- `.myrules-context.md` = **已出版**的目的句。正在聊的那句只在 `PURPOSE.draft.md`。出版目的后同一轮更新 `.myrules-context.md`。
- 进行中的活主现场 = `ledger/board/`。git `docs/看板/` 是归档：`done` / 收尾才必须出版。`npm run board` 只可查阅或把 done 卡归档，不是登记入口。
- 怎么测、调研、坑 = `ledger/ops/`。不要写进文首。
- 「先登记」在本运行时不得要求跑 `npm run board`。登记在 `ledger/board/` 写卡。
- 若仓库有未加前缀的 `docs/方法/项目工作法.md`，路径、总表、登记命令以那份为准。

## 改目的

人说「其实我想要的是另一件事」：

- **coordinator 座位：** 只改 draft → 等人点头 → **同一轮**派 publisher 改 git 文首和总表 → 再决定进行中派工是否改范围。
- **本地主会话：** 点头后自己写文首、同一轮抄总表、必要时改 `.myrules-context.md`。不要发明句子。

没点头，已派出的 implementer 停工或只读。

## 没说登记

琐碎改动由本地主会话直接改。非琐碎且人在 coordinator 座位：coordinator 可派 implementer 直接改代码，但自己不写；也不要抢先开父项。仍受 STATUS 约束：探路时禁止派 implementer。
