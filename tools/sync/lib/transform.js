// tools/sync/lib/transform.js
function transformForCursor(body, topic) {
  return `---\ndescription: "MyRules: ${topic}"\nalwaysApply: true\n---\n\n${body}`;
}

function transformForClaude(body) {
  return body;
}

function stripCursorFrontmatter(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)$/);
  return match ? match[1] : content;
}

function transformHookForClaude(meta, name) {
  return (
    `## Hook: ${name}\n\n` +
    `**Trigger (Cursor event):** ${meta.event}\n\n` +
    `**Convention:** ${meta.description}\n\n` +
    '(This is a MyRules hook convention. Claude has no automatic trigger for this — ' +
    'perform this action manually at the described moment.)\n'
  );
}

module.exports = { transformForCursor, transformForClaude, stripCursorFrontmatter, transformHookForClaude };
