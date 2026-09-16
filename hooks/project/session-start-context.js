// hooks/project/session-start-context.js
//
// Cursor sessionStart input is roughly:
//   { session_id, is_background_agent, composer_mode }
// composer_mode for a main session is agent | ask | edit. Main sessions also have session_id.
// Cloud Agents are independent sessions with is_background_agent: true; they are not Task
// subagents and usually never hit subagentStart. Inject published purpose into those sessions.
//
// Skip injecting .myrules-context.md only for nested Task-style subagents (parent ids,
// is_subagent, session_type/composer_mode subagent|task). Do not skip merely because
// agent_id, session_id, or is_background_agent is present.
// Goal-book protection is role files + named dispatch, not skipping cloud sessionStart.

const fs = require('node:fs');
const path = require('node:path');

module.exports.meta = {
  event: 'sessionStart',
  description:
    'At the start of a main or cloud session in this project, if .myrules-context.md exists ' +
    'at the project root, read it and inject its content as additional context. ' +
    'Skip nested Task subagents so workers do not treat purpose text as a goal rewrite.',
};

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSubagentSession(input = {}) {
  if (!input || typeof input !== 'object') return false;
  if (input.is_subagent === true || input.subagent === true) return true;
  if (nonEmptyString(input.parent_session_id) || nonEmptyString(input.parent_conversation_id)) return true;
  if (input.session_type === 'subagent') return true;
  if (input.composer_mode === 'subagent' || input.composer_mode === 'task') return true;
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
