#!/usr/bin/env node
const fs = require('node:fs');
const paths = require('./lib/paths');
const state = require('./lib/state');
const git = require('./lib/git');
const hooksState = require('./lib/hooks-state');
const loadManifest = require('./lib/load-manifest');

function parseArgs(argv) {
  let project = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') project = argv[++i];
  }
  return { project };
}

function run({ project, cacheDir, homeDir } = {}) {
  const projectRoot = paths.getProjectRoot(project);
  const cache = cacheDir || paths.getCacheDir();
  const home = homeDir || require('node:os').homedir();
  const s = state.readState(projectRoot);
  const userHooksState = hooksState.readUserHooksState(home);
  const cacheDirty = fs.existsSync(cache) ? git.isDirty(cache) : null;
  const manifest = loadManifest.loadManifest(cache);
  const agentHashes = s.deployedAgentHashes || {};
  const roleIds = manifest.agents?.roles ? Object.keys(manifest.agents.roles) : [];

  return {
    project: projectRoot,
    cacheDir: cache,
    cacheDirty,
    ...s,
    projectHooksDeployed: Object.keys(s.deployedHooks || {}).length,
    userHooksDeployed: Object.keys(userHooksState.deployedHooks || {}).length,
    agentsDeployed: roleIds.length,
    agentHashes: roleIds.reduce((acc, roleId) => {
      const prefix = manifest.agents?.prefix || manifest.managedPrefix;
      const cursorDir = manifest.agents?.cursorDir || '.cursor/agents';
      const claudeDir = manifest.agents?.claudeDir || '.claude/agents';
      const cursorKey = `${cursorDir}/${prefix}${roleId}.md`;
      const claudeKey = `${claudeDir}/${prefix}${roleId}.md`;
      acc[roleId] = {
        cursor: agentHashes[cursorKey] || null,
        claude: agentHashes[claudeKey] || null,
      };
      return acc;
    }, {}),
  };
}

if (require.main === module) {
  console.log(JSON.stringify(run(parseArgs(process.argv.slice(2))), null, 2));
}

module.exports = { run, parseArgs };
