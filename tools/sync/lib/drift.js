const fs = require('node:fs');
const fsutil = require('./fsutil');

function createTracker({ force = false, priorHashes = {} } = {}) {
  const nextHashes = {};
  const drifted = [];
  const written = [];

  function writeTracked(targetFile, content, stateKey) {
    if (!force && fs.existsSync(targetFile)) {
      const currentHash = fsutil.hashContent(fs.readFileSync(targetFile, 'utf8'));
      const expectedHash = priorHashes[stateKey];
      if (expectedHash && currentHash !== expectedHash) {
        drifted.push(targetFile);
        nextHashes[stateKey] = currentHash;
        return;
      }
    }
    fs.writeFileSync(targetFile, content);
    nextHashes[stateKey] = fsutil.hashContent(content);
    written.push(targetFile);
  }

  return { writeTracked, drifted, written, hashes: nextHashes };
}

module.exports = { createTracker };
