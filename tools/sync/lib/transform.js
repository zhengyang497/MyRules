// tools/sync/lib/transform.js

const RULE_FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

function parseAgentsList(yamlBlock) {
  const match = yamlBlock.match(/^agents:\s*(.+)$/m);
  if (!match) return null;
  const raw = match[1].trim();
  if (raw === 'all' || raw === '"all"' || raw === "'all'") return 'all';
  const listMatch = raw.match(/^\[(.*)\]$/);
  if (!listMatch) return null;
  return listMatch[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function parseRuleFrontmatter(content) {
  const match = content.match(RULE_FRONTMATTER_RE);
  if (!match) {
    return { agents: null, body: content };
  }
  const agents = parseAgentsList(match[1]);
  return { agents, body: match[2].trimStart() };
}

function stripRuleFrontmatter(content) {
  return parseRuleFrontmatter(content).body;
}

function roleMatchesAgents(agents, roleId) {
  if (agents === null) return false;
  if (agents === 'all') return true;
  return Array.isArray(agents) && agents.includes(roleId);
}

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

function composeAgentBody(userBodies, projectBodies) {
  const sections = [];
  for (const { topic, body } of userBodies) {
    sections.push(`## user: ${topic}\n\n${body.trim()}`);
  }
  for (const { topic, body } of projectBodies) {
    sections.push(`## project: ${topic}\n\n${body.trim()}`);
  }
  return sections.join('\n\n');
}

function yamlLine(key, value) {
  if (typeof value === 'boolean') return `${key}: ${value}`;
  if (typeof value === 'string') return `${key}: "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return `${key}: ${value}`;
}

function transformForAgent({ roleMeta, roleId, agentName, userBodies, projectBodies, platform }) {
  const body = composeAgentBody(userBodies, projectBodies);
  const lines = [
    '---',
    yamlLine('name', agentName),
    yamlLine('description', roleMeta.description),
    yamlLine('model', roleMeta.model || 'inherit'),
  ];

  if (platform === 'cursor') {
    lines.push(yamlLine('readonly', roleMeta.readonly === true));
  } else if (platform === 'claude') {
    const permissionMode = roleMeta.readonly ? 'plan' : 'default';
    lines.push(yamlLine('permissionMode', permissionMode));
  }

  lines.push('---', '', body);
  return lines.join('\n');
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

module.exports = {
  transformForCursor,
  transformForClaude,
  stripCursorFrontmatter,
  transformHookForClaude,
  parseRuleFrontmatter,
  stripRuleFrontmatter,
  roleMatchesAgents,
  transformForAgent,
  composeAgentBody,
};
