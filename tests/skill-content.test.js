const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers/cache-seed');

const SKILL_DIR = path.join(REPO_ROOT, 'skills', 'myrules');
const REQUIRED_FILES = ['SKILL.md', 'REFERENCE.md', 'COMMANDS.md'];

test('skill bundle includes required markdown files', () => {
  for (const file of REQUIRED_FILES) {
    assert.ok(fs.existsSync(path.join(SKILL_DIR, file)), `missing skills/myrules/${file}`);
  }
});

test('SKILL.md routes 布置 ordinary vs Project and does not default vague 布置 to agent', () => {
  const content = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
  assert.match(content, /布置普通仓库/);
  assert.match(content, /布置 Project 仓库/);
  assert.match(content, /普通 Agent 还是 Project/);
  assert.doesNotMatch(content, /copy-once|Copied files are project-owned forever/i);
});

test('SKILL.md has valid frontmatter and bootstrap completion criteria', () => {
  const content = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
  assert.match(content, /^---[\s\S]*?^name: myrules$/m);
  assert.match(content, /^description:/m);
  assert.match(content, /\*\*cache\*\*/);
  assert.match(content, /\*\*artifacts\*\*/);
  assert.match(content, /\*\*bootstrap\*\*/);
  assert.match(content, /Done when:/i);
  assert.match(content, /lastSyncAt/);
  assert.match(content, /REFERENCE\.md/);
  assert.match(content, /COMMANDS\.md/);
});
