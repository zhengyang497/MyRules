const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const fsutil = require('./fsutil');

function normalizeEntry(entry) {
  if (typeof entry === 'string') return { path: entry, runtime: 'agent' };
  if (entry && typeof entry === 'object' && typeof entry.path === 'string') {
    return { path: entry.path, runtime: entry.runtime === 'project' ? 'project' : 'agent' };
  }
  return null;
}

function readRegistry(homeDir) {
  const file = paths.getRegistryFilePath(homeDir);
  if (!fs.existsSync(file)) return { projects: [] };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const projects = (raw.projects || []).map(normalizeEntry).filter(Boolean);
  return { projects };
}

function writeRegistry(homeDir, reg) {
  const file = paths.getRegistryFilePath(homeDir);
  fsutil.ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify({ projects: reg.projects }, null, 2) + '\n');
}

function registerProject(projectRoot, homeDir, runtime) {
  const file = paths.getRegistryFilePath(homeDir);
  const reg = readRegistry(homeDir);
  const existing = reg.projects.find((p) => p.path === projectRoot);
  const rt = runtime === 'project' ? 'project' : runtime === 'agent' ? 'agent' : null;
  if (existing) {
    if (rt && existing.runtime !== rt) {
      existing.runtime = rt;
      writeRegistry(homeDir, reg);
    }
    return reg;
  }
  reg.projects.push({ path: projectRoot, runtime: rt || 'agent' });
  fsutil.ensureDir(path.dirname(file));
  writeRegistry(homeDir, reg);
  return reg;
}

function findRuntime(homeDir, projectRoot) {
  const entry = readRegistry(homeDir).projects.find((p) => p.path === projectRoot);
  return entry ? entry.runtime : null;
}

function listRegisteredProjectEntries(homeDir) {
  return readRegistry(homeDir).projects.filter((p) => fs.existsSync(p.path));
}

function listRegisteredProjects(homeDir) {
  return listRegisteredProjectEntries(homeDir).map((p) => p.path);
}

module.exports = {
  readRegistry,
  registerProject,
  listRegisteredProjects,
  listRegisteredProjectEntries,
  findRuntime,
};
