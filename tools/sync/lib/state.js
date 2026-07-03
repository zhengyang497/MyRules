const fs = require('node:fs');
const paths = require('./paths');

const DEFAULT_STATE = {
  schemaVersion: 1,
  cachePath: '~/.myrules',
  cacheCommit: null,
  lastSyncAt: null,
  lastPruneAt: null,
  pruneDryRunDone: false,
  pruneDryRunAt: null,
  legacyRulesFingerprint: null,
  legacyRulesDetected: 0,
  deployedHashes: {},
  deployedHooks: {},
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
