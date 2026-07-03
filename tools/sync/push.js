#!/usr/bin/env node
const paths = require('./lib/paths');
const git = require('./lib/git');

function parseArgs(argv) {
  let message = 'Update MyRules';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-m') message = argv[++i];
  }
  return { message };
}

function run({ message, cacheDir } = {}) {
  const cache = cacheDir || paths.getCacheDir();
  return git.commitAndPush(cache, message || 'Update MyRules');
}

if (require.main === module) {
  const result = run(parseArgs(process.argv.slice(2)));
  console.log(result.committed ? 'Pushed.' : 'Nothing to commit.');
}

module.exports = { run, parseArgs };
