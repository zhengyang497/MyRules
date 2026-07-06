module.exports = {
  version: 1,
  repo: "https://github.com/zhengyang497/MyRules.git",
  platforms: ["cursor", "claude"],

  managedPrefix: "myrules-",

  protect: {
    paths: [
      "CLAUDE.md",
      ".claude/CLAUDE.md",
      "CLAUDE.local.md",
      "AGENTS.md",
      "~/.claude/projects/**/memory/**",
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

  agents: {
    roles: {
      planner: {
        description:
          "Plans work: clarify requirements, decompose tasks, define scope. Use before implementation.",
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
    },
    prefix: "myrules-",
    cursorDir: ".cursor/agents",
    claudeDir: ".claude/agents",
  },
};
