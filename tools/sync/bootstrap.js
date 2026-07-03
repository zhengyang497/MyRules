#!/usr/bin/env node
// Deprecated alias — use sync.js.
const sync = require('./sync');

if (require.main === module) {
  try {
    sync.run(sync.parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = sync;
