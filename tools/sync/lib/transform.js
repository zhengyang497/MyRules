// tools/sync/lib/transform.js

const RULE_FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

function parseYamlListField(yamlBlock, key) {
  const match = yamlBlock.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
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
    return { agents: null, runtimes: null, body: content };
  }
  const agents = parseYamlListField(match[1], 'agents');
  const runtimes = parseYamlListField(match[1], 'runtimes');
  return { agents, runtimes, body: match[2].trimStart() };
}

function stripRuleFrontmatter(content) {
  return parseRuleFrontmatter(content).body;
}

function roleMatchesAgents(agents, roleId) {
  if (agents === null) return false;
  if (agents === 'all') return true;
  return Array.isArray(agents) && agents.includes(roleId);
}

function runtimeMatches(runtimes, runtime) {
  if (runtimes === null || runtimes === 'all') return true;
  return Array.isArray(runtimes) && runtimes.includes(runtime);
}

function transformForCursor(body, topic) {
  return `---\ndescription: "MyRules: ${topic}"\nalwaysApply: true\n---\n\n${body}`;
}

function transformForClaude(body) {
  return body;
}

function transformForOpencode(body) {
  return body;
}

function transformForDsh(body) {
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

// Cursor 的 agent 加载器会把引号当成值的一部分（官方已知 bug，去引号是官方 workaround，
// 影响 name/model 的解析），cursor 平台头栏一律出裸值；claude/opencode 解析正常，照旧带引号。
// 去引号后 plain scalar 里不能再出现 ": "（YAML 会当映射键），按手改惯例把 ": " 折成 " - "。
function yamlPlainLine(key, value) {
  if (typeof value === 'boolean') return `${key}: ${value}`;
  if (typeof value === 'string') return `${key}: ${value.replace(/\r?\n/g, ' ').replace(/: /g, ' - ')}`;
  return `${key}: ${value}`;
}

function transformForAgent({ roleMeta, roleId, agentName, userBodies, projectBodies, platform }) {
  const body = composeAgentBody(userBodies, projectBodies);
  const lines = ['---'];

  if (platform === 'cursor') {
    lines.push(yamlPlainLine('name', agentName));
    lines.push(yamlPlainLine('description', roleMeta.description));
    lines.push(yamlPlainLine('model', roleMeta.model || 'inherit'));
    lines.push(yamlPlainLine('readonly', roleMeta.readonly === true));
  } else if (platform === 'claude') {
    lines.push(yamlLine('name', agentName));
    lines.push(yamlLine('description', roleMeta.description));
    lines.push(yamlLine('model', roleMeta.model || 'inherit'));
    const permissionMode = roleMeta.readonly ? 'plan' : 'default';
    lines.push(yamlLine('permissionMode', permissionMode));
  } else if (platform === 'opencode') {
    lines.push(yamlLine('description', roleMeta.description));
    lines.push('mode: subagent');
    if (roleMeta.readonly) {
      lines.push('permission:');
      lines.push('  edit: deny');
      lines.push('  bash: deny');
    }
  } else if (platform === 'dsh') {
    // dsh 角色文件：frontmatter 供 patch 生成器/组队规则读取，正文即 persona 来源
    lines.push(yamlLine('name', agentName));
    lines.push(yamlLine('description', roleMeta.description));
    lines.push(`readonly: ${roleMeta.readonly === true}`);
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
  transformForOpencode,
  transformForDsh,
  stripCursorFrontmatter,
  transformHookForClaude,
  parseRuleFrontmatter,
  stripRuleFrontmatter,
  roleMatchesAgents,
  runtimeMatches,
  transformForAgent,
  composeAgentBody,
};
