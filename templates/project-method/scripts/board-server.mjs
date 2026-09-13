#!/usr/bin/env node
// 改进清单看板 HTTP 服务。真源是 docs/看板/items/*.md。
// 页面骨架、字体、字号对齐交易复盘 wiki 的改造清单看板；分组用落点，不写死业务库名。

import { createServer } from "http"
import { resolve } from "path"
import { pathToFileURL } from "url"
import { readItems } from "./board-io.mjs"

const PORT = parseInt(process.env.PORT || "8080", 10)

const PLACEMENT_ORDER = ["改承诺", "新承诺", "只记工作", "未标落点"]

const PLACEMENT_NAMES = {
  改承诺: "改已有承诺",
  新承诺: "新增长期承诺",
  只记工作: "一次性工作",
  未标落点: "尚未标落点",
}

const PLACEMENT_SHORT = {
  改承诺: "改承诺",
  新承诺: "新承诺",
  只记工作: "只记工作",
  未标落点: "未标落点",
}

const PLACEMENT_COLORS = {
  改承诺: "#1f6feb",
  新承诺: "#8957e5",
  只记工作: "#fb8500",
  未标落点: "#666",
}

const DONE_COLOR = "#2ea043"

export function isActiveItem(item) {
  const s = item.status
  return s === "todo" || s === "partial"
}

export function isEndedItem(item) {
  const s = item.status
  return s === "done" || s === "wont"
}

export function placementOf(item) {
  const p = item.placement && String(item.placement).trim()
  return PLACEMENT_ORDER.includes(p) ? p : "未标落点"
}

export function escapeHtml(s) {
  if (s == null) return ""
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function renderTitleHtml(title) {
  return escapeHtml(title).replace(
    /\u23F8\uFE0F?/g,
    '<span class="defer-mark" title="暂缓" aria-label="暂缓"><span></span><span></span></span>',
  )
}

function parseImpl(text) {
  const impl = []
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*\[( |x|X|~)\]\s*(.+)$/)
    if (m) impl.push({ done: m[1] === "x" || m[1] === "X", inProgress: m[1] === "~", text: m[2].trim() })
  }
  return impl
}

function statusEmoji(status) {
  if (status === "partial") return "⏸️ "
  if (status === "done") return "✅"
  if (status === "wont") return "⛔"
  return "⬜"
}

function shortTitle(title) {
  return String(title ?? "").split("|")[0].trim()
}

function loadAllItems() {
  return readItems().data.items || []
}

export function boardItems(allItems) {
  return allItems
    .filter(isActiveItem)
    .sort((a, b) => {
      const pa = PLACEMENT_ORDER.indexOf(placementOf(a))
      const pb = PLACEMENT_ORDER.indexOf(placementOf(b))
      if (pa !== pb) return pa - pb
      return (a.order ?? 999) - (b.order ?? 999)
    })
}

export function buildCockpit(allItems) {
  const active = allItems.filter(isActiveItem)
  const focus = active.filter((i) => i.focus === true)
  return { focus }
}

function renderItem(item) {
  const markers = item.focus === true ? "🔥" : ""
  const order = String(item.order ?? "?").padStart(2, "0")
  return `
    <details class="item">
      <summary>
        <span class="layer-order">${escapeHtml(order)}</span>
        <span class="status">${statusEmoji(item.status)}</span>
        ${markers ? `<span class="markers">${markers}</span>` : ""}
        <span class="id">${escapeHtml(item.id)}</span>
        <span class="title">${renderTitleHtml(item.title)}</span>
      </summary>
      <div class="body">${item.goal ? `设计目标：${escapeHtml(item.goal)}\n` : ""}卡片：docs/看板/items/${escapeHtml(item.id)}.md\n${escapeHtml(item.body || "(无正文)")}</div>
    </details>
  `
}

function renderCockpitFocusItem(item) {
  const place = placementOf(item)
  const color = PLACEMENT_COLORS[place]
  const impl = parseImpl(item.body)
  const implDone = impl.filter((s) => s.done).length
  const implTotal = impl.length
  let progressHtml = ""
  let stepHtml = ""
  if (implTotal > 0) {
    const implIcon = implDone === implTotal ? "✅" : "⏳"
    progressHtml = `
        <div class="cockpit-phases">
          <span class="phase"><span class="phase-icon">${implIcon}</span>勾选 ${implDone}/${implTotal}</span>
        </div>`
    const currentIdx = impl.findIndex((s) => !s.done)
    stepHtml =
      `<div class="cockpit-steps">` +
      impl
        .map((s, i) => {
          const isCurrent = i === currentIdx
          const cls = s.done ? "step-done" : isCurrent ? "step-current" : "step-todo"
          const icon = s.done ? "✅" : s.inProgress ? "⏳" : "□"
          return `<div class="cockpit-step ${cls}">${icon} ${escapeHtml(s.text)}</div>`
        })
        .join("") +
      `</div>`
  }
  const extra = item.goal
    ? `<span class="cockpit-extra" title="${escapeHtml(item.goal)}">${escapeHtml(item.goal)}</span>`
    : `<span class="cockpit-extra" title="docs/看板/items/${escapeHtml(item.id)}.md">📄 docs/看板/items/${escapeHtml(item.id)}.md</span>`
  return `
    <div class="cockpit-focus-item">
      <div class="cockpit-row">
        <span class="layer-badge" style="background: ${color}">${escapeHtml(place)}</span>
        <span class="id">${escapeHtml(item.id)}</span>
        <span class="title" title="${escapeHtml(item.title)}">${escapeHtml(shortTitle(item.title))}</span>
        ${extra}
      </div>
      ${progressHtml}
      ${stepHtml}
    </div>`
}

function renderCockpit(cockpit) {
  const focusHtml = cockpit.focus.length
    ? cockpit.focus.map((i) => renderCockpitFocusItem(i)).join("")
    : `<div class="cockpit-empty">无 focus 项 — 登记时加 <code>--focus</code>，或 <code>patch --set focus=true</code></div>`
  return `
  <section class="cockpit" aria-label="驾驶舱">
    <div class="cockpit-col cockpit-focus">
      <h3>🔴 当前 focus <span class="count">${cockpit.focus.length}</span></h3>
      <div class="cockpit-items">${focusHtml}</div>
    </div>
  </section>`
}

function layerBlock(id, title, color, items, emptyText) {
  const bodyHtml = items.length
    ? `<div class="items">${items.map((item) => renderItem(item)).join("")}</div>`
    : `<div class="layer-empty">${escapeHtml(emptyText)}</div>`
  return `
      <section class="layer" style="--accent: ${color}">
        <h2>
          <span class="layer-badge" style="background: ${color}">${escapeHtml(id)}</span>
          ${escapeHtml(title)}
          <span class="count">${items.length} 项</span>
        </h2>
        <div class="layer-body">
          ${bodyHtml}
        </div>
      </section>`
}

export function renderBoardHtml(allItems) {
  const items = boardItems(allItems)
  const ended = allItems.filter(isEndedItem).sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  const cockpit = buildCockpit(allItems)
  const byPlacement = new Map(PLACEMENT_ORDER.map((p) => [p, []]))
  for (const item of items) {
    byPlacement.get(placementOf(item)).push(item)
  }
  const groupsWithWork = PLACEMENT_ORDER.filter((p) => byPlacement.get(p).length > 0).length

  const treeNav = PLACEMENT_ORDER.map((place) => {
    const color = PLACEMENT_COLORS[place]
    const count = byPlacement.get(place).length
    return `
      <div class="tree-lib">
        <button type="button" class="tree-node tree-lib-btn" data-node="${escapeHtml(place)}" style="--accent: ${color}">
          <span class="tree-code">${escapeHtml(place === "未标落点" ? "—" : place.slice(0, 1))}</span>
          <span class="tree-name">${escapeHtml(PLACEMENT_SHORT[place])}</span>
          <span class="tree-prog">${count}</span>
        </button>
      </div>`
  }).join("")

  const view = (id, inner) => `<div class="view" data-view="${escapeHtml(id)}">${inner}</div>`
  const views = [
    view(
      "all",
      renderCockpit(cockpit) +
        PLACEMENT_ORDER.map((place) =>
          layerBlock(place, PLACEMENT_NAMES[place], PLACEMENT_COLORS[place], byPlacement.get(place), "该组暂无未完成项"),
        ).join(""),
    ),
    ...PLACEMENT_ORDER.map((place) =>
      view(
        place,
        layerBlock(place, PLACEMENT_NAMES[place], PLACEMENT_COLORS[place], byPlacement.get(place), "该组暂无未完成项"),
      ),
    ),
    view("done", layerBlock("已结束", "已完成 / 不做", DONE_COLOR, ended, "还没有结束的项")),
  ].join("")

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>改进清单看板</title>
  <style>
    :root {
      --bg: #1e1e1e;
      --bg-card: #2d2d2d;
      --bg-hover: #383838;
      --text: #e0e0e0;
      --text-dim: #9da5b4;
      --border: #444;
      --link: #58a6ff;
    }
    html, body { height: 100%; }
    * { box-sizing: border-box; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      margin: 0;
      line-height: 1.6;
      display: flex;
      flex-direction: row;
      height: 100vh;
      overflow: hidden;
    }

    /* 左侧导航树 */
    .side {
      width: 264px;
      flex-shrink: 0;
      height: 100vh;
      overflow-y: auto;
      padding: 16px 14px;
      border-right: 1px solid var(--border);
      background: #232326;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .side h1 { margin: 0 0 2px; font-size: 18px; }
    .stats { display: flex; gap: 18px; color: var(--text-dim); font-size: 13px; flex-shrink: 0; }
    .stat strong { color: var(--text); font-size: 16px; margin-right: 4px; }

    .tree { display: flex; flex-direction: column; gap: 2px; }
    .tree-lib { display: flex; flex-direction: column; gap: 2px; }
    .tree-node {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 7px 10px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text);
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s, border-color 0.15s;
    }
    .tree-node:hover { background: var(--bg-hover); }
    .tree-node.is-active {
      border-color: var(--accent, var(--link));
      background: rgba(255,255,255,0.06);
    }
    .tree-all { --accent: var(--link); }
    .tree-sub { padding-left: 26px; color: var(--text-dim); }
    .tree-sub.is-active { color: var(--text); }
    .tree-lib-btn .tree-name { font-weight: 600; }
    .tree-code {
      font-family: monospace;
      font-weight: 600;
      font-size: 12px;
      flex-shrink: 0;
    }
    .tree-lib-btn .tree-code { color: var(--accent, var(--link)); }
    .tree-name {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tree-prog {
      font-size: 12px;
      color: var(--text-dim);
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* 主区：单列滚动 */
    .wrap {
      flex: 1;
      min-width: 0;
      height: 100vh;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .view { display: none; flex-direction: column; gap: 12px; }
    .view.is-active { display: flex; }

    .layer {
      margin: 0;
      background: var(--bg-card);
      border-radius: 8px;
      border-left: 4px solid var(--accent);
      overflow: hidden;
    }
    .layer h2 {
      margin: 0;
      padding: 10px 16px;
      background: rgba(255,255,255,0.03);
      border-bottom: 1px solid var(--border);
      font-size: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .layer-badge {
      background: var(--accent);
      color: #fff;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
    }
    .count {
      margin-left: auto;
      color: var(--text-dim);
      font-size: 13px;
      font-weight: normal;
    }
    .layer-body { display: flex; flex-direction: column; }
    .layer-empty { padding: 12px 18px; color: var(--text-dim); font-size: 13px; }
    .sublayer { border-bottom: 1px solid var(--border); }
    .sublayer:last-child { border-bottom: none; }
    .sublayer h3 {
      margin: 0;
      padding: 8px 16px;
      font-size: 13px;
      background: rgba(255,255,255,0.04);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-dim);
      flex-shrink: 0;
    }
    .items { padding: 4px 0; }
    .item { border-bottom: 1px solid var(--border); }
    .item:last-child { border-bottom: none; }
    .item summary {
      padding: 10px 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      user-select: none;
      transition: background 0.15s;
    }
    .item summary:hover { background: var(--bg-hover); }
    .item summary::-webkit-details-marker { display: none; }
    .item summary::before {
      content: "▶";
      color: var(--text-dim);
      font-size: 10px;
      transition: transform 0.15s;
      flex-shrink: 0;
    }
    .item[open] summary::before { transform: rotate(90deg); }
    .layer-order {
      background: rgba(255,255,255,0.08);
      padding: 1px 6px;
      border-radius: 3px;
      font-family: monospace;
      font-size: 12px;
      color: var(--text-dim);
      flex-shrink: 0;
    }
    .status { flex-shrink: 0; font-size: 14px; }
    .id {
      color: var(--link);
      font-family: monospace;
      font-size: 13px;
      flex-shrink: 0;
    }
    .title {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .defer-mark {
      display: inline-flex;
      align-items: stretch;
      gap: 3px;
      height: 0.88em;
      margin: 0 0.18em;
      vertical-align: -0.08em;
      flex-shrink: 0;
    }
    .defer-mark span {
      width: 3px;
      background: #f85149;
      border-radius: 1px;
    }
    .body {
      padding: 0 18px 16px 50px;
      color: var(--text-dim);
      font-size: 13px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .markers { flex-shrink: 0; font-size: 13px; }

    .cockpit {
      flex-shrink: 0;
      background: linear-gradient(135deg, rgba(248, 81, 73, 0.14), rgba(248, 81, 73, 0.05));
      border: 1px solid rgba(248, 81, 73, 0.4);
      border-radius: 10px;
      padding: 8px;
      box-shadow: 0 4px 20px rgba(248, 81, 73, 0.15), 0 2px 8px rgba(0, 0, 0, 0.35);
    }
    .cockpit-col {
      background: transparent;
      border-radius: 6px;
      border: none;
      overflow: hidden;
      min-width: 0;
    }
    .cockpit-col h3 {
      margin: 0;
      padding: 8px 12px;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cockpit-focus h3 {
      border-left: 3px solid #f85149;
      background: rgba(248, 81, 73, 0.12);
      font-size: 14px;
    }
    .cockpit-items { display: flex; flex-direction: column; gap: 8px; padding: 10px; }
    .cockpit-row {
      padding: 6px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .cockpit-row:last-child { border-bottom: none; }
    .cockpit-row .title {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cockpit-extra {
      color: var(--text-dim);
      font-size: 12px;
      max-width: 45%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .cockpit-empty {
      padding: 10px 12px;
      color: var(--text-dim);
      font-size: 12px;
    }
    .cockpit-empty code {
      background: rgba(255,255,255,0.08);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 11px;
    }
    .cockpit-focus-item {
      flex: none;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(248, 81, 73, 0.15);
      border-left: 3px solid rgba(248, 81, 73, 0.4);
      border-radius: 6px;
      padding: 8px 12px;
    }
    .cockpit-phases {
      display: flex;
      gap: 16px;
      padding: 4px 10px;
      font-size: 12px;
    }
    .phase { display: flex; align-items: center; gap: 4px; color: var(--text-dim); }
    .phase-icon { font-size: 13px; }
    .cockpit-steps {
      padding: 2px 12px 6px;
    }
    .cockpit-step {
      padding: 1px 0;
      font-size: 12px;
      color: var(--text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cockpit-step.step-done { color: var(--text-dim); opacity: 0.6; }
    .cockpit-step.step-current { color: var(--link); font-weight: 500; }
    .cockpit-step.step-todo { color: var(--text-dim); }
    .cockpit-warn {
      padding: 4px 12px 6px;
      font-size: 12px;
      color: #d29922;
    }
    .cockpit-warn code {
      background: rgba(255,255,255,0.08);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 11px;
    }
    footer {
      margin-top: auto;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      color: var(--text-dim);
      font-size: 12px;
    }
    @media (max-width: 900px) {
      .side { width: 200px; }
      .cockpit { padding: 6px; }
    }
  </style>
</head>
<body>
  <aside class="side">
    <h1>改进清单看板</h1>
    <div class="stats">
      <div class="stat"><strong>${items.length}</strong> 未完成项</div>
      <div class="stat"><strong>${groupsWithWork}</strong> 组有待办</div>
    </div>
    <nav class="tree" aria-label="落点分组切换">
      <button type="button" class="tree-node tree-all is-active" data-node="all">
        <span class="tree-name">全部</span>
        <span class="tree-prog">${items.length} 项</span>
      </button>
      ${treeNav}
      <div class="tree-lib">
        <button type="button" class="tree-node tree-lib-btn" data-node="done" style="--accent: ${DONE_COLOR}">
          <span class="tree-code">✓</span>
          <span class="tree-name">已结束</span>
          <span class="tree-prog">${ended.length}</span>
        </button>
      </div>
    </nav>
    <footer>
      数据来源: docs/看板/items/*.md · 左侧树切换 · 选择会记住
    </footer>
  </aside>
  <div class="wrap">
    ${views}
  </div>
  <script>
    (function () {
      var KEY = "improvements-board-node"
      var nodes = Array.prototype.slice.call(document.querySelectorAll(".tree-node"))
      var views = Array.prototype.slice.call(document.querySelectorAll(".view"))
      var wrap = document.querySelector(".wrap")

      function setNode(id) {
        views.forEach(function (v) {
          v.classList.toggle("is-active", v.getAttribute("data-view") === id)
        })
        nodes.forEach(function (n) {
          n.classList.toggle("is-active", n.getAttribute("data-node") === id)
        })
        if (wrap) wrap.scrollTop = 0
        try { localStorage.setItem(KEY, id) } catch (e) {}
      }

      nodes.forEach(function (n) {
        n.addEventListener("click", function () {
          setNode(n.getAttribute("data-node"))
        })
      })

      var saved = "all"
      try { saved = localStorage.getItem(KEY) || "all" } catch (e) {}
      var valid = views.some(function (v) { return v.getAttribute("data-view") === saved })
      setNode(valid ? saved : "all")
    })()
  </script>
</body>
</html>`
}

export function startBoardServer(port = PORT, { listen = true } = {}) {
  const server = createServer((req, res) => {
    const url = req.url || "/"
    if (url === "/favicon.ico") {
      res.writeHead(204)
      res.end()
      return
    }
    if (url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" })
      res.end("OK")
      return
    }
    if (url === "/" || url === "") {
      try {
        const html = renderBoardHtml(loadAllItems())
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        })
        res.end(html)
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
        res.end(`Error: ${e.message}`)
      }
      return
    }
    res.writeHead(404, { "Content-Type": "text/plain" })
    res.end("Not Found")
  })

  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(`❌ 端口 ${port} 已被占用。请用 PORT=xxxx 指定其他端口：`)
      console.error(`   PORT=3000 npm run board:server`)
      process.exit(1)
    }
    throw e
  })

  if (listen) {
    server.listen(port, () => {
      console.log(`\n🚀 看板运行在 http://localhost:${port}/\n`)
      console.log("   Ctrl+C 停止服务\n")
    })
  }
  return server
}

function startedAsCli() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return pathToFileURL(resolve(entry)).href === import.meta.url
  } catch {
    return false
  }
}

if (startedAsCli()) startBoardServer()
