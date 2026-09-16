#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const paths = require('./lib/paths');
const runtimeLib = require('./lib/runtime');
const loadManifest = require('./lib/load-manifest');

const CHECKLIST_REL = path.join('docs', '设计目标检查清单.md');
const OVERLAY_METHOD_REL = path.join('docs', '方法', '项目工作法.md');
const CONTEXT_REL = '.myrules-context.md';
const STATUS_CONSTRUCTION_HINT =
  '已有目标册。ledger/STATUS.md 仍是探路；要施工时请人改成可施工。不要自动翻闸门。';
const README_STUB = `# 项目名称

（用一句话说明本项目是做什么的、解决谁的什么问题。）
`;
const CONTEXT_STUB = `# 项目上下文

当前目的：（用一句话写本项目现在要做成的事。）

现行目标只认已出版的 git 文首和 \`docs/设计目标检查清单.md\`。落地位置见 \`docs/方法/myrules-runtime.md\`。通用红线在 MyRules 同步下来的行为规则里。

目的变了，先改这一句和对应那篇《功能名设计目标》的文首，再改代码。对话里说清楚了不算落地。口号进册要人点头。
`;
const CHECKLIST_STUB = `# 设计目标检查清单

> 派生表。措辞只认各篇《功能名设计目标》文首。人不要手改。改了文首，由模型在同一轮把对应行抄成一样。含状态（口号 / 做了一截 / 已做成）。状态标针对这句的动作做到哪，不是抽查或审计结论。不记某次对照结论。

| ID | 功能 | 目标 | 状态 | 对比时看什么 | 验证方式 | 项目 | 出处 |
|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |
`;
const HOSTED_SCRIPTS = {
  board: 'node scripts/myrules-board.mjs',
  improvements: 'node scripts/myrules-board.mjs',
  'board:server': 'node scripts/myrules-board-server.mjs',
  'improvements:server': 'node scripts/myrules-board-server.mjs',
};
const LEGACY_BOARD_SCRIPTS = new Set([
  'node scripts/board.mjs',
  'node scripts/board-server.mjs',
]);

function getBundledTemplateDir() {
  return path.join(__dirname, '..', '..', 'method');
}

function parseArgs(argv) {
  const args = { project: null, runtime: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') args.project = argv[++i];
    else if (argv[i] === '--runtime') args.runtime = argv[++i];
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--template-dir') i += 1;
  }
  return args;
}

function listMarkdownFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) listMarkdownFiles(abs, acc);
    else if (ent.isFile() && ent.name.endsWith('.md')) acc.push(abs);
  }
  return acc;
}

function checklistHasGoals(text) {
  return String(text)
    .split(/\r?\n/)
    .some((line) => {
      const m = line.match(/^\|\s*([^|]+)\|/);
      if (!m) return false;
      const id = m[1].trim();
      return id && id !== 'ID' && !/^-+$/.test(id);
    });
}

function hasExistingGoalShelf(projectRoot) {
  if (fs.existsSync(path.join(projectRoot, OVERLAY_METHOD_REL))) return true;
  const checklist = path.join(projectRoot, CHECKLIST_REL);
  if (fs.existsSync(checklist) && checklistHasGoals(fs.readFileSync(checklist, 'utf8'))) return true;
  return listMarkdownFiles(path.join(projectRoot, 'docs', '能力')).length > 0;
}

function writeIfMissing(abs, content) {
  if (fs.existsSync(abs)) return false;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return true;
}

function ensureDir(abs) {
  fs.mkdirSync(abs, { recursive: true });
}

function mergePackageJson(projectRoot) {
  if (runtimeLib.hasInstanceLanding(projectRoot)) return;
  const pkgPath = path.join(projectRoot, 'package.json');
  const existed = fs.existsSync(pkgPath);
  const pkg = existed ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : { private: true, type: 'module' };
  if (!pkg.scripts || typeof pkg.scripts !== 'object') pkg.scripts = {};
  for (const [key, value] of Object.entries(HOSTED_SCRIPTS)) {
    if (!pkg.scripts[key] || LEGACY_BOARD_SCRIPTS.has(pkg.scripts[key])) {
      pkg.scripts[key] = value;
    }
  }
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function writeReadmeIfMissing(projectRoot) {
  writeIfMissing(path.join(projectRoot, 'README.md'), README_STUB);
}

function mergeEnvironment(projectRoot, repoUrl) {
  const dest = path.join(projectRoot, '.cursor', 'environment.json');
  const snippet =
    `if [ ! -d "$HOME/.myrules" ]; then git clone --depth 1 ${repoUrl} "$HOME/.myrules"; fi\n` +
    `node "$HOME/.myrules/tools/sync/sync.js" --project "$PWD"`;
  let existing = {};
  if (fs.existsSync(dest)) {
    try {
      existing = JSON.parse(fs.readFileSync(dest, 'utf8'));
    } catch {
      existing = {};
    }
  }
  if (typeof existing.install === 'string' && existing.install.includes('sync.js --project')) {
    return;
  }
  if (typeof existing.install === 'string' && existing.install.trim()) {
    existing.install = `${existing.install.replace(/\s*$/, '')}\n${snippet}\n`;
  } else {
    existing.install = `${snippet}\n`;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(existing, null, 2)}\n`);
}

function ensureLedger(projectRoot) {
  writeIfMissing(
    path.join(projectRoot, 'ledger', 'STATUS.md'),
    '# STATUS\n\n闸门：探路\n\n当前在派：无\n'
  );
  writeIfMissing(
    path.join(projectRoot, 'ledger', 'PURPOSE.draft.md'),
    '# PURPOSE.draft\n\n（正在聊的目的句。未点头、未出版，不是现行规格。）\n'
  );
  writeIfMissing(
    path.join(projectRoot, 'ledger', 'GOALS.draft.md'),
    '# GOALS.draft\n\n（正在聊的目标表。条目标 draft | 已点头待出版 | 已出版 → docs/…）\n'
  );
  writeIfMissing(path.join(projectRoot, 'ledger', 'board', '.gitkeep'), '');
  writeIfMissing(path.join(projectRoot, 'ledger', 'ops', '.gitkeep'), '');
}

function ensureInstance(projectRoot, runtime) {
  ensureDir(path.join(projectRoot, 'docs', '能力'));
  ensureDir(path.join(projectRoot, 'docs', '看板', 'items'));
  writeIfMissing(path.join(projectRoot, 'docs', '能力', '.gitkeep'), '');
  writeIfMissing(path.join(projectRoot, 'docs', '看板', 'items', '.gitkeep'), '');
  writeIfMissing(path.join(projectRoot, CHECKLIST_REL), CHECKLIST_STUB);
  writeIfMissing(path.join(projectRoot, CONTEXT_REL), CONTEXT_STUB);
  writeReadmeIfMissing(projectRoot);
  mergePackageJson(projectRoot);
  if (runtime === 'project') ensureLedger(projectRoot);
}

function run(opts = {}) {
  const projectRoot = paths.getProjectRoot(opts.project);
  const runtime = opts.runtime;
  const force = Boolean(opts.force);

  if (!runtimeLib.VALID_RUNTIMES.has(runtime)) {
    throw new Error(
      'Pass --runtime agent (布置普通仓库) or --runtime project (布置 Project 仓库). Do not default.'
    );
  }

  const current = runtimeLib.readRuntimeFile(projectRoot);
  if (current === runtime && !force) {
    throw new Error(
      `Already arranged as ${runtime}. Use sync instead of arranging again. Pass --force only to rewrite hosted method files (instance ledger/goals are still left alone).`
    );
  }

  const alreadyHadGoals = hasExistingGoalShelf(projectRoot);
  runtimeLib.writeRuntimeFile(projectRoot, runtime);
  ensureInstance(projectRoot, runtime);

  if (runtime === 'project') {
    const cacheDir = opts.cacheDir || paths.getCacheDir();
    const manifest = loadManifest.loadManifest(cacheDir);
    mergeEnvironment(projectRoot, manifest.repo);
  }

  const sync = require('./sync');
  const syncResult = sync.run({
    ...opts,
    project: projectRoot,
    force,
  });

  if (runtime === 'project' && alreadyHadGoals && !opts.quiet) {
    console.log(STATUS_CONSTRUCTION_HINT);
  }

  if (!opts.quiet) {
    console.log(`Arranged ${runtime} runtime in ${projectRoot}`);
    if (runtime === 'project') {
      const firstMessage = path.join(projectRoot, 'docs', '方法', 'myrules-first-message.md');
      if (fs.existsSync(firstMessage)) {
        console.log('\n--- First message for Cursor Project ---\n');
        console.log(fs.readFileSync(firstMessage, 'utf8').trim());
        console.log('\n--- end first message ---\n');
      }
    }
  }

  return {
    projectRoot,
    runtime,
    switched: Boolean(current) && current !== runtime,
    syncResult,
    alreadyHadGoals,
  };
}

if (require.main === module) {
  try {
    run(parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = {
  run,
  parseArgs,
  getBundledTemplateDir,
  mergeEnvironment,
  HOSTED_SCRIPTS,
  hasExistingGoalShelf,
  STATUS_CONSTRUCTION_HINT,
};
