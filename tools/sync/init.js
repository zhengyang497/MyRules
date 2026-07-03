#!/usr/bin/env node
// Deprecated alias — use sync.js. Kept for backward compatibility.
const sync = require('./sync');

function parseArgs(argv) {
  let project = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') project = argv[++i];
  }
  return { project };
}

if (require.main === module) {
  try {
    sync.run({ ...parseArgs(process.argv.slice(2)) });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { run: (opts) => sync.run(opts), parseArgs };
