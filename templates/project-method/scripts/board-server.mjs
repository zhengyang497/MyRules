#!/usr/bin/env node
// 本地改进清单看板。只读 items/*.md，刷新浏览器即可。

import { createServer } from "http"
import { readItems } from "./board-io.mjs"

const PORT = parseInt(process.env.PORT || "8080", 10)

function loadItems() {
  return readItems().data.items || []
}

function isActive(item) {
  return item.status === "todo" || item.status === "partial"
}

function escapeHtml(s) {
  if (s == null) return ""
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function parseImpl(text) {
  const impl = []
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*\[( |x|X)\]\s*(.+)$/)
    if (m) impl.push({ done: m[1].toLowerCase() === "x", text: m[2].trim() })
  }
  return impl
}

function placementColor(p) {
  if (p === "改承诺") return "#1f6feb"
  if (p === "新承诺") return "#8957e5"
  if (p === "只记工作") return "#fb8500"
  return "#666"
}

function statusMark(s) {
  if (s === "partial") return "暂停"
  if (s === "done") return "完成"
  if (s === "wont") return "不做"
  return "待做"
}

function renderFocus(item) {
  const color = placementColor(item.placement)
  const note = item.body || ""
  const impl = parseImpl(note)
  const implDone = impl.filter((s) => s.done).length
  let progress = ""
  if (impl.length) {
    progress = `<div class="meta">勾选 ${implDone}/${impl.length}</div>`
    progress +=
      `<div class="steps">` +
      impl.map((s) => `<div class="step ${s.done ? "done" : ""}">${s.done ? "☑" : "☐"} ${escapeHtml(s.text)}</div>`).join("") +
      `</div>`
  }
  return `<div class="focus-card">
    <div class="row">
      <span class="badge" style="background:${color}">${escapeHtml(item.placement || "未标落点")}</span>
      <span class="id">${escapeHtml(item.id)}</span>
      <span class="title">${escapeHtml(item.title)}</span>
    </div>
    ${item.goal ? `<div class="meta">设计目标：${escapeHtml(item.goal)}</div>` : ""}
    <div class="meta">卡片：docs/看板/items/${escapeHtml(item.id)}.md</div>
    ${progress}
    <pre>${escapeHtml(note || "（无正文）")}</pre>
  </div>`
}

function renderItem(item) {
  const color = placementColor(item.placement)
  const note = item.body || ""
  return `<details class="item">
    <summary>
      <span class="badge" style="background:${color}">${escapeHtml(item.placement || "未标落点")}</span>
      <span class="st">${escapeHtml(statusMark(item.status))}</span>
      <span class="id">${escapeHtml(item.id)}</span>
      <span class="title">${escapeHtml(item.title)}</span>
    </summary>
    <div class="body">
      ${item.goal ? `<div class="meta">设计目标：${escapeHtml(item.goal)}</div>` : ""}
      <div class="meta">卡片：docs/看板/items/${escapeHtml(item.id)}.md</div>
      <pre>${escapeHtml(note || "（无正文）")}</pre>
    </div>
  </details>`
}

function page() {
  const items = loadItems()
  const active = items.filter(isActive).sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  const done = items.filter((i) => i.status === "done" || i.status === "wont")
  const focus = active.filter((i) => i.focus === true)
  const focusHtml = focus.length
    ? focus.map(renderFocus).join("")
    : `<div class="empty">没有 focus。登记时加 --focus，或 patch --set focus=true。</div>`

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>改进清单看板</title>
  <style>
    :root { --bg:#1e1e1e; --card:#2d2d2d; --text:#e0e0e0; --dim:#9da5b4; --border:#444; --link:#58a6ff; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; line-height:1.55; }
    .wrap { max-width: 920px; margin: 0 auto; padding: 20px 16px 48px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    .stats { color: var(--dim); font-size: 13px; margin-bottom: 16px; }
    .cockpit { background: #3a2e24; border: 1px solid #6b5344; border-radius: 10px; padding: 14px 16px; margin-bottom: 18px; }
    .cockpit h2 { margin: 0 0 10px; font-size: 14px; }
    .focus-card { background: #2d2d2d; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .badge { color:#fff; font-size:12px; padding:2px 8px; border-radius:4px; }
    .id { font-family: ui-monospace, Consolas, monospace; color: var(--link); font-size: 13px; }
    .title { font-weight: 600; }
    .meta { color: var(--dim); font-size: 12px; margin-top: 6px; }
    .steps { margin-top: 8px; font-size: 13px; }
    .step.done { color: var(--dim); text-decoration: line-through; }
    .empty { color: var(--dim); font-size: 13px; }
    .layer { background: var(--card); border-radius: 8px; margin-bottom: 14px; overflow: hidden; }
    .layer h2 { margin:0; padding:10px 14px; font-size:14px; border-bottom:1px solid var(--border); }
    .item { border-bottom: 1px solid var(--border); }
    .item:last-child { border-bottom: none; }
    summary { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px 14px; cursor:pointer; }
    summary:hover { background: #383838; }
    .st { font-size: 12px; color: var(--dim); }
    .body { padding: 0 14px 12px; }
    pre { white-space: pre-wrap; font-size: 13px; color: var(--text); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>改进清单看板</h1>
    <div class="stats">进行中 ${active.length} · 已结束 ${done.length} · 全部 ${items.length} · 刷新本页即可</div>
    <section class="cockpit">
      <h2>当前 focus（${focus.length}）</h2>
      ${focusHtml}
    </section>
    <section class="layer">
      <h2>进行中</h2>
      ${active.length ? active.map(renderItem).join("") : `<div class="empty" style="padding:12px 14px">没有进行中的项</div>`}
    </section>
    <section class="layer">
      <h2>已结束</h2>
      ${done.length ? done.map(renderItem).join("") : `<div class="empty" style="padding:12px 14px">还没有结束的项</div>`}
    </section>
  </div>
</body>
</html>`
}

createServer((req, res) => {
  if (req.url === "/favicon.ico") {
    res.writeHead(204)
    res.end()
    return
  }
  try {
    const html = page()
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    res.end(html)
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
    res.end(String(err && err.message ? err.message : err))
  }
}).listen(PORT, () => {
  console.log(`改进清单看板 http://localhost:${PORT}/`)
})
