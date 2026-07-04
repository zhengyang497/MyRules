const fs = require('node:fs');
const path = require('node:path');
const fsutil = require('./fsutil');

function getDefaults(manifest) {
  const bootstrap = manifest.bootstrap || {};
  const skillSource = bootstrap.skillSource || 'skills/myrules/SKILL.md';
  return {
    skillSource,
    skillDir: bootstrap.skillDir || path.dirname(skillSource),
    cursorSkillDir: bootstrap.cursor?.skillDir || '.cursor/skills/myrules',
    claudeSkillDir: bootstrap.claude?.skillDir || '.claude/skills/myrules',
    overwriteSkill: bootstrap.overwriteSkill || 'if_changed',
  };
}

function listSkillMdFiles(skillDirPath) {
  if (!fs.existsSync(skillDirPath)) return [];
  return fs
    .readdirSync(skillDirPath)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(skillDirPath, name))
    .sort();
}

function destinationSkillDirs(projectRoot, manifest) {
  const cfg = getDefaults(manifest);
  const platforms = manifest.platforms || ['cursor', 'claude'];
  const dirs = [];

  if (platforms.includes('cursor')) {
    dirs.push(path.join(projectRoot, cfg.cursorSkillDir));
  }
  if (platforms.includes('claude')) {
    dirs.push(path.join(projectRoot, cfg.claudeSkillDir));
  }
  return dirs;
}

function destinationPaths(projectRoot, manifest) {
  const cfg = getDefaults(manifest);
  return destinationSkillDirs(projectRoot, manifest).map((dir) => ({
    path: path.join(dir, 'SKILL.md'),
  }));
}

function copyOneSkillFile(sourceFile, destFile, overwriteSkill, result) {
  const sourceContent = fs.readFileSync(sourceFile, 'utf8');
  const sourceHash = fsutil.hashContent(sourceContent);

  if (fs.existsSync(destFile)) {
    const destHash = fsutil.hashContent(fs.readFileSync(destFile, 'utf8'));
    if (overwriteSkill === 'never_if_exists') {
      result.skipped.push(destFile);
      return;
    }
    if (overwriteSkill === 'if_changed' && destHash === sourceHash) {
      result.skipped.push(destFile);
      return;
    }
    fsutil.ensureDir(path.dirname(destFile));
    fs.writeFileSync(destFile, sourceContent);
    result.updated.push(destFile);
    return;
  }

  fsutil.ensureDir(path.dirname(destFile));
  fs.writeFileSync(destFile, sourceContent);
  result.installed.push(destFile);
}

function copySkillDir(sourceDir, projectRoot, manifest) {
  const cfg = getDefaults(manifest);
  const skillDirPath = path.join(sourceDir, cfg.skillDir);
  const sourceFiles = listSkillMdFiles(skillDirPath);

  if (!sourceFiles.length) {
    throw new Error(`MyRules skill directory missing or empty: ${skillDirPath}`);
  }

  const skillMd = path.join(skillDirPath, 'SKILL.md');
  if (!sourceFiles.includes(skillMd)) {
    throw new Error(`MyRules skill source missing in cache: ${skillMd}`);
  }

  const result = { installed: [], updated: [], skipped: [] };
  const destDirs = destinationSkillDirs(projectRoot, manifest);

  for (const destDir of destDirs) {
    for (const sourceFile of sourceFiles) {
      const rel = path.relative(skillDirPath, sourceFile);
      const destFile = path.join(destDir, rel);
      copyOneSkillFile(sourceFile, destFile, cfg.overwriteSkill, result);
    }
  }

  return result;
}

function ensureProjectSkill(projectRoot, cacheDir, manifest) {
  return copySkillDir(cacheDir, projectRoot, manifest);
}

function isProjectSkillInstalled(projectRoot, manifest) {
  const dests = destinationPaths(projectRoot, manifest);
  return dests.length > 0 && dests.every((d) => fs.existsSync(d.path));
}

function logSkillInstallResult(result, manifest) {
  if (result.installed.length) {
    console.log(`Installed MyRules skill (${result.installed.length}):`);
    result.installed.forEach((p) => console.log(`  ${p}`));
    if (manifest.bootstrap?.commitSkillToGit !== false) {
      console.log('Commit .cursor/skills/myrules/ (and .claude/skills/myrules/ if present) to git.');
    }
  }
  if (result.updated.length) {
    console.log(`Updated MyRules skill (${result.updated.length}):`);
    result.updated.forEach((p) => console.log(`  ${p}`));
  }
}

module.exports = {
  ensureProjectSkill,
  copySkillDir,
  listSkillMdFiles,
  destinationPaths,
  destinationSkillDirs,
  getDefaults,
  isProjectSkillInstalled,
  logSkillInstallResult,
};
