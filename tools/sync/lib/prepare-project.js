const path = require('node:path');
const gitignoreLib = require('./gitignore');
const legacy = require('./legacy');
const projectSkill = require('./project-skill');
const state = require('./state');

function prepareProject(projectRoot, cacheDir, manifest, opts = {}) {
  // 与 sync.js 同一门禁：完全未安装才拒绝；老项目缺新平台目标（如 .dsh/skills）放行
  if (!projectSkill.isProjectSkillInstalled(projectRoot, manifest) && !projectSkill.isLegacySkillInstalled(projectRoot, manifest)) {
    throw new Error(
      'MyRules skill is not installed in this project. Import it from GitHub first ' +
        `(run install-skill.js, or ask the Agent to install MyRules from ${manifest.repo}).`
    );
  }

  if (manifest.deploy.gitignoreDeployArtifacts) {
    gitignoreLib.ensureGitignore(projectRoot, manifest, opts.runtime || 'agent');
  }

  const legacyFiles = legacy.scanLegacy(projectRoot, manifest.managedPrefix, manifest);
  const current = state.readState(projectRoot);
  if (!current.lastSyncAt && legacyFiles.length) {
    console.log(`Detected ${legacyFiles.length} legacy rule file(s) not managed by MyRules:`);
    legacyFiles.forEach((f) => console.log(`  ${f}`));
    console.log('\nThese are left in place. To make MyRules the primary source, run:');
    console.log(
      `  node "${path.join(cacheDir, 'tools', 'sync', 'sync.js')}" --dry-run --prune-legacy-rules --project "${projectRoot}"`
    );
  }
}

module.exports = { prepareProject };
