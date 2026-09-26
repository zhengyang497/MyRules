const fs = require('node:fs');
const fsutil = require('./fsutil');

function createTracker({ force = false, priorHashes = {} } = {}) {
  const nextHashes = {};
  // 捕获基线（F1 粘性基线）：只记录「本 tracker 真正写盘（或盘上已等于产出）」的内容哈希。
  // drift 拒写路径【绝不】更新它 —— 否则 deployedHashes 会被 desired 污染，下一轮 sync
  // 会把「被拒绝的过期手改」误判成基于当前缓存的改动而自愈捕获，覆盖别处推进的缓存内容。
  const nextCaptureBaselines = {};
  const drifted = [];
  const written = [];

  function writeTracked(targetFile, content, stateKey) {
    const desiredHash = fsutil.hashContent(content);
    if (!force && fs.existsSync(targetFile)) {
      const currentHash = fsutil.hashContent(fs.readFileSync(targetFile, 'utf8'));
      if (currentHash !== desiredHash) {
        // 磁盘内容 ≠ 本次要写入的内容：只有「与上次部署一致」才允许更新。
        // 没有上次部署记录时以本次内容为基线 —— 先于 sync 存在的手工文件同样不许覆盖。
        // drift 时把期望哈希（而非磁盘上的手改哈希）记入 state：下一次 sync 依旧判为
        // drift。手改文件在显式 --force 或手工改回之前，永远不会被静默覆盖。
        const baseline = priorHashes[stateKey] || desiredHash;
        if (currentHash !== baseline) {
          drifted.push(targetFile);
          nextHashes[stateKey] = desiredHash;
          return; // 注意：nextCaptureBaselines 不写 → 捕获基线在拒写时保持粘性（F1）
        }
      }
    }
    fs.writeFileSync(targetFile, content);
    nextHashes[stateKey] = desiredHash;
    nextCaptureBaselines[stateKey] = desiredHash;
    written.push(targetFile);
  }

  return { writeTracked, drifted, written, hashes: nextHashes, captureBaselines: nextCaptureBaselines };
}

module.exports = { createTracker };
