// tools/sync/lib/paths.js
const os = require('node:os');
const path = require('node:path');

function getCacheDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.myrules');
}

function getProjectRoot(explicitPath) {
  return path.resolve(explicitPath || process.cwd());
}

function getClaudeUserRulesDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.claude', 'rules');
}

function getClaudeUserSkillsDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.claude', 'skills');
}

function getCursorUserSkillsDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.cursor', 'skills');
}

function getCursorRulesDir(projectRoot) {
  return path.join(projectRoot, '.cursor', 'rules');
}

function getClaudeProjectRulesDir(projectRoot) {
  return path.join(projectRoot, '.claude', 'rules');
}

function getCursorAgentsDir(projectRoot) {
  return path.join(projectRoot, '.cursor', 'agents');
}

function getClaudeAgentsDir(projectRoot) {
  return path.join(projectRoot, '.claude', 'agents');
}

function getStateFilePath(projectRoot) {
  return path.join(projectRoot, '.myrules-sync-state.json');
}

function getRegistryFilePath(homeDir = os.homedir()) {
  return path.join(getCacheDir(homeDir), '.registry.json');
}

function getCursorProjectHooksDir(projectRoot) {
  return path.join(projectRoot, '.cursor', 'hooks');
}

function getCursorProjectHooksConfig(projectRoot) {
  return path.join(projectRoot, '.cursor', 'hooks.json');
}

function getCursorUserHooksDir(homeDir = os.homedir()) {
  return path.join(homeDir, '.cursor', 'hooks');
}

function getCursorUserHooksConfig(homeDir = os.homedir()) {
  return path.join(homeDir, '.cursor', 'hooks.json');
}

function getUserHooksStateFilePath(homeDir = os.homedir()) {
  return path.join(getCacheDir(homeDir), '.user-hooks-state.json');
}

module.exports = {
  getCacheDir,
  getProjectRoot,
  getClaudeUserRulesDir,
  getClaudeUserSkillsDir,
  getCursorUserSkillsDir,
  getCursorRulesDir,
  getClaudeProjectRulesDir,
  getCursorAgentsDir,
  getClaudeAgentsDir,
  getStateFilePath,
  getRegistryFilePath,
  getCursorProjectHooksDir,
  getCursorProjectHooksConfig,
  getCursorUserHooksDir,
  getCursorUserHooksConfig,
  getUserHooksStateFilePath,
};
