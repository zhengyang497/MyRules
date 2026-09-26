const fs = require('node:fs');
const paths = require('./paths');

const DEFAULT_STATE = {
  schemaVersion: 2,
  cachePath: '~/.myrules',
  cacheCommit: null,
  lastSyncAt: null,
  lastPruneAt: null,
  pruneDryRunDone: false,
  pruneDryRunAt: null,
  legacyRulesFingerprint: null,
  legacyRulesDetected: 0,
  deployedHashes: {},
  // 注意：captureBaselines（F1 粘性捕获基线）有意不进 DEFAULT_STATE ——
  // 「字段缺席」用于识别老/丢的 state 文件并从 deployedHashes 播种一次；
  // 字段存在但缺 key = 无基线（保守拒绝，no-baseline）。
  deployedAgentHashes: {},
  deployedHooks: {},
  deployedOpencodeInstructions: { project: [], user: [] },
  deployedDshBlocks: { projectHash: null, userHash: null },
};

function readState(projectRoot) {
  const file = paths.getStateFilePath(projectRoot);
  if (!fs.existsSync(file)) {
    return { ...DEFAULT_STATE };
  }
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...DEFAULT_STATE, ...stored };
}

function writeState(projectRoot, patch) {
  const current = readState(projectRoot);
  const next = { ...current, ...patch };
  fs.writeFileSync(paths.getStateFilePath(projectRoot), JSON.stringify(next, null, 2) + '\n');
  return next;
}

module.exports = { DEFAULT_STATE, readState, writeState };
