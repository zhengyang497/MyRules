const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { REPO_ROOT } = require('./helpers/cache-seed');
const initCli = require('../tools/sync/init-project-method');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function seedTemplate(dir) {
  write(path.join(dir, 'docs', '方法', '项目工作法.md'), '# 项目工作法\n\ntemplate body\n');
  write(path.join(dir, 'docs', '设计目标检查清单.md'), '# 设计目标检查清单\n');
  write(path.join(dir, 'docs', '能力', '.gitkeep'), '');
  write(path.join(dir, 'docs', '看板', 'items', '.gitkeep'), '');
  write(path.join(dir, 'scripts', 'board.mjs'), '// board\n');
  write(path.join(dir, 'scripts', 'board-io.mjs'), '// io\n');
  write(path.join(dir, 'scripts', 'board-server.mjs'), '// server\n');
  write(path.join(dir, '.cursor', 'rules', '项目工作法.mdc'), '# 项目工作法\n');
  write(path.join(dir, '.cursor', 'skills', 'project-method', 'SKILL.md'), '# skill\n');
  write(path.join(dir, '.claude', 'rules', '项目工作法.md'), '# 项目工作法\n');
  write(path.join(dir, '.claude', 'skills', 'project-method', 'SKILL.md'), '# skill\n');
  write(path.join(dir, '.myrules-context.md'), '# 项目上下文\n\n当前目的：（用一句话写本项目现在要做成的事。）\n');
  return dir;
}

test('init-project-method refuses when 项目工作法.md already exists', () => {
  const template = seedTemplate(tmp('pm-template-'));
  const project = tmp('pm-project-');
  write(path.join(project, 'docs', '方法', '项目工作法.md'), '# already there\n');

  assert.throws(
    () => initCli.run({ project, templateDir: template }),
    /already has project-method|已经.*项目工作法/
  );
  assert.strictEqual(fs.existsSync(path.join(project, 'scripts', 'board.mjs')), false);
});

test('init-project-method copies skeleton into an empty project', () => {
  const template = seedTemplate(tmp('pm-template-'));
  const project = tmp('pm-project-');

  const result = initCli.run({ project, templateDir: template });

  assert.ok(fs.existsSync(path.join(project, 'docs', '方法', '项目工作法.md')));
  assert.match(fs.readFileSync(path.join(project, 'docs', '方法', '项目工作法.md'), 'utf8'), /template body/);
  assert.ok(fs.existsSync(path.join(project, 'docs', '能力', '.gitkeep')));
  assert.ok(fs.existsSync(path.join(project, 'docs', '看板', 'items', '.gitkeep')));
  assert.ok(fs.existsSync(path.join(project, 'scripts', 'board.mjs')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'rules', '项目工作法.mdc')));
  assert.ok(fs.existsSync(path.join(project, '.cursor', 'skills', 'project-method', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(project, '.claude', 'rules', '项目工作法.md')));
  assert.ok(fs.existsSync(path.join(project, '.myrules-context.md')));
  assert.ok(fs.existsSync(path.join(project, 'README.md')));
  assert.ok(fs.existsSync(path.join(project, 'package.json')));
  const pkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.type, 'module');
  assert.strictEqual(pkg.scripts.board, 'node scripts/board.mjs');
  assert.strictEqual(pkg.scripts['board:server'], 'node scripts/board-server.mjs');
  assert.ok(!fs.existsSync(path.join(project, '.cursor', 'rules', '红线.mdc')));
  assert.ok(!fs.readdirSync(path.join(project, '.cursor', 'rules')).some((n) => n.startsWith('myrules-')));
  assert.ok(result.copied.length > 0);
});

test('init-project-method --force overwrites skeleton files', () => {
  const template = seedTemplate(tmp('pm-template-'));
  const project = tmp('pm-project-');
  write(path.join(project, 'docs', '方法', '项目工作法.md'), '# old\n');

  initCli.run({ project, templateDir: template, force: true });

  assert.match(fs.readFileSync(path.join(project, 'docs', '方法', '项目工作法.md'), 'utf8'), /template body/);
});

test('init-project-method does not overwrite existing README or .myrules-context.md', () => {
  const template = seedTemplate(tmp('pm-template-'));
  const project = tmp('pm-project-');
  write(path.join(project, 'README.md'), '# Existing App\n');
  write(path.join(project, '.myrules-context.md'), '当前目的：已有目的\n');

  initCli.run({ project, templateDir: template });

  assert.strictEqual(fs.readFileSync(path.join(project, 'README.md'), 'utf8'), '# Existing App\n');
  assert.strictEqual(fs.readFileSync(path.join(project, '.myrules-context.md'), 'utf8'), '当前目的：已有目的\n');
});

test('init-project-method --force still leaves existing README and .myrules-context.md', () => {
  const template = seedTemplate(tmp('pm-template-'));
  const project = tmp('pm-project-');
  write(path.join(project, 'docs', '方法', '项目工作法.md'), '# old\n');
  write(path.join(project, 'README.md'), '# Keep me\n');
  write(path.join(project, '.myrules-context.md'), 'keep purpose\n');

  initCli.run({ project, templateDir: template, force: true });

  assert.strictEqual(fs.readFileSync(path.join(project, 'README.md'), 'utf8'), '# Keep me\n');
  assert.strictEqual(fs.readFileSync(path.join(project, '.myrules-context.md'), 'utf8'), 'keep purpose\n');
});

test('init-project-method merges board scripts into existing package.json', () => {
  const template = seedTemplate(tmp('pm-template-'));
  const project = tmp('pm-project-');
  write(
    path.join(project, 'package.json'),
    JSON.stringify({ name: 'app', scripts: { start: 'node index.js', board: 'old' } }, null, 2) + '\n'
  );

  initCli.run({ project, templateDir: template });

  const pkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.name, 'app');
  assert.strictEqual(pkg.scripts.start, 'node index.js');
  assert.strictEqual(pkg.scripts.board, 'old');
  assert.strictEqual(pkg.scripts['board:server'], 'node scripts/board-server.mjs');
  assert.strictEqual(pkg.scripts.improvements, 'node scripts/board.mjs');
});

test('bundled template has method docs, board scripts, and no 红线 files', () => {
  const dir = path.join(REPO_ROOT, 'templates', 'project-method');
  assert.ok(fs.existsSync(path.join(dir, 'docs', '方法', '项目工作法.md')));
  assert.ok(fs.existsSync(path.join(dir, 'scripts', 'board.mjs')));
  assert.ok(fs.existsSync(path.join(dir, 'scripts', 'board-io.mjs')));
  assert.ok(fs.existsSync(path.join(dir, 'scripts', 'board-server.mjs')));
  assert.ok(fs.existsSync(path.join(dir, '.cursor', 'skills', 'project-method', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'project-method', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(dir, '.myrules-context.md')));
  assert.strictEqual(fs.existsSync(path.join(dir, '.cursor', 'rules', '红线.mdc')), false);
  assert.strictEqual(fs.existsSync(path.join(dir, 'docs', '红线.md')), false);
  assert.strictEqual(fs.existsSync(path.join(dir, 'README.md')), false);
  assert.strictEqual(fs.existsSync(path.join(dir, 'package.json')), false);
});
