#!/usr/bin/env node
const paths = require('./lib/paths');
const exportLib = require('./lib/export');

function parseArgs(argv) {
  let project = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') project = argv[++i];
  }
  return { project };
}

function run({ project, cacheDir } = {}) {
  const projectRoot = paths.getProjectRoot(project);
  const cache = cacheDir || paths.getCacheDir();
  return exportLib.exportProject(cache, projectRoot);
}

if (require.main === module) {
  const report = run(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
}

module.exports = { run, parseArgs };
