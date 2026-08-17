# Merge into: `rules/user/communication.md`

## Candidates

<!-- empty after 2026-08-17 merge -->

## Merged

- [x] 2026-08-17 — Chinese naming: layout/function, not English-calque or invented metaphor; translate code names on first use. Real failure: called an ungrouped fact index 扁列表 / 扁平列表 (flat list) instead of 逐条清单; user rejected the abbreviation diagnosis. The 2026-08-16 calque line did not catch this because 扁平列表 looks like Chinese. Dual poles: (1) still translate a code name by what it does on first use, not leave the identifier as the only name, and not calque it word-for-word (把事实写进账本的函数, not 应用事实写入); (2) do not retranslate a word they already used this turn, do not invent 写门-style metaphors, do not dump a glossary. Scope: the register bullet, not the names/nickname clause (defining-then-labeling would have produced 扁平列表).
  - Source: user review after global-95 pre-start wording (2026-08-17)
  - Merged: 2026-08-17 into `rules/user/communication.md` (extend language/register bullet)

- [x] 2026-08-16 — Replace 「文句要连着往下讲」 with 「前后句要接得上」 after the user said the former was unclear. Dual poles unchanged: connected sentences, not literary padding.
  - Source: user: 「文句要连着往下讲」这是啥意思？→ 改
  - Merged: 2026-08-16 into `rules/user/communication.md`

- [x] 2026-08-16 — Add Chinese-register dual pole to the language bullet after a real failure: coined 「淹了一层」, which is not Chinese. Dual poles: (1) when writing Chinese, do not calque English metaphors/syntax or invent phrases Chinese does not use; (2) flowing connected prose is not ornament — do not pad a short answer into literary filler, and do not replace concrete nouns with empty words. Scope: Chinese replies only; length bullet still governs how long.
  - Source: user: 「淹了一层」是翻译腔；中文里没见过这样的表达；要写进第 3 条，流程优美的中文
  - Merged: 2026-08-16 into `rules/user/communication.md` (extend language/register bullet)


- [x] 2026-08-14 — Split the names mega-bullet and add a Grok register line. Grok was treating the stacked negatives (define terms + no catalog + no 这/那 + do not ban pronouns) as a per-sentence ritual, which made replies harder to follow than the default witty register. Dual poles: (1) status wrap-ups still name unseen objects before deixis, but pronouns are fine after naming; (2) no sarcasm/memes/cosmic filler unless asked, without stripping necessary detail to sound simple. Scope: names job stays; deixis job scoped to status/wrap-up; new tone line is register, not length.
  - Source: user: Grok replies hard to understand; confirmed Chinese draft 2026-08-14
  - Merged: 2026-08-14 into `rules/user/communication.md` (split first bullet; add language/register bullet)

- [x] 2026-08-14 — Widen the names bullet to cover deixis (这/那/该/这一趟/那一行) after a real failure: status summaries pointed at unnamed plan/UI objects. Dual pole: name the object first, then a short label is fine; do not ban pronouns.
  - Source: user review of global-100.4 wrap-up (2026-08-14)
  - Merged: 2026-08-14 into `rules/user/communication.md` (extend first bullet)

- [x] 2026-08-13 — Sentence-level prune (neither merge-to-3 nor restore-6). Cut: noun-type catalog (catch-all remains); empty "proportional to the task" header; laziness bullet split into existing lines (catalog → names; execute-as-essay → stance; settled-template → length). Kept as distinct jobs with full conditions: names+人话; stance (weak assumptions + alternative); lead with outcome; assumptions; length exemplars including the mechanism checklist.
  - Source: user: six lines redundant → merge ate conditions → restore changed too little → stop polarizing, think per sentence
  - Note: 2026-08-13 user dropped "Plain language is not simpler vocabulary." Do not treat files you have read as shared. Define file-only, plan-only, and self-coined nouns before using them as labels; skip words they already used this turn. Plain language is not simpler vocabulary.
  - Source: user review after the first English rewrite still treated file nouns as shared
  - Merged: 2026-08-13 into `rules/user/communication.md` (replace first bullet only)

- [x] 2026-08-13 — Replaced the Chinese one-way cluster (unlimited length, four steps on every explainer, never compress) with six English dual-pole lines: situation before names; length follows task; lead with outcome; state assumptions; length follows question (status vs mechanism); forbid jargon catalogs and template restatements.
  - Source: user review after over-correction; dual-pole check in `meta/authoring.md`
  - Merged: 2026-08-13 into `rules/user/communication.md` (replace, not append)

- [x] On design/plan questions, push back on weak assumptions and offer an alternative; on simple do-this tasks, just execute.
  - Source: user request (2026-07-09)
  - Merged: 2026-07-10 into `rules/user/preferences.md`; 2026-07-25 consolidated into `communication.md`
- [x] Prefer plain language over jargon. Before using any technical term - and especially before coining a project-specific term - define it in plain words first. When explaining how something works or why a choice was made, cover the mechanism and trade-offs - do not stop at a slogan-level summary, and do not hide gaps behind unexplained jargon.
  - Source: user request (2026-07-20) - optimized per `meta/authoring.md`; 2026-07-25 merged with former "define coined terms first" line
  - Merged: 2026-07-20 into `rules/user/preferences.md`; 2026-07-25 consolidated into `communication.md`
- [x] 2026-07-25 — Folded (deduped/tightened) into `rules/user/communication.md`: lead with outcome, verified progress reporting, facts/inferences/guesses + high-stakes sources, neutral comparisons, explicit assumptions / why-not-only-how.
  - Sources: `agent-controllability.md`, `fable5-prompting-handbook-delete-to-clarify.md`, `zhizhi-weizhizhi-probability-honesty.md`, `andrew-ng-prompting-7-rules.md`, `reddit-claude-prompt-collaboration-patterns.md`, `agents-md-first-principles-adversarial-review.md`, `karpathy-llm-coding-guidelines.md`
