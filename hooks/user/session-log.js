// hooks/user/session-log.js
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

module.exports.meta = {
  event: 'sessionEnd',
  description:
    'Whenever any session ends, in any project on this machine, append a one-line ' +
    'entry (timestamp, project, duration, status) to ~/myrules-activity-log.md.',
};

module.exports.handle = function handle(input, opts = {}) {
  const homeDir = opts.homeDir || os.homedir();
  const project = path.basename(input.workspace_roots?.[0] || process.cwd());
  const line = `- ${new Date().toISOString()} | ${project} | ${input.duration_ms}ms | ${input.reason}\n`;
  fs.appendFileSync(path.join(homeDir, 'myrules-activity-log.md'), line);
  return {};
};

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      console.log(JSON.stringify(module.exports.handle(JSON.parse(raw || '{}'))));
    } catch (err) {
      console.error(err.message);
      console.log('{}');
    }
  });
}
