#!/usr/bin/env node
const fs = require('node:fs');
const paths = require('./lib/paths');
const state = require('./lib/state');
const git = require('./lib/git');
const hooksState = require('./lib/hooks-state');

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

  return {
    project: projectRoot,
    cacheDir: cache,
    cacheDirty,
    ...s,
    projectHooksDeployed: Object.keys(s.deployedHooks || {}).length,
    userHooksDeployed: Object.keys(userHooksState.deployedHooks || {}).length,
  };
}

if (require.main === module) {
  console.log(JSON.stringify(run(parseArgs(process.argv.slice(2))), null, 2));
}

module.exports = { run, parseArgs };
