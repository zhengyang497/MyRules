const BOTH = ['agent', 'project'];

module.exports = {
  version: 1,
  repo: "https://github.com/zhengyang497/MyRules.git",
  platforms: ["cursor", "claude", "opencode"],

  managedPrefix: "myrules-",

  protect: {
    paths: [
      "CLAUDE.md",
      ".claude/CLAUDE.md",
      "~/.claude/CLAUDE.md",
      "CLAUDE.local.md",
      "AGENTS.md",
      "~/.claude/projects/**/memory/**",
      "~/.claude/memory/**",
      ".myrules-context.md",
      "README.md",
      "docs/能力/**",
      "docs/设计目标检查清单.md",
      "docs/看板/items/**",
      "docs/方法/项目工作法.md",
      "ledger/board/**",
      "ledger/ops/**",
      "ledger/STATUS.md",
      "ledger/PURPOSE.draft.md",
      "ledger/GOALS.draft.md",
    ],
  },

  prune: {
    flag: "--prune-legacy-rules",
    backupDir: ".myrules-backup",
    requireDryRunFirst: true,
    targets: [
      ".cursor/rules/*.mdc",
      ".claude/rules/*.md",
      ".cursorrules",
      ".cursor/rules/imported/**",
    ],
  },

  deploy: {
    gitignoreDeployArtifacts: true,
  },

  bootstrap: {
    skillSource: "skills/myrules/SKILL.md",
    skillDir: "skills/myrules",
    cursor: { skillDir: ".cursor/skills/myrules" },
    claude: { skillDir: ".claude/skills/myrules" },
    overwriteSkill: "if_changed",
    commitSkillToGit: true,
  },

  cursor: {
    userRulesVia: "project_always_apply",
    extension: ".mdc",
  },

  claude: {
    userRulesDir: "~/.claude/rules",
    projectRulesDir: ".claude/rules",
    extension: ".md",
    hookInfix: "hook-",
  },

  opencode: {
    projectRulesDir: ".opencode/rules",
    userRulesDir: "~/.config/opencode/rules",
    userConfigDir: "~/.config/opencode",
    projectConfigFile: "opencode.json",
    userConfigFile: "~/.config/opencode/opencode.json",
    extension: ".md",
    agentsDir: ".opencode/agents",
    projectInstructionsGlob: ".opencode/rules/myrules-*.md",
    userInstructionsGlob: "rules/myrules-user-*.md",
  },

  method: {
    files: [
      { src: "method/core/项目工作法.md", dest: "docs/方法/myrules-项目工作法.md", runtimes: BOTH },
      { src: "method/agent/runtime.md", dest: "docs/方法/myrules-runtime.md", runtimes: ["agent"] },
      { src: "method/project/runtime.md", dest: "docs/方法/myrules-runtime.md", runtimes: ["project"] },
      { src: "method/project/coordinator.md", dest: "docs/方法/myrules-coordinator.md", runtimes: ["project"] },
      { src: "method/project/ledger.schema.md", dest: "docs/方法/myrules-ledger.schema.md", runtimes: ["project"] },
      { src: "method/project/FIRST-MESSAGE.md", dest: "docs/方法/myrules-first-message.md", runtimes: ["project"] },
      {
        src: "method/agent/rules/myrules-method-agent.mdc",
        dest: ".cursor/rules/myrules-method-agent.mdc",
        runtimes: ["agent"],
        kind: "cursor-rule",
      },
      {
        src: "method/agent/rules/myrules-method-agent.mdc",
        dest: ".claude/rules/myrules-method-agent.md",
        runtimes: ["agent"],
        kind: "claude-rule",
      },
      {
        src: "method/project/rules/myrules-method-coordinator.mdc",
        dest: ".cursor/rules/myrules-method-coordinator.mdc",
        runtimes: ["project"],
        kind: "cursor-rule",
      },
      {
        src: "method/project/rules/myrules-method-coordinator.mdc",
        dest: ".claude/rules/myrules-method-coordinator.md",
        runtimes: ["project"],
        kind: "claude-rule",
      },
      { srcDir: "method/skills/project-method", destDir: ".cursor/skills/project-method", runtimes: BOTH },
      { srcDir: "method/skills/project-method", destDir: ".claude/skills/project-method", runtimes: BOTH },
      { src: "method/core/templates/设计目标.md", dest: ".cursor/skills/project-method/templates/设计目标.md", runtimes: BOTH },
      { src: "method/core/templates/检查清单.md", dest: ".cursor/skills/project-method/templates/检查清单.md", runtimes: BOTH },
      { src: "method/core/templates/看板卡片.md", dest: ".cursor/skills/project-method/templates/看板卡片.md", runtimes: BOTH },
      { src: "method/core/templates/设计目标.md", dest: ".claude/skills/project-method/templates/设计目标.md", runtimes: BOTH },
      { src: "method/core/templates/检查清单.md", dest: ".claude/skills/project-method/templates/检查清单.md", runtimes: BOTH },
      { src: "method/core/templates/看板卡片.md", dest: ".claude/skills/project-method/templates/看板卡片.md", runtimes: BOTH },
      { src: "method/agent/scripts/myrules-board.mjs", dest: "scripts/myrules-board.mjs", runtimes: BOTH },
      { src: "method/agent/scripts/myrules-board-io.mjs", dest: "scripts/myrules-board-io.mjs", runtimes: BOTH },
      { src: "method/agent/scripts/myrules-board-server.mjs", dest: "scripts/myrules-board-server.mjs", runtimes: BOTH },
      { src: "method/agent/scripts/myrules-goal-ledger.mjs", dest: "scripts/myrules-goal-ledger.mjs", runtimes: BOTH },
    ],
  },

  agents: {
    roles: {
      planner: {
        description:
          "Plans work: clarify requirements, decompose tasks, define scope. Use before implementation.",
        readonly: true,
        model: "inherit",
      },
      researcher: {
        description:
          "Read-only researcher: report code facts only. Do not conclude what we should build.",
        readonly: true,
        model: "inherit",
      },
      implementer: {
        description: "Implements approved plans: write code, run tests, minimal scope.",
        readonly: false,
        model: "inherit",
      },
      reviewer: {
        description: "Skeptical reviewer: verify claims, run tests, report pass/fail. Read-only.",
        readonly: true,
        model: "inherit",
      },
      publisher: {
        description:
          "Publishes human-approved goal drafts into git design-goal files and the checklist. Never invents goal sentences.",
        readonly: false,
        model: "inherit",
      },
    },
    byRuntime: {
      agent: ["planner", "implementer", "reviewer"],
      project: ["researcher", "implementer", "reviewer", "publisher"],
    },
    prefix: "myrules-",
    cursorDir: ".cursor/agents",
    claudeDir: ".claude/agents",
  },
};
