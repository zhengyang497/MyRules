#!/usr/bin/env node
const paths = require('./lib/paths');
const exportLib = require('./lib/export');

function parseArgs(argv) {
  let project = null;
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') project = argv[++i];
    else if (argv[i] === '--apply') apply = true;
  }
  return { project, apply };
}

function run({ project, cacheDir, apply = false } = {}) {
  const projectRoot = paths.getProjectRoot(project);
  const cache = cacheDir || paths.getCacheDir();
  const report = exportLib.exportProject(cache, projectRoot);
  if (apply) report.applied = exportLib.applyReport(report);
  return report;
}

if (require.main === module) {
  const report = run(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
}

module.exports = { run, parseArgs };
