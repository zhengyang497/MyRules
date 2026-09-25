const BOTH = ['agent', 'project'];

module.exports = {
  version: 1,
  repo: "https://github.com/zhengyang497/MyRules.git",
  platforms: ["cursor", "claude", "opencode", "dsh"],

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
    dsh: { skillDir: ".dsh/skills/myrules" },
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

  dsh: {
    projectRulesDir: ".dsh/rules",
    userRulesDir: "~/.dsh/rules",
    extension: ".md",
    projectSkillsDir: ".dsh/skills",
    userSkillsDir: "~/.dsh/skills",
    projectAgentsDir: ".dsh/agents",
    // 项目侧管理块落在 AGENTS.local.md（dsh 的本地覆盖层，随 AGENTS.md 链加载）：
    // AGENTS.md / CLAUDE.md 是保护清单文件，MyRules 一个字节都不碰。
    agentsFile: "AGENTS.local.md",
    // 用户级只有固定入口 ~/.dsh/AGENTS.md（dsh 无 local 覆盖层），管理块写这里
    userAgentsFile: "~/.dsh/AGENTS.md",
    blockBegin: "<!-- myrules:begin -->",
    blockEnd: "<!-- myrules:end -->",
    // 角色委派工具行（dsh-tool-subagent）的脚手架产物，不主动写用户 profile
    rolesRowsFile: ".dsh/roles-tool-rows.yml",
  },

  method: {
    files: [
      { src: "method/core/项目工作法.md", dest: "docs/方法/myrules-项目工作法.md", runtimes: BOTH },
      { src: "method/agent/runtime.md", dest: "docs/方法/myrules-runtime.md", runtimes: ["agent"], instanceOwned: "drop" },
      { src: "method/project/runtime.md", dest: "docs/方法/myrules-runtime.md", runtimes: ["project"], instanceOwned: "drop" },
      { src: "method/project/coordinator.md", dest: "docs/方法/myrules-coordinator.md", runtimes: ["project"] },
      { src: "method/project/ledger.schema.md", dest: "docs/方法/myrules-ledger.schema.md", runtimes: ["project"] },
      { src: "method/project/FIRST-MESSAGE.md", dest: "docs/方法/myrules-first-message.md", runtimes: ["project"] },
      {
        src: "method/core/rules/myrules-method-small.mdc",
        dest: ".cursor/rules/myrules-method-small.mdc",
        runtimes: BOTH,
        kind: "cursor-rule",
      },
      {
        src: "method/core/rules/myrules-method-small.mdc",
        dest: ".claude/rules/myrules-method-small.md",
        runtimes: BOTH,
        kind: "claude-rule",
      },
      {
        src: "method/core/rules/myrules-method-session.mdc",
        dest: ".cursor/rules/myrules-method-session.mdc",
        runtimes: BOTH,
        kind: "cursor-rule",
      },
      {
        src: "method/core/rules/myrules-method-session.mdc",
        dest: ".claude/rules/myrules-method-session.md",
        runtimes: BOTH,
        kind: "claude-rule",
      },
      {
        src: "method/agent/rules/myrules-method-agent.mdc",
        dest: ".cursor/rules/myrules-method-agent.mdc",
        runtimes: ["agent"],
        kind: "cursor-rule",
        instanceOwned: "drop",
      },
      {
        src: "method/agent/rules/myrules-method-agent.mdc",
        dest: ".claude/rules/myrules-method-agent.md",
        runtimes: ["agent"],
        kind: "claude-rule",
        instanceOwned: "drop",
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
      {
        src: "method/core/rules/myrules-method-small.mdc",
        dest: ".dsh/rules/myrules-method-small.md",
        runtimes: BOTH,
        kind: "dsh-rule",
      },
      {
        src: "method/core/rules/myrules-method-session.mdc",
        dest: ".dsh/rules/myrules-method-session.md",
        runtimes: BOTH,
        kind: "dsh-rule",
      },
      {
        src: "method/agent/rules/myrules-method-agent.mdc",
        dest: ".dsh/rules/myrules-method-agent.md",
        runtimes: ["agent"],
        kind: "dsh-rule",
        instanceOwned: "drop",
      },
      {
        src: "method/project/rules/myrules-method-coordinator.mdc",
        dest: ".dsh/rules/myrules-method-coordinator.md",
        runtimes: ["project"],
        kind: "dsh-rule",
      },
      { srcDir: "method/skills/project-method", destDir: ".cursor/skills/project-method", runtimes: BOTH, instanceOwned: "preserve" },
      { srcDir: "method/skills/project-method", destDir: ".claude/skills/project-method", runtimes: BOTH, instanceOwned: "preserve" },
      { srcDir: "method/skills/project-method", destDir: ".dsh/skills/project-method", runtimes: BOTH, instanceOwned: "preserve" },
      { src: "method/core/templates/设计目标.md", dest: ".cursor/skills/project-method/templates/设计目标.md", runtimes: BOTH, instanceOwned: "preserve" },
      { src: "method/core/templates/检查清单.md", dest: ".cursor/skills/project-method/templates/检查清单.md", runtimes: BOTH, instanceOwned: "preserve" },
      { src: "method/core/templates/看板卡片.md", dest: ".cursor/skills/project-method/templates/看板卡片.md", runtimes: BOTH, instanceOwned: "preserve" },
      { src: "method/core/templates/设计目标.md", dest: ".claude/skills/project-method/templates/设计目标.md", runtimes: BOTH, instanceOwned: "preserve" },
      { src: "method/core/templates/检查清单.md", dest: ".claude/skills/project-method/templates/检查清单.md", runtimes: BOTH, instanceOwned: "preserve" },
      { src: "method/core/templates/看板卡片.md", dest: ".claude/skills/project-method/templates/看板卡片.md", runtimes: BOTH, instanceOwned: "preserve" },
      { src: "method/core/templates/设计目标.md", dest: ".dsh/skills/project-method/templates/设计目标.md", runtimes: BOTH, instanceOwned: "preserve" },
      { src: "method/core/templates/检查清单.md", dest: ".dsh/skills/project-method/templates/检查清单.md", runtimes: BOTH, instanceOwned: "preserve" },
      { src: "method/core/templates/看板卡片.md", dest: ".dsh/skills/project-method/templates/看板卡片.md", runtimes: BOTH, instanceOwned: "preserve" },
      { src: "method/agent/scripts/myrules-board.mjs", dest: "scripts/myrules-board.mjs", runtimes: BOTH, instanceOwned: "drop" },
      { src: "method/agent/scripts/myrules-board-io.mjs", dest: "scripts/myrules-board-io.mjs", runtimes: BOTH, instanceOwned: "drop" },
      { src: "method/agent/scripts/myrules-board-server.mjs", dest: "scripts/myrules-board-server.mjs", runtimes: BOTH, instanceOwned: "drop" },
      { src: "method/agent/scripts/myrules-goal-ledger.mjs", dest: "scripts/myrules-goal-ledger.mjs", runtimes: BOTH, instanceOwned: "drop" },
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
