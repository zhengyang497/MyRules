const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const transform = require('./transform');
const drift = require('./drift');
const loadManifest = require('./load-manifest');

function listMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
}

function collectUserBodies(cacheDir) {
  const dir = path.join(cacheDir, 'rules', 'user');
  return listMdFiles(dir).map((f) => {
    const filePath = path.join(dir, f);
    const body = transform.stripRuleFrontmatter(fs.readFileSync(filePath, 'utf8'));
    return { topic: path.basename(f, '.md'), body };
  });
}

function scanProjectMissingAgents(cacheDir) {
  const dir = path.join(cacheDir, 'rules', 'project');
  const missing = [];
  for (const f of listMdFiles(dir)) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    const { agents } = transform.parseRuleFrontmatter(content);
    if (agents === null) missing.push(f);
  }
  return missing;
}

function collectProjectBodiesForRole(cacheDir, roleId) {
  const dir = path.join(cacheDir, 'rules', 'project');
  const bodies = [];
  for (const f of listMdFiles(dir)) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    const { agents, body } = transform.parseRuleFrontmatter(content);
    if (agents === null) continue;
    if (transform.roleMatchesAgents(agents, roleId)) {
      bodies.push({ topic: path.basename(f, '.md'), body });
    }
  }
  return bodies;
}

function staleAgentCleanup(agentsDir, prefix, currentRoleIds, ext) {
  const removed = [];
  if (!fs.existsSync(agentsDir)) return removed;
  const expected = new Set(currentRoleIds.map((r) => `${prefix}${r}${ext}`));
  for (const f of fs.readdirSync(agentsDir)) {
    if (!f.startsWith(prefix) || !f.endsWith(ext)) continue;
    if (expected.has(f)) continue;
    const filePath = path.join(agentsDir, f);
    fs.unlinkSync(filePath);
    removed.push(filePath);
  }
  return removed;
}

function deployAgents(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const agentsConfig = manifest.agents;
  if (!agentsConfig?.roles) {
    return { hashes: {}, drifted: [], staleRemoved: [], missingAgents: [], roleIds: [] };
  }
  const prefix = agentsConfig.prefix;
  const force = opts.force || false;
  const priorHashes = opts.priorAgentHashes || {};
  const roleIds = Object.keys(agentsConfig.roles);
  const userBodies = collectUserBodies(cacheDir);

  const cursorDir = paths.getCursorAgentsDir(projectRoot);
  const claudeDir = paths.getClaudeAgentsDir(projectRoot);
  fs.mkdirSync(cursorDir, { recursive: true });
  fs.mkdirSync(claudeDir, { recursive: true });

  const tracker = drift.createTracker({ force, priorHashes });
  const missingAgents = scanProjectMissingAgents(cacheDir);

  for (const roleId of roleIds) {
    const roleMeta = agentsConfig.roles[roleId];
    const agentName = `${prefix}${roleId}`;
    const projectBodies = collectProjectBodiesForRole(cacheDir, roleId);

    const cursorFile = `${agentName}.md`;
    const cursorTarget = path.join(cursorDir, cursorFile);
    const cursorStateKey = path.posix.join(agentsConfig.cursorDir, cursorFile);
    tracker.writeTracked(
      cursorTarget,
      transform.transformForAgent({
        roleMeta,
        roleId,
        agentName,
        userBodies,
        projectBodies,
        platform: 'cursor',
      }),
      cursorStateKey
    );

    const claudeFile = `${agentName}.md`;
    const claudeTarget = path.join(claudeDir, claudeFile);
    const claudeStateKey = path.posix.join(agentsConfig.claudeDir, claudeFile);
    tracker.writeTracked(
      claudeTarget,
      transform.transformForAgent({
        roleMeta,
        roleId,
        agentName,
        userBodies,
        projectBodies,
        platform: 'claude',
      }),
      claudeStateKey
    );
  }

  const staleRemoved = [
    ...staleAgentCleanup(cursorDir, prefix, roleIds, '.md'),
    ...staleAgentCleanup(claudeDir, prefix, roleIds, '.md'),
  ];

  for (const key of Object.keys(priorHashes)) {
    if (key in tracker.hashes) continue;
    const filePath = key.startsWith(agentsConfig.claudeDir)
      ? path.join(projectRoot, key)
      : path.join(projectRoot, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      staleRemoved.push(filePath);
    }
  }

  return {
    hashes: tracker.hashes,
    drifted: tracker.drifted,
    staleRemoved,
    missingAgents,
    roleIds,
  };
}

module.exports = {
  deployAgents,
  collectUserBodies,
  collectProjectBodiesForRole,
  scanProjectMissingAgents,
  staleAgentCleanup,
};
