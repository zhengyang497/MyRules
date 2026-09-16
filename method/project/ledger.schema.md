# Ledger schema

coordinator **只维护这些路径**。不要在这之外再写第二份目标册。产品 Goal（`/goal`、CreateGoal）和 Cursor 共享上下文不是账；最多写成指向 git 文首的指针。

```text
ledger/STATUS.md            闸门：探路 | 可施工；当前在派谁
ledger/PURPOSE.draft.md     正在聊的目的句
ledger/GOALS.draft.md       正在聊的目标表
ledger/board/               进行中的卡
ledger/ops/                 怎么起、怎么测、调研
```

`.myrules-context.md` = **已出版**的目的句；正在聊的那句只在 `PURPOSE.draft.md`。

## ledger/board 卡最低约定

- 文件名即编号（如 `1.md`、`1.2.md`）。
- 正文开头可写：父项（可选）、是否 focus。
- 没有看板脚本；登记就是在这个目录写卡。git `docs/看板/` 只收 done / 收尾。
