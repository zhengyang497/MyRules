#!/usr/bin/env node
// Alias for init.js (rules deploy only — install skill first via install-skill.js).
const init = require('./init');

if (require.main === module) {
  init.run(init.parseArgs(process.argv.slice(2)));
}

module.exports = init;
