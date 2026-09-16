// hooks/project/subagent-start-worker.js
//
// This hook only allows the subagent to start.
// Cursor subagentStart official output is permission (allow | deny) and
// optional user_message on deny. There is no additional_context.
// Role discipline lives in .cursor/agents/myrules-*.md and rules/project/*.

module.exports.meta = {
  event: 'subagentStart',
  description:
    'Allow MyRules worker subagents to start. Role discipline is in agent files ' +
    'and project role rules, not hook output.',
};

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
