// hooks/project/subagent-start-worker.js
const ROLE_IDS = ['publisher', 'implementer', 'researcher', 'reviewer', 'planner'];

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
    '你是 planner。不要改目标册。忽略 session 开场注入的目的句。',
  unknown:
    '按角色文件做。忽略 session 开场注入的目的句；不要据此改目标。若你是 publisher 且人已点头，可以改文首。',
};

function detectRole(input = {}) {
  const hay = JSON.stringify(input).toLowerCase();
  for (const id of ROLE_IDS) {
    if (hay.includes(`myrules-${id}`)) return id;
  }
  for (const id of ROLE_IDS) {
    if (hay.includes(id)) return id;
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
  return { additional_context: MESSAGES[role] || MESSAGES.unknown };
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
