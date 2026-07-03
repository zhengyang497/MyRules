const fs = require('node:fs');
const path = require('node:path');
const fsutil = require('./fsutil');

function getDefaults(manifest) {
  const bootstrap = manifest.bootstrap || {};
  return {
    skillSource: bootstrap.skillSource || 'skills/myrules/SKILL.md',
    cursorSkillDir: bootstrap.cursor?.skillDir || '.cursor/skills/myrules',
    claudeSkillDir: bootstrap.claude?.skillDir || '.claude/skills/myrules',
    overwriteSkill: bootstrap.overwriteSkill || 'if_changed',
  };
}

function destinationPaths(projectRoot, manifest) {
  const cfg = getDefaults(manifest);
  const platforms = manifest.platforms || ['cursor', 'claude'];
  const dests = [];

  if (platforms.includes('cursor')) {
    dests.push({
      platform: 'cursor',
      path: path.join(projectRoot, cfg.cursorSkillDir, 'SKILL.md'),
    });
  }
  if (platforms.includes('claude')) {
    dests.push({
      platform: 'claude',
      path: path.join(projectRoot, cfg.claudeSkillDir, 'SKILL.md'),
    });
  }
  return dests;
}

function ensureProjectSkill(projectRoot, cacheDir, manifest) {
  const cfg = getDefaults(manifest);
  const sourceFile = path.join(cacheDir, cfg.skillSource);

  if (!fs.existsSync(sourceFile)) {
    throw new Error(`MyRules skill source missing in cache: ${sourceFile}`);
  }

  const sourceContent = fs.readFileSync(sourceFile, 'utf8');
  const sourceHash = fsutil.hashContent(sourceContent);
  const result = { installed: [], updated: [], skipped: [] };

  for (const { platform, path: destFile } of destinationPaths(projectRoot, manifest)) {
    if (fs.existsSync(destFile)) {
      const destHash = fsutil.hashContent(fs.readFileSync(destFile, 'utf8'));
      if (cfg.overwriteSkill === 'never_if_exists') {
        result.skipped.push(destFile);
        continue;
      }
      if (cfg.overwriteSkill === 'if_changed' && destHash === sourceHash) {
        result.skipped.push(destFile);
        continue;
      }
      fsutil.ensureDir(path.dirname(destFile));
      fs.writeFileSync(destFile, sourceContent);
      result.updated.push(destFile);
      continue;
    }

    fsutil.ensureDir(path.dirname(destFile));
    fs.writeFileSync(destFile, sourceContent);
    result.installed.push(destFile);
  }

  return result;
}

module.exports = { ensureProjectSkill, destinationPaths, getDefaults };
