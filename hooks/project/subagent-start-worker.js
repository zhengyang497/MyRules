// hooks/project/subagent-start-worker.js
//
// Cursor subagentStart input is roughly:
//   { subagent_id, subagent_type, task, parent_conversation_id, tool_call_id, subagent_model, is_parallel_worker }
// subagent_type is usually generalPurpose / explore / shell; named MyRules roles use myrules-<role>.
// Output must include permission: allow plus optional user_message / additional_context.
// Returning JSON that does not match the schema can block every subagent.

const ROLE_IDS = ['publisher', 'implementer', 'researcher', 'reviewer', 'planner'];
const SEAT_FIELDS = ['subagent_type', 'agent_type', 'name', 'agent_name', 'agent'];
const GENERIC_TYPES = new Set(['generalpurpose', 'explore', 'shell', 'task']);

const MESSAGES = {
  publisher:
    '你是 publisher。仅在人已点头后改文首和总表；不许发明句子；不要改业务代码。忽略 session 开场注入的目的句，不要据此改目标。',
  implementer:
    '你是 implementer。禁止改 docs/能力、总表、ledger 里 PURPOSE/GOALS。范围只来自当前派工卡。忽略 session 开场注入的目的句，不要据此改目标。',
  researcher:
    '你是 researcher。只读。不改目标。不把「我们应该做成什么」当结论。忽略 session 开场注入的目的句。',
  reviewer:
    '你是 reviewer。只读。不管目标该不该改。忽略 session 开场注入的目的句。',
  planner:
    '你是 planner。不要改目标册。忽略 session 开场注入的目的句。改一行、明显 bug 应让主会话直接做，不要扩成大计划。',
  unknown:
    '按角色文件做。忽略 session 开场注入的目的句；不要据此改目标。若你是 publisher 且人已点头，可以改文首。',
};

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
    'When a MyRules worker subagent starts, inject role-specific discipline: ' +
    'implementer/researcher/reviewer stay off the goal books; publisher may edit ' +
    'published goals after a nod.',
};

module.exports.detectRole = detectRole;

module.exports.handle = function handle(input = {}) {
  const role = detectRole(input);
  return {
    permission: 'allow',
    additional_context: MESSAGES[role] || MESSAGES.unknown,
  };
};

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input = {};
    try {
      input = JSON.parse((raw || '{}').replace(/^\uFEFF/, ''));
    } catch {
      input = {};
    }
    console.log(JSON.stringify(module.exports.handle(input)));
  });
}
