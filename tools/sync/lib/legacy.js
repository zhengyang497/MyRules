const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const paths = require('./paths');

function walkAll(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkAll(full));
    else out.push(full);
  }
  return out;
}

function scanLegacy(projectRoot, managedPrefix, manifest = {}) {
  const cursorExt = manifest.cursor?.extension || '.mdc';
  const claudeExt = manifest.claude?.extension || '.md';
  const found = [];

  const cursorDir = paths.getCursorRulesDir(projectRoot);
  if (fs.existsSync(cursorDir)) {
    for (const f of fs.readdirSync(cursorDir)) {
      const full = path.join(cursorDir, f);
      if (fs.statSync(full).isFile() && f.endsWith(cursorExt) && !f.startsWith(managedPrefix)) {
        found.push(full);
      }
    }
    const importedDir = path.join(cursorDir, 'imported');
    if (fs.existsSync(importedDir)) {
      found.push(...walkAll(importedDir));
    }
  }

  const claudeDir = paths.getClaudeProjectRulesDir(projectRoot);
  if (fs.existsSync(claudeDir)) {
    for (const f of fs.readdirSync(claudeDir)) {
      const full = path.join(claudeDir, f);
      if (fs.statSync(full).isFile() && f.endsWith(claudeExt) && !f.startsWith(managedPrefix)) {
        found.push(full);
      }
    }
  }

  const legacyCursorrules = path.join(projectRoot, '.cursorrules');
  if (fs.existsSync(legacyCursorrules)) found.push(legacyCursorrules);

  return found.sort();
}

function fingerprint(files) {
  return crypto.createHash('sha256').update([...files].sort().join('\n')).digest('hex');
}

function pruneLegacy(projectRoot, files, backupDirName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(projectRoot, backupDirName, timestamp);
  for (const file of files) {
    const rel = path.relative(projectRoot, file);
    const dest = path.join(backupRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(file, dest);
  }
  return backupRoot;
}

module.exports = { scanLegacy, fingerprint, pruneLegacy };
