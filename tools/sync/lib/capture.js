// tools/sync/lib/capture.js
//
// 捕获决策引擎（spec §4 乐观并发）：对每个缓存源的全部部署拷贝分组判定——
// - 干净（D === emitted(S)）：不动
// - 缓存前进（captureBaseline === hash(D)）：不动，部署照常更新
// - 手改：仅当粘性捕获基线 === hash(emitted(S))（手改基于当前缓存版本）且
//   各平台候选正文一致时写回缓存源；否则冲突报告，文件保留，绝不覆盖。
// 捕获让缓存变 dirty → 下次 sync 被 pull 闸门拦住，直到 push.js 发布。
//
// F1 粘性基线（state.captureBaselines，与 deployedHashes 分离）：
// - 基线只在「部署真正写盘 / 盘上已等于产出 / 捕获成功后同轮部署写盘」时前进（drift.js 写入）；
// - drift 拒写与捕获冲突【永不】推进它 → 被拒绝的捕获在此后每次 sync 继续被拒绝，
//   除非 (a) 缓存源回到磁盘文件所派生的版本，或 (b) 磁盘文件不再是编辑（收敛/被覆盖）；
// - 兼容：老 state 文件没有该字段时，一次性以 deployedHashes 播种（readState 缺席即播种）；
//   字段已存在但缺某个 key → 视为无基线（保守拒绝，no-baseline 语义）。
const fs = require('node:fs');
const path = require('node:path');
const fsutil = require('./fsutil');
const reverseMap = require('./reverse-map');

function captureHandEdits(cacheDir, projectRoot, opts = {}) {
  const entries = reverseMap.buildReverseMap(cacheDir, projectRoot, opts);
  const priorHashes = opts.priorHashes || {};
  // 字段缺席（老 state / state 丢失）→ 用 deployedHashes 播种一次；字段在 → 逐 key 粘性读取
  const captureBaselines = opts.priorCaptureBaselines || { ...priorHashes };
  const captured = [];
  const conflicts = [];

  // 分组：一个缓存源 ↔ 全部平台拷贝
  const groups = new Map();
  for (const m of entries) {
    if (!fs.existsSync(m.abs)) continue;
    // sourceAbs 缺失 → deploy 本就不部署缺失源，捕获无从回流：静默跳过（不读、不报）
    if (!fs.existsSync(m.sourceAbs)) continue;
    if (!groups.has(m.sourceAbs)) groups.set(m.sourceAbs, []);
    groups.get(m.sourceAbs).push(m);
  }

  for (const [sourceAbs, members] of groups) {
    const S = fs.readFileSync(sourceAbs, 'utf8');
    const edited = [];
    for (const m of members) {
      const D = fs.readFileSync(m.abs, 'utf8');
      const E = reverseMap.emittedSource(m, S);
      if (D === E) continue;
      const baseline = captureBaselines[m.stateKey];
      if (baseline && baseline === fsutil.hashContent(D)) continue; // 缓存前进，部署会更新
      edited.push({ m, D, E });
    }
    if (!edited.length) continue;

    const candidates = [];
    for (const { m, D, E } of edited) {
      const baseline = captureBaselines[m.stateKey];
      if (!baseline || baseline !== fsutil.hashContent(E)) {
        conflicts.push({ abs: m.abs, sourceAbs, stateKey: m.stateKey, reason: baseline ? 'cache-moved' : 'no-baseline' });
        continue;
      }
      const r = reverseMap.backfillSource(m, S, D);
      if (!r.ok) {
        conflicts.push({ abs: m.abs, sourceAbs, stateKey: m.stateKey, reason: r.reason });
        continue;
      }
      candidates.push({ m, source: r.source });
    }

    const distinct = new Map();
    for (const c of candidates) distinct.set(c.source, c);
    if (distinct.size === 1) {
      const source = [...distinct.keys()][0];
      fs.writeFileSync(sourceAbs, source);
      // 捕获成功 (ii)：同轮随后的部署以新产出干净写盘 → drift.js 把这些 key 的
      // 捕获基线前进到新产出哈希（round-trip 守卫保证写盘必然干净）。
      for (const c of candidates) {
        captured.push({ abs: c.m.abs, sourceAbs, stateKey: c.m.stateKey });
      }
    } else if (distinct.size > 1) {
      for (const c of candidates) {
        conflicts.push({ abs: c.m.abs, sourceAbs, stateKey: c.m.stateKey, reason: 'disagree' });
      }
    }
  }

  // 托管技能目录里的新文件（映射里没有源）：只报告。导到缓存用 export --apply。
  reportNewSkillFiles(entries, projectRoot, conflicts);

  return { captured, conflicts };
}

function reportNewSkillFiles(entries, projectRoot, conflicts) {
  const known = new Set(entries.map((e) => e.abs));
  const skillDirs = new Set();
  for (const e of entries) {
    if (e.surface !== 'skill') continue;
    skillDirs.add(path.dirname(e.abs));
  }
  for (const dir of skillDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (!fs.statSync(abs).isFile()) continue;
      if (known.has(abs)) continue;
      conflicts.push({ abs, sourceAbs: null, stateKey: null, reason: 'new-file' });
    }
  }
}

module.exports = { captureHandEdits };
