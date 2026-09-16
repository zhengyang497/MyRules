import { existsSync, readFileSync } from "fs"
import { join } from "path"

export const GOAL_STATUS_ORDER = ["口号", "做了一截", "已做成"]

const GOAL_LEDGER_FILES = [
  ["docs", "设计目标检查清单.md"],
  ["docs", "capabilities", "设计目标清单.md"],
]

export function escapeGoalHtml(s) {
  if (s == null) return ""
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function splitRow(line) {
  const trimmed = String(line).trim()
  if (!trimmed.startsWith("|")) return null
  return trimmed
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim())
}

function parseSource(cell) {
  const m = String(cell || "").match(/^\[([^\]]*)\]\(([^)]+)\)$/)
  if (m) return { sourceLabel: m[1], sourceHref: m[2] }
  return { sourceLabel: cell || "", sourceHref: "" }
}

function colIndex(headers, names) {
  for (const name of names) {
    const i = headers.indexOf(name)
    if (i >= 0) return i
  }
  return -1
}

export function parseGoalLedger(markdown) {
  const lines = String(markdown || "").split(/\r?\n/)
  let headers = null
  const rows = []
  for (const line of lines) {
    const cells = splitRow(line)
    if (!cells) {
      if (headers) break
      continue
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue
    if (!headers) {
      if (!cells.includes("ID") || !cells.includes("状态")) continue
      headers = cells
      continue
    }
    const id = cells[colIndex(headers, ["ID"])] || ""
    if (!id) continue
    const statusIdx = colIndex(headers, ["状态"])
    const capIdx = colIndex(headers, ["功能", "能力"])
    const goalIdx = colIndex(headers, ["目标"])
    const lookIdx = colIndex(headers, ["对比时看什么"])
    const verifyIdx = colIndex(headers, ["验证方式", "是否被测试覆盖"])
    const projectIdx = colIndex(headers, ["项目"])
    const sourceIdx = colIndex(headers, ["出处"])
    const source = parseSource(sourceIdx >= 0 ? cells[sourceIdx] : "")
    rows.push({
      id,
      capability: capIdx >= 0 ? cells[capIdx] || "" : "",
      goal: goalIdx >= 0 ? cells[goalIdx] || "" : "",
      status: statusIdx >= 0 ? cells[statusIdx] || "" : "",
      look: lookIdx >= 0 ? cells[lookIdx] || "" : "",
      verify: verifyIdx >= 0 ? cells[verifyIdx] || "" : "",
      project: projectIdx >= 0 ? cells[projectIdx] || "" : "",
      ...source,
    })
  }
  return rows
}

export function groupGoals(rows) {
  const groups = new Map()
  for (const status of GOAL_STATUS_ORDER) groups.set(status, [])
  const extra = []
  for (const row of rows) {
    if (groups.has(row.status)) groups.get(row.status).push(row)
    else extra.push(row)
  }
  const out = GOAL_STATUS_ORDER.map((status) => ({ status, rows: groups.get(status) }))
  if (extra.length) out.push({ status: "其他", rows: extra })
  return out
}

export function loadGoalLedger(cwd = process.cwd()) {
  for (const parts of GOAL_LEDGER_FILES) {
    const p = join(cwd, ...parts)
    if (!existsSync(p)) continue
    return parseGoalLedger(readFileSync(p, "utf8"))
  }
  return []
}

function renderGoalRow(row) {
  const project = row.project
    ? `<span class="id">${escapeGoalHtml(row.project)}</span>`
    : `<span class="goals-none">无项目</span>`
  const look = row.look
    ? `<div class="goals-look">${escapeGoalHtml(row.look)}</div>`
    : ""
  return `
        <article class="goals-row">
          <div class="goals-main">
            <span class="id">${escapeGoalHtml(row.id)}</span>
            <span class="goals-cap">${escapeGoalHtml(row.capability)}</span>
            <span class="title" title="${escapeGoalHtml(row.goal)}">${escapeGoalHtml(row.goal)}</span>
            ${project}
          </div>
          ${look}
        </article>`
}

export function renderGoalsPanel(rows) {
  const list = Array.isArray(rows) ? rows : []
  const groups = groupGoals(list)
  const unfinished = list.filter((r) => r.status === "口号" || r.status === "做了一截").length
  let body
  if (!list.length) {
    body = `<div class="goals-empty">目标册还没有条目</div>`
  } else {
    body = groups
      .map(({ status, rows: groupRows }) => {
        if (!groupRows.length && status === "其他") return ""
        const open = status === "已做成" || status === "其他" ? "" : " open"
        const items = groupRows.length
          ? groupRows.map(renderGoalRow).join("")
          : `<div class="goals-empty">没有「${escapeGoalHtml(status)}」</div>`
        return `
    <details class="goals-group"${open}>
      <summary>
        <span class="goals-status">${escapeGoalHtml(status)}</span>
        <span class="count">${groupRows.length}</span>
      </summary>
      <div class="goals-rows">${items}</div>
    </details>`
      })
      .join("")
  }
  return `
  <section class="goals" aria-label="目标册" data-unfinished="${unfinished}">
    <div class="goals-head">
      <h2>目标册</h2>
      <p>只读。改状态改文首，总表同一轮抄过来。</p>
    </div>
    ${body}
  </section>`
}

export function unfinishedGoalCount(rows) {
  return (rows || []).filter((r) => r.status === "口号" || r.status === "做了一截").length
}
