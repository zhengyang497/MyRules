// tools/sync/lib/dsh-roles-deploy.js
//
// dsh 没有 .claude/agents/ 式的文件定义子代理；角色包的原生归宿是
// 「命名委派工具」（@deepseek-ai/dsh-tool-subagent，一实例一 toolName，
// persona=角色人格、toolFilter=只读强制、maxDepth=禁再派）。
//
// 本模块产出三样东西：
// 1. AGENTS.md 管理块的两个附加小节（角色工具表 / 组队规则）——让模型知道
//    何时、如何召唤角色（stock subagent / spawn_teammate 均要求先读角色文件）。
// 2. `.dsh/roles-tool-rows.yml` 脚手架——dsh-tool-subagent 配置行，供用户
//    显式装配进 profile 的 cordis.patch.yml。MyRules 不自动改写用户 profile：
//    引用未安装的包会让 Loader 失败，违反「不破坏现有配置」的约束。
const path = require('node:path');
const fs = require('node:fs');
const paths = require('./paths');
const loadManifest = require('./load-manifest');
const deployAgents = require('./deploy-agents');

function toolNameForRole(prefix, roleId) {
  // 对照 dsh 现有工具命名（subagent_fork）取 snake 形态最稳
  return `subagent_${String(roleId).replace(/-/g, '_')}`;
}

function personaForRole(agentName, roleMeta, roleId) {
  const discipline = deployAgents.workerFooterForRole(roleId).trim();
  return [
    `你是 ${agentName}。`,
    roleMeta.description,
    '',
    discipline,
    '',
    `完整角色正文（含按角色过滤的规则分节）在 .dsh/agents/${agentName}.md；任务附后。`,
  ].join('\n');
}

/**
 * 生成 dsh-tool-subagent 配置行脚手架（YAML 文本）。刻意不生成 toolFilter 实体：
 * deny 清单里的工具名必须在目标部署真实存在（tools.restrict 对未知名 fail loud，
 * Windows shell 工具叫 pwsh、别处叫 bash），由装配者按部署核对后取消注释。
 */
function buildRoleToolRowsYaml({ agentPrefix, roles }) {
  const lines = [
    '# MyRules generated scaffold — NOT loaded by anything as-is.',
    '# One named delegation tool per role for dsh (@deepseek-ai/dsh-tool-subagent).',
    '# HOWTO: append these rows to $DSH_HOME/profiles/<profile>/cordis.patch.yml once the',
    '# @deepseek-ai/dsh-tool-subagent package is available in that profile, then verify the',
    '# profile loads. MyRules never edits profiles automatically.',
    '# NOTE: toolFilter names must exist in the deployment (unknown names fail loud);',
    '# uncomment and adjust the deny list (Windows shell tool is `pwsh`, elsewhere `bash`).',
    '# NOTE: if persona text ever contains `{{`, escape it (Loader interpolation).',
  ];
  for (const [roleId, roleMeta] of Object.entries(roles)) {
    const agentName = `${agentPrefix}${roleId}`;
    lines.push('');
    lines.push(`- name: '@deepseek-ai/dsh-tool-subagent'`);
    lines.push('  config:');
    lines.push('    provider: spawn');
    lines.push(`    toolName: ${toolNameForRole(agentPrefix, roleId)}`);
    lines.push('    maxDepth: 1');
    lines.push('    persona: |-');
    for (const personaLine of personaForRole(agentName, roleMeta, roleId).split('\n')) {
      lines.push(`      ${personaLine}`);
    }
    if (roleMeta.readonly) {
      lines.push('    # readonly role — enforce once tool names are verified:');
      lines.push('    # toolFilter:');
      lines.push('    #   deny: [write, edit, pwsh]');
    }
  }
  return lines.join('\n') + '\n';
}

function rolesTableSection({ agentPrefix, roles }) {
  const rows = Object.entries(roles).map(([roleId, roleMeta]) => {
    const agentName = `${agentPrefix}${roleId}`;
    return `| \`${toolNameForRole(agentPrefix, roleId)}\` | \`${agentName}\` | ${roleMeta.description} | ${roleMeta.readonly ? '是' : '否'} |`;
  });
  return [
    'dsh 平台的角色派工一览（本小节由 myrules sync 生成）：',
    '',
    '| 委派工具 | 角色文件 | 用途 | 只读 |',
    '|---|---|---|---|',
    ...rows,
    '',
    '召唤方式（任选其一）：',
    '1. 命名委派工具 `subagent_<role>`（按 `.dsh/roles-tool-rows.yml` 装配进 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 后可用）：按名派工，角色人格自动注入。',
    '2. stock `subagent` / Agent Teams `spawn_teammate`：先 `read` `.dsh/agents/<role-file>`，把正文完整放进 prompt 再附任务。',
  ].join('\n');
}

function teamRulesSection() {
  return [
    '组建 Agent Teams 队友（spawn_teammate）与派出 subagent 的规则（本小节由 myrules sync 生成）：',
    '',
    '1. 建队友或派 subagent 前，必须先 `read` `.dsh/agents/` 下对应角色文件，把其正文完整放入 prompt / teammate prompt；命名沿用角色名（lower-kebab-case，精确匹配，对话内不复用）。',
    '2. fresh 队友的任务书由你按四要素扩写：干什么 / 材料在哪 / 什么算干完 / 不许碰什么。',
    '3. readonly 角色（readonly: true）不派写操作；dsh 队友工具集固定无法硬约束，以角色正文的工人纪律为准。',
    '4. 派工卡登记 team 任务看板（附 writeScopes），交回用 send_message，等待用 wait_agent，不轮询。',
  ].join('\n');
}

function buildExtraSections({ agentPrefix, roles }) {
  const roleIds = Object.keys(roles || {});
  if (roleIds.length === 0) return [];
  return [
    { topic: '角色工具表', body: rolesTableSection({ agentPrefix, roles }) },
    { topic: '组队规则', body: teamRulesSection() },
  ];
}

/**
 * 把脚手架写到 <project>/.dsh/roles-tool-rows.yml（gitignore 的部署产物）。
 * 内容不变则不写；返回 { wrote, file }。
 */
function deployRoleToolRows(projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(opts.cacheDir || paths.getCacheDir());
  // 旧 manifest（缓存落后于代码）没有 dsh 块：优雅跳过
  if (!manifest.dsh) return { wrote: false, file: null };
  const roles = manifest.agents?.roles || {};
  const roleIds = Object.keys(roles).filter((id) =>
    opts.runtime ? (manifest.agents.byRuntime?.[opts.runtime] || []).includes(id) : true
  );
  const filtered = {};
  for (const id of roleIds) filtered[id] = roles[id];
  const rel = manifest.dsh.rolesRowsFile || '.dsh/roles-tool-rows.yml';
  const file = opts.file || path.join(projectRoot, path.normalize(rel));
  const text = buildRoleToolRowsYaml({ agentPrefix: manifest.agents?.prefix || manifest.managedPrefix, roles: filtered });

  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) {
    return { wrote: false, file };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return { wrote: true, file };
}

module.exports = {
  toolNameForRole,
  buildRoleToolRowsYaml,
  buildExtraSections,
  deployRoleToolRows,
  personaForRole,
};
