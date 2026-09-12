#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const paths = require('./lib/paths');

const MARKER_REL = path.join('docs', '方法', '项目工作法.md');
const SKIP_BASENAMES = new Set(['package.json', 'README.md']);
const BOARD_SCRIPTS = {
  board: 'node scripts/board.mjs',
  improvements: 'node scripts/board.mjs',
  'board:server': 'node scripts/board-server.mjs',
  'improvements:server': 'node scripts/board-server.mjs',
};
const README_STUB = `# 项目名称

（用一句话说明本项目是做什么的、解决谁的什么问题。）
`;

function getBundledTemplateDir() {
  return path.join(__dirname, '..', '..', 'templates', 'project-method');
}

function parseArgs(argv) {
  const args = { project: null, templateDir: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') args.project = argv[++i];
    else if (argv[i] === '--template-dir') args.templateDir = argv[++i];
    else if (argv[i] === '--force') args.force = true;
  }
  return args;
}

function listFilesRecursive(root) {
  const out = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) out.push(abs);
    }
  }
  walk(root);
  return out;
}

function alreadyInitialized(projectRoot) {
  return fs.existsSync(path.join(projectRoot, MARKER_REL));
}

function isRootName(rel, name) {
  return path.basename(rel) === name && path.dirname(rel) === '.';
}

function mergePackageJson(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  const existed = fs.existsSync(pkgPath);
  const pkg = existed ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : { private: true, type: 'module' };
  if (!pkg.scripts || typeof pkg.scripts !== 'object') pkg.scripts = {};
  for (const [key, value] of Object.entries(BOARD_SCRIPTS)) {
    if (!pkg.scripts[key]) pkg.scripts[key] = value;
  }
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function writeReadmeIfMissing(projectRoot) {
  const readmePath = path.join(projectRoot, 'README.md');
  if (!fs.existsSync(readmePath)) fs.writeFileSync(readmePath, README_STUB);
}

function run(opts = {}) {
  const projectRoot = paths.getProjectRoot(opts.project);
  const templateDir = path.resolve(opts.templateDir || getBundledTemplateDir());
  const force = Boolean(opts.force);

  if (!fs.existsSync(templateDir)) {
    throw new Error(`project-method template missing: ${templateDir}`);
  }
  if (!fs.existsSync(path.join(templateDir, MARKER_REL))) {
    throw new Error(`project-method template missing ${MARKER_REL.replace(/\\/g, '/')}: ${templateDir}`);
  }

  if (alreadyInitialized(projectRoot) && !force) {
    throw new Error(
      `Project already has project-method files (${MARKER_REL.replace(/\\/g, '/')}). Pass --force to overwrite the skeleton (README.md and .myrules-context.md are still left alone if present).`
    );
  }

  const copied = [];
  const skipped = [];
  for (const abs of listFilesRecursive(templateDir)) {
    const rel = path.relative(templateDir, abs);
    const base = path.basename(rel);
    if (SKIP_BASENAMES.has(base)) {
      skipped.push(rel);
      continue;
    }
    const dest = path.join(projectRoot, rel);
    if (isRootName(rel, '.myrules-context.md') && fs.existsSync(dest)) {
      skipped.push(rel);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(abs, dest);
    copied.push(rel);
  }

  mergePackageJson(projectRoot);
  writeReadmeIfMissing(projectRoot);

  if (!opts.quiet) {
    console.log(`Initialized project-method skeleton in ${projectRoot}`);
    console.log(`Copied ${copied.length} files.`);
    console.log(
      'Write the current purpose in .myrules-context.md, then register the first board item: npm run board -- add --title "..."'
    );
  }

  return { copied, skipped, projectRoot };
}

if (require.main === module) {
  try {
    run(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { run, parseArgs, getBundledTemplateDir };
