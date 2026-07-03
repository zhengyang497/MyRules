const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const registry = require('../tools/sync/lib/registry');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-home-'));
}

test('registerProject creates the registry and adds the project', () => {
  const home = tmpHome();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-'));
  registry.registerProject(project, home);
  const list = registry.listRegisteredProjects(home);
  assert.ok(list.includes(project));
});

test('registerProject does not add duplicates', () => {
  const home = tmpHome();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-'));
  registry.registerProject(project, home);
  registry.registerProject(project, home);
  const list = registry.listRegisteredProjects(home);
  assert.strictEqual(list.filter((p) => p === project).length, 1);
});

test('listRegisteredProjects filters out projects that no longer exist on disk', () => {
  const home = tmpHome();
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'myrules-proj-'));
  registry.registerProject(project, home);
  fs.rmSync(project, { recursive: true, force: true });
  const list = registry.listRegisteredProjects(home);
  assert.ok(!list.includes(project));
});
