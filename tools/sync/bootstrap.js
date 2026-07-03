#!/usr/bin/env node
const init = require('./init');

if (require.main === module) {
  init.run(init.parseArgs(process.argv.slice(2)));
}

module.exports = init;
