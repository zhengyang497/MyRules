// hooks/project/session-start-context.js
const fs = require('node:fs');
const path = require('node:path');

module.exports.meta = {
  event: 'sessionStart',
  description:
    'At the start of a main session in this project, if .myrules-context.md exists ' +
    'at the project root, read it and inject its content as additional context. ' +
    'Skip subagent sessions so workers do not treat purpose text as a goal rewrite.',
};

function isSubagentSession(input = {}) {
  if (!input || typeof input !== 'object') return false;
  if (input.is_subagent === true || input.subagent === true) return true;
  if (typeof input.parent_session_id === 'string' && input.parent_session_id.trim()) return true;
  if (typeof input.agent_id === 'string' && input.agent_id.trim()) return true;
  if (input.composer_mode === 'subagent' || input.composer_mode === 'task') return true;
  if (input.session_type === 'subagent') return true;
  return false;
}

module.exports.isSubagentSession = isSubagentSession;

module.exports.handle = function handle(input = {}) {
  if (isSubagentSession(input)) return {};
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
