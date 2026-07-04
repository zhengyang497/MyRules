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
