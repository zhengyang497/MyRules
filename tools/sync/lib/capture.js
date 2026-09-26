// tools/sync/lib/capture.js
//
// 捕获决策引擎（spec §4 乐观并发）：对每个缓存源的全部部署拷贝分组判定——
// - 干净（D === emitted(S)）：不动
// - 缓存前进（hash(D) === baseline）：不动，部署照常更新
// - 手改：仅当 baseline === hash(emitted(S))（手改基于当前缓存版本）且
//   各平台候选正文一致时写回缓存源；否则冲突报告，文件保留，绝不覆盖。
// 捕获让缓存变 dirty → 下次 sync 被 pull 闸门拦住，直到 push.js 发布。
const fs = require('node:fs');
const path = require('node:path');
const fsutil = require('./fsutil');
const reverseMap = require('./reverse-map');

function captureHandEdits(cacheDir, projectRoot, opts = {}) {
  const entries = reverseMap.buildReverseMap(cacheDir, projectRoot, opts);
  const priorHashes = opts.priorHashes || {};
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
      const baseline = priorHashes[m.stateKey];
      if (baseline && baseline === fsutil.hashContent(D)) continue; // 缓存前进，部署会更新
      edited.push({ m, D, E });
    }
    if (!edited.length) continue;

    const candidates = [];
    for (const { m, D, E } of edited) {
      const baseline = priorHashes[m.stateKey];
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
