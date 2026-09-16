// hooks/project/subagent-start-worker.js
module.exports.meta = {
  event: 'subagentStart',
  description:
    'When a MyRules worker subagent starts, remind it that it is a worker: ' +
    'do not change goals; stay inside the current dispatch card.',
};

module.exports.handle = function handle() {
  return {
    additional_context:
      '你是工人，不是经理。禁止改目标册（docs/能力、总表、ledger 里的 PURPOSE/GOALS）。范围只来自当前派工卡。',
  };
};

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      JSON.parse(raw || '{}');
    } catch {
      /* ignore */
    }
    console.log(JSON.stringify(module.exports.handle()));
  });
}
