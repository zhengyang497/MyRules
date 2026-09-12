#!/usr/bin/env node
// 看板项：docs/看板/items/item-N.md（页眉是字段，下面是正文）。
// 编号、状态、focus、落点只经本模块改页眉。正文按普通 markdown 改。

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

export const ITEMS_DIR = join(process.cwd(), "docs", "看板", "items")

const META_KEYS = ["id", "num", "title", "status", "placement", "goal", "focus", "order"]

export function itemRelPath(id) {
  return `docs/看板/items/${id}.md`
}

export function itemAbsPath(id) {
  return join(ITEMS_DIR, `${id}.md`)
}

function formatYaml(value) {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return JSON.stringify(value == null ? "" : String(value))
}

function parseYamlScalar(raw) {
  const s = String(raw).trim()
  if (s === "true") return true
  if (s === "false") return false
  if (s === '""' || s === "''") return ""
  if (/^-?\d+$/.test(s)) return parseInt(s, 10)
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try {
      if (s.startsWith('"')) return JSON.parse(s)
    } catch {
      /* fall through */
    }
    return s.slice(1, -1)
  }
  return s
}

export function parseItemMarkdown(text, fileHint = "") {
  const normalized = String(text).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  if (!normalized.startsWith("---\n") && normalized !== "---") {
    throw new Error(`看板项缺少页眉 (---): ${fileHint || "（未知文件）"}`)
  }
  const rest = normalized.startsWith("---\n") ? normalized.slice(4) : ""
  const end = rest.indexOf("\n---")
  if (end < 0) throw new Error(`看板项页眉未闭合: ${fileHint || "（未知文件）"}`)
  const yaml = rest.slice(0, end)
  let body = rest.slice(end + 4)
  if (body.startsWith("\n")) body = body.slice(1)
  const meta = {}
  for (const line of yaml.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!m) {
      throw new Error(`看板项页眉无法解析「${line}」: ${fileHint || "（未知文件）"}`)
    }
    meta[m[1]] = parseYamlScalar(m[2])
  }
  if (!meta.id) throw new Error(`看板项页眉缺少 id: ${fileHint || "（未知文件）"}`)
  return {
    id: String(meta.id),
    num: meta.num == null ? "" : String(meta.num),
    title: meta.title == null ? "" : String(meta.title),
    status: meta.status == null ? "todo" : String(meta.status),
    placement: meta.placement == null ? "" : String(meta.placement),
    goal: meta.goal == null ? "" : String(meta.goal),
    focus: meta.focus === true,
    order: typeof meta.order === "number" ? meta.order : 0,
    body: body,
  }
}

export function serializeItem(item) {
  const lines = ["---"]
  for (const key of META_KEYS) {
    let v = item[key]
    if (key === "focus") v = item.focus === true
    if (key === "order") v = typeof item.order === "number" ? item.order : 0
    if (v === undefined || v === null) v = key === "focus" ? false : key === "order" ? 0 : ""
    lines.push(`${key}: ${formatYaml(v)}`)
  }
  lines.push("---")
  const body = item.body == null ? "" : String(item.body)
  const text = lines.join("\n") + "\n" + (body.endsWith("\n") || body === "" ? body : body + "\n")
  return body === "" && !text.endsWith("\n") ? text + "\n" : text.endsWith("\n") ? text : text + "\n"
}

export function readItemFile(absPath) {
  const raw = readFileSync(absPath, "utf8")
  return parseItemMarkdown(raw, absPath)
}

export function writeItem(item) {
  mkdirSync(ITEMS_DIR, { recursive: true })
  if (!item?.id) throw new Error("writeItem 需要 id")
  const abs = itemAbsPath(item.id)
  const text = serializeItem(item)
  writeFileSync(abs, text, "utf8")
  let round
  try {
    round = parseItemMarkdown(readFileSync(abs, "utf8"), abs)
  } catch (err) {
    throw new Error(
      `writeItem 写后自检失败，文件可能已损坏: ${abs}\n${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (round.id !== item.id || round.status !== item.status || round.title !== item.title) {
    throw new Error(`writeItem 写后自检不一致: ${abs}`)
  }
  return itemRelPath(item.id)
}

export function readItems() {
  mkdirSync(ITEMS_DIR, { recursive: true })
  const names = readdirSync(ITEMS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("."))
  const items = []
  for (const name of names) {
    const abs = join(ITEMS_DIR, name)
    try {
      items.push(readItemFile(abs))
    } catch (err) {
      throw new Error(
        `读取看板项失败: ${itemRelPath(name.replace(/\.md$/, ""))}\n${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id)))
  return { data: { items } }
}

export function findItem(id) {
  const { data } = readItems()
  return data.items.find((i) => i.id === id) || null
}

export function patchItem(id, mutator) {
  const item = findItem(id)
  if (!item) throw new Error(`未找到项: ${id}`)
  mutator(item)
  writeItem(item)
  return item
}

/** 兼容旧调用：正文就是这张卡。 */
export function readCurrent(item) {
  if (item && typeof item.body === "string") return item.body
  if (item?.id && existsSync(itemAbsPath(item.id))) return readItemFile(itemAbsPath(item.id)).body
  return ""
}
