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

module.exports = { transformForCursor, transformForClaude, stripCursorFrontmatter };
