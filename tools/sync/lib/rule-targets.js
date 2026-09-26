// tools/sync/lib/rule-targets.js
//
// 规则部署目标枚举 + 内容 transform：deploy.js（部署）与 reverse-map.js（捕获/反查）
// 共用这一份清单，保证「部署写哪里、产出什么」与「捕获查哪里」永不漂移。
const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');
const transform = require('./transform');
const loadManifest = require('./load-manifest');

function listMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
}

/**
 * 返回全部规则部署目标：
 * { abs: 目标绝对路径, stateKey: state.deployedHashes 的 key, sourceAbs: 缓存源,
 *   topic: 规则主题, emit: 'cursor' | 'body' }
 * user 规则 5 个目标（项目 cursor + 三个用户目录 + 项目 opencode），project 规则 4 个。
 * 带 `runtimes:` frontmatter 的规则只进 sub-agent 包，不部署、不枚举。
 */
function ruleTargets(cacheDir, projectRoot, opts = {}) {
  const manifest = opts.manifest || loadManifest.loadManifest(cacheDir);
  const prefix = manifest.managedPrefix;
  const userPrefix = `${prefix}user-`;
  const claudeUserDir = opts.claudeUserDir || paths.getClaudeUserRulesDir();
  const opencodeUserDir = opts.opencodeUserDir || paths.getOpencodeUserRulesDir();
  const dshUserDir = opts.dshUserDir || paths.getDshUserRulesDir();
  const cursorDir = paths.getCursorRulesDir(projectRoot);
  const claudeProjDir = paths.getClaudeProjectRulesDir(projectRoot);
  const opencodeProjDir = paths.getOpencodeProjectRulesDir(projectRoot);
  const dshProjDir = paths.getDshProjectRulesDir(projectRoot);

  const targets = [];
  for (const category of ['user', 'project']) {
    const srcDir = path.join(cacheDir, 'rules', category);
    for (const f of listMdFiles(srcDir)) {
      const topic = path.basename(f, '.md');
      const sourceAbs = path.join(srcDir, f);
      const raw = fs.readFileSync(sourceAbs, 'utf8');
      if (transform.parseRuleFrontmatter(raw).runtimes !== null) continue;

      const cursorName = category === 'user' ? `${userPrefix}${topic}.mdc` : `${prefix}${topic}.mdc`;
      targets.push({
        abs: path.join(cursorDir, cursorName),
        stateKey: path.posix.join('.cursor/rules', cursorName),
        sourceAbs,
        topic,
        emit: 'cursor',
      });

      const mdName = category === 'user' ? `${userPrefix}${topic}.md` : `${prefix}${topic}.md`;
      if (category === 'user') {
        targets.push({ abs: path.join(claudeUserDir, mdName), stateKey: `~claude-user~/${mdName}`, sourceAbs, topic, emit: 'body' });
        targets.push({ abs: path.join(opencodeUserDir, mdName), stateKey: `~opencode-user~/${mdName}`, sourceAbs, topic, emit: 'body' });
        // user 规则也进项目 .opencode/rules/：项目级 instructions glob（如
        // ".opencode/rules/myrules-*.md"）优先于全局 opencode.json 的配置。
        targets.push({ abs: path.join(opencodeProjDir, mdName), stateKey: path.posix.join('.opencode/rules', mdName), sourceAbs, topic, emit: 'body' });
        // dsh 用户规则只进用户目录（~/.dsh/AGENTS.md 管理块常驻，无需复制进项目）
        targets.push({ abs: path.join(dshUserDir, mdName), stateKey: `~dsh-user~/${mdName}`, sourceAbs, topic, emit: 'body' });
      } else {
        targets.push({ abs: path.join(claudeProjDir, mdName), stateKey: path.posix.join('.claude/rules', mdName), sourceAbs, topic, emit: 'body' });
        targets.push({ abs: path.join(opencodeProjDir, mdName), stateKey: path.posix.join('.opencode/rules', mdName), sourceAbs, topic, emit: 'body' });
        targets.push({ abs: path.join(dshProjDir, mdName), stateKey: path.posix.join('.dsh/rules', mdName), sourceAbs, topic, emit: 'body' });
      }
    }
  }
  return targets;
}

// 部署写入目标文件的精确字节：cursor 目标带生成头，其余为正文
function emittedRuleContent(target, rawSourceText) {
  const body = transform.parseRuleFrontmatter(rawSourceText).body;
  return target.emit === 'cursor' ? transform.transformForCursor(body, target.topic) : body;
}

module.exports = { ruleTargets, emittedRuleContent };
