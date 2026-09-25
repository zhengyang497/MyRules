const fs = require('node:fs');
const fsutil = require('./fsutil');

function createTracker({ force = false, priorHashes = {} } = {}) {
  const nextHashes = {};
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
          return;
        }
      }
    }
    fs.writeFileSync(targetFile, content);
    nextHashes[stateKey] = desiredHash;
    written.push(targetFile);
  }

  return { writeTracked, drifted, written, hashes: nextHashes };
}

module.exports = { createTracker };
