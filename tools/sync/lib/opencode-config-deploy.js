const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const loadManifest = require('./load-manifest');

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${file} as JSON: ${err.message}`);
  }
}

function mergeInstructions(existing, previousEntries, currentEntries) {
  const doc = existing && typeof existing === 'object' ? { ...existing } : {};
  const existingInstructions = Array.isArray(doc.instructions) ? [...doc.instructions] : [];

  const priorSet = new Set(previousEntries || []);
  let kept;
  if (priorSet.size > 0) {
    kept = existingInstructions.filter((s) => !priorSet.has(s));
  } else {
    kept = existingInstructions.filter((s) => typeof s !== 'string' || !s.includes('myrules-'));
  }

  for (const entry of currentEntries || []) {
    if (!kept.includes(entry)) kept.push(entry);
  }

  if (kept.length > 0) {
    doc.instructions = kept;
  } else {
    delete doc.instructions;
  }
  return doc;
}

function deployConfigFile(configFile, currentEntries, priorEntries) {
  const existed = fs.existsSync(configFile);
  const existing = readJsonIfExists(configFile);
  const merged = mergeInstructions(existing, priorEntries, currentEntries);

  // Idempotency: skip write if nothing changed
  if (existed && existing) {
    const beforeInstructions = Array.isArray(existing.instructions) ? existing.instructions : [];
    const afterInstructions = Array.isArray(merged.instructions) ? merged.instructions : [];
    if (JSON.stringify(beforeInstructions) === JSON.stringify(afterInstructions)) {
      return { instructions: afterInstructions, wrote: false };
    }
  }

  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(merged, null, 2) + '\n');
  return { instructions: Array.isArray(merged.instructions) ? merged.instructions : [], wrote: true };
}

function deployProjectConfig(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const configFile = opts.configFile || paths.getOpencodeProjectConfigFile(projectRoot);
  const current = [manifest.opencode.projectInstructionsGlob];
  return deployConfigFile(configFile, current, opts.priorEntries || []);
}

function deployUserConfig(cacheDir, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const homeDir = opts.homeDir || require('node:os').homedir();
  const configFile = opts.configFile || paths.getOpencodeUserConfigFile(homeDir);
  const current = [manifest.opencode.userInstructionsGlob];
  return deployConfigFile(configFile, current, opts.priorEntries || []);
}

module.exports = { mergeInstructions, deployProjectConfig, deployUserConfig };
