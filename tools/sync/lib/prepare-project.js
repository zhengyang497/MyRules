const path = require('node:path');
const gitignoreLib = require('./gitignore');
const legacy = require('./legacy');
const projectSkill = require('./project-skill');
const state = require('./state');

function prepareProject(projectRoot, cacheDir, manifest) {
  if (!projectSkill.isProjectSkillInstalled(projectRoot, manifest)) {
    throw new Error(
      'MyRules skill is not installed in this project. Import it from GitHub first ' +
        `(run install-skill.js, or ask the Agent to install MyRules from ${manifest.repo}).`
    );
  }

  if (manifest.deploy.gitignoreDeployArtifacts) {
    gitignoreLib.ensureGitignore(projectRoot, manifest);
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
