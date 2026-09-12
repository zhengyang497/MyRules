#!/usr/bin/env node
// 改进清单看板 CLI。每张卡一篇 markdown。编号和状态走这里改页眉，正文按普通文件改。
//
//   node scripts/board.mjs add --title "..." [--body "..."] [--focus]
//   node scripts/board.mjs patch --id item-1 --status done [--set focus=true]
//   node scripts/board.mjs server

import { readFileSync } from "fs"
import { spawn } from "child_process"
import { findItem, patchItem, readItems, writeItem } from "./board-io.mjs"

const PLACEMENTS = new Set(["改承诺", "新承诺", "只记工作"])
const STATUSES = new Set(["todo", "partial", "done", "wont"])
const META_SET = new Set(["title", "status", "placement", "goal", "focus", "order", "num"])

function usage(code = 1) {
  console.error(`用法:
  node scripts/board.mjs summary
  node scripts/board.mjs next
  node scripts/board.mjs get --id <id>
  node scripts/board.mjs add --title <标题>
       [--body <文本>] [--body-file <path>]
       [--placement <改承诺|新承诺|只记工作>] [--goal <设计目标路径>] [--focus]
  node scripts/board.mjs patch --id <id> [--status todo|partial|done|wont]
       [--title <标题>] [--set key=value]... [--unset key]... [--body-file <path>] [--prepend-body-file <path>]
  node scripts/board.mjs server
`)
  process.exit(code)
}

function parseArgs(argv) {
  const args = { _: [], sets: [], unsets: [] }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === "--focus") args.focus = true
    else if (t === "--set") {
      const kv = argv[++i]
      if (!kv || !kv.includes("=")) {
        console.error("--set 需要 key=value")
        process.exit(1)
      }
      const eq = kv.indexOf("=")
      args.sets.push({ key: kv.slice(0, eq), val: kv.slice(eq + 1) })
    } else if (t === "--unset") {
      const key = argv[++i]
      if (!key) {
        console.error("--unset 需要 key")
        process.exit(1)
      }
      args.unsets.push(key)
    } else if (t.startsWith("--")) {
      const key = t.slice(2)
      const val = argv[i + 1]
      if (val === undefined || val.startsWith("--")) args[key] = true
      else {
        args[key] = val
        i++
      }
    } else args._.push(t)
  }
  return args
}

function parseValue(val) {
  if (val === "true") return true
  if (val === "false") return false
  if (/^-?\d+$/.test(val)) return parseInt(val, 10)
  if (val.startsWith("[") || val.startsWith("{")) {
    try {
      return JSON.parse(val)
    } catch {
      return val
    }
  }
  return val
}

function isActive(item) {
  return item.status === "todo" || item.status === "partial"
}

function assertPlacementGoal(item) {
  if (item.placement) {
    if (!PLACEMENTS.has(item.placement)) {
      throw new Error("placement 必须是：改承诺 / 新承诺 / 只记工作（也可留空）")
    }
    if (item.placement !== "只记工作" && !item.goal) {
      throw new Error("改承诺或新承诺必须带 goal 指向一篇设计目标")
    }
  }
}

function cmdSummary() {
  const { data } = readItems()
  const counts = { todo: 0, partial: 0, done: 0, wont: 0 }
  for (const it of data.items) {
    if (counts[it.status] == null) counts[it.status] = 0
    counts[it.status]++
  }
  const focus = data.items.filter((i) => i.focus === true && isActive(i))
  console.log(
    `共 ${data.items.length} 项  todo ${counts.todo}  partial ${counts.partial}  done ${counts.done}  wont ${counts.wont}`,
  )
  if (focus.length) {
    console.log("focus:")
    for (const it of focus) console.log(`  ${it.id}  ${it.title}`)
  }
}

function cmdNext() {
  const { data } = readItems()
  const active = data.items.filter(isActive).sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  const focus = active.find((i) => i.focus === true)
  const item = focus || active[0]
  if (!item) {
    console.log("没有进行中的项")
    return
  }
  printItem(item)
}

function cmdGet(args) {
  if (!args.id) usage()
  const item = findItem(args.id)
  if (!item) {
    console.error(`未找到 ${args.id}`)
    process.exit(1)
  }
  printItem(item)
}

function printItem(item) {
  console.log(`${item.id}  [${item.status}]  ${item.placement || "（未标落点）"}  ${item.title}`)
  console.log(`  卡片: docs/看板/items/${item.id}.md`)
  if (item.goal) console.log(`  设计目标: ${item.goal}`)
  if (item.focus) console.log("  focus: true")
  if (item.body) console.log("\n" + item.body.replace(/\n$/, ""))
}

function cmdAdd(args) {
  if (!args.title) usage()
  if (args.plan) {
    console.error("--plan 已取消。每张卡就是 docs/看板/items/<id>.md，正文写在这一篇里。")
    process.exit(1)
  }
  const draft = {
    placement: typeof args.placement === "string" ? args.placement : "",
    goal: args.goal || "",
  }
  try {
    assertPlacementGoal(draft)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
  const { data } = readItems()
  const nums = data.items.map((i) => parseInt(String(i.num), 10)).filter((n) => !Number.isNaN(n))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  const id = `item-${next}`
  if (data.items.find((i) => i.id === id)) {
    console.error(`ID 已存在: ${id}`)
    process.exit(1)
  }
  let notes = typeof args.body === "string" ? args.body : ""
  if (args["body-file"]) notes = readFileSync(args["body-file"], "utf8")
  const orders = data.items.map((i) => i.order ?? 0)
  const created = {
    id,
    num: String(next),
    title: args.title,
    status: "todo",
    placement: draft.placement,
    goal: draft.goal,
    focus: args.focus === true,
    order: (orders.length ? Math.max(...orders) : 0) + 10,
    body: notes,
  }
  try {
    writeItem(created)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
  console.log(`已登记 ${id}`)
  printItem(created)
}

function cmdPatch(args) {
  if (!args.id) usage()
  if (args.status && !STATUSES.has(args.status)) {
    console.error("status 必须是 todo | partial | done | wont")
    process.exit(1)
  }
  if (args.plan) {
    console.error("--plan 已取消。正文写在 docs/看板/items/<id>.md。")
    process.exit(1)
  }
  let item
  try {
    item = patchItem(args.id, (it) => {
      if (args.status) it.status = args.status
      if (typeof args.title === "string") it.title = args.title
      if (args.focus === true) it.focus = true
      for (const { key, val } of args.sets) {
        if (key === "plan" || key === "attachment" || key === "body") {
          throw new Error(`不要 --set ${key}=。改正文用 --body-file；每张卡没有外部指针。`)
        }
        if (!META_SET.has(key)) throw new Error(`不能改页眉字段: ${key}`)
        it[key] = parseValue(val)
      }
      if (args["body-file"] || args["prepend-body-file"]) {
        let text = it.body || ""
        if (args["body-file"]) text = readFileSync(args["body-file"], "utf8")
        if (args["prepend-body-file"]) {
          const extra = readFileSync(args["prepend-body-file"], "utf8")
          text = extra + (text ? "\n" + text : "")
        }
        it.body = text
      }
      for (const key of args.unsets) {
        if (key === "id" || key === "num" || key === "status" || key === "title") {
          throw new Error(`不能去掉: ${key}`)
        }
        if (key === "focus") it.focus = false
        else if (key === "order") it.order = 0
        else it[key] = ""
      }
      assertPlacementGoal(it)
    })
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
  console.log(`已更新 ${args.id}`)
  printItem(item)
}

function cmdServer() {
  const child = spawn(process.execPath, ["scripts/board-server.mjs"], {
    stdio: "inherit",
    cwd: process.cwd(),
  })
  child.on("exit", (c) => process.exit(c ?? 0))
}

const args = parseArgs(process.argv.slice(2))
const cmd = args._[0]
if (!cmd) usage()
if (cmd === "summary") cmdSummary()
else if (cmd === "next") cmdNext()
else if (cmd === "get") cmdGet(args)
else if (cmd === "add") cmdAdd(args)
else if (cmd === "patch") cmdPatch(args)
else if (cmd === "server") cmdServer()
else usage()
