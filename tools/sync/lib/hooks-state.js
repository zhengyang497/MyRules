const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');

const DEFAULT_USER_HOOKS_STATE = {
  schemaVersion: 1,
  deployedHooks: {},
  deployedHashes: {},
};

function readUserHooksState(homeDir) {
  const file = paths.getUserHooksStateFilePath(homeDir);
  if (!fs.existsSync(file)) return { ...DEFAULT_USER_HOOKS_STATE };
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...DEFAULT_USER_HOOKS_STATE, ...stored };
}

function writeUserHooksState(homeDir, patch) {
  const current = readUserHooksState(homeDir);
  const next = { ...current, ...patch };
  const file = paths.getUserHooksStateFilePath(homeDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}

module.exports = { DEFAULT_USER_HOOKS_STATE, readUserHooksState, writeUserHooksState };
