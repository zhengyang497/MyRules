// hooks/project/session-start-context.js
const fs = require('node:fs');
const path = require('node:path');

module.exports.meta = {
  event: 'sessionStart',
  description:
    'At the start of every session in this project, if .myrules-context.md exists ' +
    'at the project root, read it and inject its content as additional context.',
};

module.exports.handle = function handle(input) {
  const projectRoot = process.env.CURSOR_PROJECT_DIR || input.workspace_roots?.[0] || process.cwd();
  const contextFile = path.join(projectRoot, '.myrules-context.md');
  if (!fs.existsSync(contextFile)) return {};
  return { additional_context: fs.readFileSync(contextFile, 'utf8') };
};

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      const text = raw.replace(/^\uFEFF/, '');
      console.log(JSON.stringify(module.exports.handle(JSON.parse(text || '{}'))));
    } catch (err) {
      console.error(err.message);
      console.log('{}');
    }
  });
}
