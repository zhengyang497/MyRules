const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const fsutil = require('./fsutil');

function readRegistry(homeDir) {
  const file = paths.getRegistryFilePath(homeDir);
  if (!fs.existsSync(file)) return { projects: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function registerProject(projectRoot, homeDir) {
  const file = paths.getRegistryFilePath(homeDir);
  const reg = readRegistry(homeDir);
  if (!reg.projects.includes(projectRoot)) {
    reg.projects.push(projectRoot);
    fsutil.ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(reg, null, 2) + '\n');
  }
  return reg;
}

function listRegisteredProjects(homeDir) {
  return readRegistry(homeDir).projects.filter((p) => fs.existsSync(p));
}

module.exports = { readRegistry, registerProject, listRegisteredProjects };
