# Article: Chinese names by layout, not English calque

- **Source**: user review after global-95 pre-start wording (trading-review-wiki-1, 2026-08-17)
- **Date**: 2026-08-17
- **Status**: merged
- **Target files**: communication

## Core ideas (your words)

- 扁列表 / 扁平列表 不是「简称 vs 全称」。扁平列表只是把 flat list 换成汉字。
- 中文要说的是怎么排：逐条清单 vs 按对象汇总。
- 代码名第一次要说成它干什么，不是只丢标识符，也不是逐词换汉字。
- 这轮已经用过的词不要再译。

## Executable principles

- Name by how it is laid out or what it does in Chinese.
- Do not swap in the English technical metaphor.
- Do not invent a private Chinese metaphor.
- Translate a code name on first use by what it does, then attach the name.
- Skip words they already used this turn.

## Candidate rule lines (English, for merge-queue)

- When writing Chinese, name things by how they are laid out or what they do, not by swapping in the English technical metaphor (逐条清单, not 扁平列表) and not by inventing a private Chinese metaphor (写入入口, not 写门). On first use of a code name, say in ordinary Chinese what it does, then attach that name; do not retranslate a word they already used this turn.

## Merge notes

- Overlaps with superpowers / existing rules: names bullet already says define file-only nouns and skip words they used this turn. Do not change that nickname clause; this job is register. Extends the 2026-08-16 Chinese-register line (淹了一层 / 不要直译英文); that line did not catch 扁平列表 because it looks like Chinese.
- Conflicts or open questions: none after user locked 代码名要翻译 / 已用过的词不译.
