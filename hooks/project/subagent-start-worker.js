// hooks/project/subagent-start-worker.js
//
// Cursor subagentStart input is roughly:
//   { subagent_id, subagent_type, task, parent_conversation_id, tool_call_id, subagent_model, is_parallel_worker }
// Official output fields are only:
//   permission: allow | deny
//   user_message: shown to the user on deny, not worker context
// There is no additional_context. Returning unofficial fields can fail schema
// validation and block every subagent.
// Role discipline lives in .cursor/agents/myrules-*.md and rules/project/*,
// not in this hook.

const ROLE_IDS = ['publisher', 'implementer', 'researcher', 'reviewer', 'planner'];
const SEAT_FIELDS = ['subagent_type', 'agent_type', 'name', 'agent_name', 'agent'];
const GENERIC_TYPES = new Set(['generalpurpose', 'explore', 'shell', 'task']);

function normalizeSeat(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function roleFromSeatValue(raw) {
  const value = normalizeSeat(raw);
  if (!value) return null;
  for (const id of ROLE_IDS) {
    if (value === `myrules-${id}`) return id;
  }
  for (const id of ROLE_IDS) {
    if (value === id) return id;
  }
  return null;
}

function rolesInTask(task) {
  if (typeof task !== 'string') return [];
  const found = [];
  for (const id of ROLE_IDS) {
    const re = new RegExp(`(^|[^a-z-])myrules-${id}([^a-z-]|$)`, 'i');
    if (re.test(task)) found.push(id);
  }
  return found;
}

function isGenericType(value) {
  const compact = value.replace(/[-_]/g, '');
  return GENERIC_TYPES.has(value) || GENERIC_TYPES.has(compact);
}

function detectRole(input = {}) {
  if (!input || typeof input !== 'object') return 'unknown';

  const named = [];
  const seatValues = [];
  for (const field of SEAT_FIELDS) {
    const raw = input[field];
    if (typeof raw !== 'string') continue;
    const value = normalizeSeat(raw);
    if (!value) continue;
    seatValues.push(value);
    const role = roleFromSeatValue(raw);
    if (role) named.push(role);
  }

  const uniqueNamed = [...new Set(named)];
  if (uniqueNamed.length === 1) return uniqueNamed[0];
  if (uniqueNamed.length > 1) return 'unknown';

  if (seatValues.some(isGenericType)) {
    const found = rolesInTask(input.task);
    if (found.length === 1) return found[0];
  }

  return 'unknown';
}

module.exports.meta = {
  event: 'subagentStart',
  description:
    'Allow MyRules worker subagents to start. Role discipline is in agent files ' +
    'and project role rules, not hook output.',
};

module.exports.detectRole = detectRole;

module.exports.handle = function handle() {
  return { permission: 'allow' };
};

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      JSON.parse((raw || '{}').replace(/^\uFEFF/, ''));
    } catch {
      /* ignore malformed stdin; still allow */
    }
    console.log(JSON.stringify(module.exports.handle()));
  });
}
